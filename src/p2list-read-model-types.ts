import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { P2ListErrorCode } from "./p2list-contract.js";

export type P2ListResource = "employee" | "lifecycleRequest";
export type P2ListDirection = "asc" | "desc";
export type P2ListSource =
  | "person"
  | "employment"
  | "assignment"
  | "transaction_request"
  | "audit_event";

export class P2ListReadModelError extends Error {
  readonly code: P2ListErrorCode;

  constructor(code: P2ListErrorCode, message: string) {
    super(message);
    this.name = "P2ListReadModelError";
    this.code = code;
  }
}

export interface P2ListDataScope {
  organizationCodes?: readonly string[];
  personIds?: readonly string[];
  employeeIds?: readonly string[];
  correlationIds?: readonly string[];
}

export interface P2ListActorContext {
  actorId: string;
  tenantId: string;
  permissions: readonly string[];
  dataScope: P2ListDataScope;
}

export interface P2ListSyntheticDatasetManifest {
  evidenceType: "repo_owned_synthetic_fixture";
  datasetReference: string;
  tenantEnvironmentId: "repo_owned_synthetic_p2list";
  sourceRowPrimaryKeys: Record<P2ListSource, readonly string[]>;
  integrity: {
    algorithm: "hmac_sha256";
    value: string;
  };
}

const verifiedDatasetMarker = Symbol("verified-p2list-synthetic-dataset");
const p2ListSources = [
  "person",
  "employment",
  "assignment",
  "transaction_request",
  "audit_event",
] as const satisfies readonly P2ListSource[];

export class P2ListVerifiedSyntheticDataset {
  readonly [verifiedDatasetMarker] = true;
  readonly datasetReference: string;
  readonly fingerprint: string;
  readonly tenantEnvironmentId = "repo_owned_synthetic_p2list" as const;
  readonly #sourceRowPrimaryKeys: ReadonlyMap<
    P2ListSource,
    ReadonlySet<string>
  >;

  constructor(
    marker: typeof verifiedDatasetMarker,
    datasetReference: string,
    sourceRowPrimaryKeys: ReadonlyMap<P2ListSource, ReadonlySet<string>>,
    fingerprint: string,
  ) {
    if (marker !== verifiedDatasetMarker) {
      throw dataScopeDenied();
    }
    this.datasetReference = datasetReference;
    this.#sourceRowPrimaryKeys = sourceRowPrimaryKeys;
    this.fingerprint = fingerprint;
  }

  has(source: P2ListSource, id: string): boolean {
    return this.#sourceRowPrimaryKeys.get(source)?.has(id) ?? false;
  }

  values(source: P2ListSource): readonly string[] {
    return [...(this.#sourceRowPrimaryKeys.get(source) ?? [])];
  }
}

export function verifyP2ListSyntheticDatasetManifest(
  input: unknown,
  secret: string,
): P2ListVerifiedSyntheticDataset {
  assertP2ListLocalSecret(secret);
  const manifest = requireRecord(
    input,
    "synthetic dataset manifest is required",
    "data_scope_denied",
  );
  assertExactKeys(manifest, [
    "evidenceType",
    "datasetReference",
    "tenantEnvironmentId",
    "sourceRowPrimaryKeys",
    "integrity",
  ]);
  if (manifest.evidenceType !== "repo_owned_synthetic_fixture") {
    throw dataScopeDenied();
  }
  if (manifest.tenantEnvironmentId !== "repo_owned_synthetic_p2list") {
    throw dataScopeDenied();
  }
  const datasetReference = requireBoundedString(
    manifest.datasetReference,
    1,
    256,
    "data_scope_denied",
  );
  const sourceRows = requireRecord(
    manifest.sourceRowPrimaryKeys,
    "synthetic dataset source bindings are required",
    "data_scope_denied",
  );
  assertExactKeys(sourceRows, p2ListSources);

  const normalizedSourceRows = {} as Record<P2ListSource, string[]>;
  const sourceSets = new Map<P2ListSource, ReadonlySet<string>>();
  for (const source of p2ListSources) {
    const values = requireUniqueStringArray(
      sourceRows[source],
      0,
      500,
      "data_scope_denied",
    );
    normalizedSourceRows[source] = values;
    sourceSets.set(source, new Set(values));
  }

  const integrity = requireRecord(
    manifest.integrity,
    "synthetic dataset integrity is required",
    "data_scope_denied",
  );
  assertExactKeys(integrity, ["algorithm", "value"]);
  if (integrity.algorithm !== "hmac_sha256") {
    throw dataScopeDenied();
  }
  const suppliedMac = decodeBase64Url(integrity.value);
  const canonicalBody = canonicalizeP2ListValue({
    evidenceType: "repo_owned_synthetic_fixture",
    datasetReference,
    tenantEnvironmentId: "repo_owned_synthetic_p2list",
    sourceRowPrimaryKeys: normalizedSourceRows,
  });
  const expectedMac = createHmac("sha256", secret)
    .update(canonicalBody)
    .digest();
  if (
    suppliedMac.length !== expectedMac.length ||
    !timingSafeEqual(suppliedMac, expectedMac)
  ) {
    throw dataScopeDenied();
  }

  return new P2ListVerifiedSyntheticDataset(
    verifiedDatasetMarker,
    datasetReference,
    sourceSets,
    createHash("sha256").update(canonicalBody).digest("base64url"),
  );
}

export function signP2ListSyntheticDatasetManifest(
  body: Omit<P2ListSyntheticDatasetManifest, "integrity">,
  secret: string,
): P2ListSyntheticDatasetManifest {
  assertP2ListLocalSecret(secret);
  const normalizedBody = {
    ...body,
    sourceRowPrimaryKeys: Object.fromEntries(
      p2ListSources.map((source) => [
        source,
        [...body.sourceRowPrimaryKeys[source]].sort(),
      ]),
    ) as Record<P2ListSource, string[]>,
  };
  const canonicalBody = canonicalizeP2ListValue(normalizedBody);
  return {
    ...normalizedBody,
    integrity: {
      algorithm: "hmac_sha256",
      value: createHmac("sha256", secret)
        .update(canonicalBody)
        .digest("base64url"),
    },
  };
}

export function assertP2ListLocalSecret(secret: string): void {
  if (
    typeof secret !== "string" ||
    secret.length < 32 ||
    /^(?:default|secret|test-secret|change-me)$/iu.test(secret)
  ) {
    throw new P2ListReadModelError(
      "data_scope_denied",
      "A non-default local synthetic key is required.",
    );
  }
}

export function fingerprintP2ListValue(value: unknown): string {
  return createHash("sha256")
    .update(canonicalizeP2ListValue(value))
    .digest("base64url");
}

export function canonicalizeP2ListValue(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeP2ListValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalizeP2ListValue(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new TypeError("canonical JSON supports JSON values only");
}

export function requireUniqueStringArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  code: P2ListErrorCode,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    value.length > maximumLength
  ) {
    throw new P2ListReadModelError(code, "The bounded list input is invalid.");
  }
  const normalized = value.map((entry) =>
    requireBoundedString(entry, 1, 256, code),
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new P2ListReadModelError(code, "The bounded list input is invalid.");
  }
  return normalized.sort();
}

export function requireBoundedString(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  code: P2ListErrorCode,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    value.trim() !== value
  ) {
    throw new P2ListReadModelError(code, "The bounded list input is invalid.");
  }
  return value;
}

export function requireRecord(
  value: unknown,
  message: string,
  code: P2ListErrorCode,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new P2ListReadModelError(code, message);
  }
  return value as Record<string, unknown>;
}

export function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  if (
    Object.keys(value).some((key) => !allowed.has(key)) ||
    allowedKeys.some((key) => !(key in value))
  ) {
    throw dataScopeDenied();
  }
}

function decodeBase64Url(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    value.length > 128
  ) {
    throw dataScopeDenied();
  }
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw dataScopeDenied();
  }
}

function dataScopeDenied(): P2ListReadModelError {
  return new P2ListReadModelError(
    "data_scope_denied",
    "The requested synthetic data scope is unavailable.",
  );
}
