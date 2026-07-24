import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import { P2ListCursorManager } from "./p2list-cursor.js";
import { P2ListReadModelRepository } from "./p2list-read-model-repository.js";
import {
  signP2ListSyntheticDatasetManifest,
  verifyP2ListSyntheticDatasetManifest,
  type P2ListActorContext,
  type P2ListDataScope,
  type P2ListSyntheticDatasetManifest,
} from "./p2list-read-model-types.js";
import type { P2ListEmployeeApiRuntime } from "./routes/p2list-employees.js";

const actorKeys = new Set(["actorId", "tenantId", "permissions", "dataScope"]);
const scopeKeys = new Set([
  "organizationCodes",
  "personIds",
  "employeeIds",
  "correlationIds",
]);

interface ActorRegistryEntry {
  tokenDigest: Buffer;
  actor: P2ListActorContext;
}

export async function createServerP2ListEmployeeRuntime(
  db: OnboardingTransactionRequestDatabase,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<P2ListEmployeeApiRuntime> {
  const provenance = await loadVerifiedProvenance(environment);
  const cursorSecret =
    readOptionalSecret(environment.P2LIST_EMPLOYEE_CURSOR_SECRET) ??
    createEphemeralSecret();
  const actors = parseActorRegistry(environment.P2LIST_EMPLOYEE_ACTORS_JSON);

  return {
    repository: new P2ListReadModelRepository(
      db,
      new P2ListCursorManager({ secret: cursorSecret }),
    ),
    provenance,
    resolveActor(request) {
      const token = readBearerToken(request.headers.authorization);
      if (!token) {
        return undefined;
      }
      const digest = digestToken(token);
      return actors.find((entry) => timingSafeEqual(entry.tokenDigest, digest))
        ?.actor;
    },
  };
}

async function loadVerifiedProvenance(
  environment: NodeJS.ProcessEnv,
): Promise<ReturnType<typeof verifyP2ListSyntheticDatasetManifest>> {
  const manifestPath = environment.P2LIST_EMPLOYEE_MANIFEST_PATH?.trim();
  const configuredSecret = readOptionalSecret(
    environment.P2LIST_EMPLOYEE_MANIFEST_SECRET,
  );
  if (manifestPath || configuredSecret) {
    if (!manifestPath || !configuredSecret) {
      throw new Error(
        "P2LIST employee manifest path and secret must be configured together.",
      );
    }
    const manifest = parseManifest(
      await readFile(manifestPath, { encoding: "utf8" }),
    );
    return verifyP2ListSyntheticDatasetManifest(manifest, configuredSecret);
  }

  const ephemeralSecret = createEphemeralSecret();
  return verifyP2ListSyntheticDatasetManifest(
    signP2ListSyntheticDatasetManifest(
      {
        evidenceType: "repo_owned_synthetic_fixture",
        datasetReference: "hrcore-local-empty-p2list",
        tenantEnvironmentId: "repo_owned_synthetic_p2list",
        sourceRowPrimaryKeys: {
          person: [],
          employment: [],
          assignment: [],
          transaction_request: [],
          audit_event: [],
        },
      },
      ephemeralSecret,
    ),
    ephemeralSecret,
  );
}

function parseManifest(value: string): P2ListSyntheticDatasetManifest {
  try {
    return JSON.parse(value) as P2ListSyntheticDatasetManifest;
  } catch {
    throw new Error("P2LIST employee manifest must be valid JSON.");
  }
}

function parseActorRegistry(value: string | undefined): ActorRegistryEntry[] {
  if (value === undefined || value.trim() === "") {
    return [];
  }
  if (value.length > 65_536) {
    throw invalidActorRegistry();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw invalidActorRegistry();
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    throw invalidActorRegistry();
  }

  const tokenDigests = new Set<string>();
  return parsed.map((entry) => {
    const record = requirePlainRecord(entry);
    if (
      Object.keys(record).some((key) => key !== "token" && key !== "actor") ||
      typeof record.token !== "string" ||
      record.token.length < 32 ||
      record.token.length > 512 ||
      /\s/u.test(record.token)
    ) {
      throw invalidActorRegistry();
    }
    const tokenDigest = digestToken(record.token);
    const encodedDigest = tokenDigest.toString("base64url");
    if (tokenDigests.has(encodedDigest)) {
      throw invalidActorRegistry();
    }
    tokenDigests.add(encodedDigest);
    return {
      tokenDigest,
      actor: normalizeActor(record.actor),
    };
  });
}

function normalizeActor(value: unknown): P2ListActorContext {
  const actor = requirePlainRecord(value);
  if (Object.keys(actor).some((key) => !actorKeys.has(key))) {
    throw invalidActorRegistry();
  }
  const dataScope = requirePlainRecord(actor.dataScope);
  if (Object.keys(dataScope).some((key) => !scopeKeys.has(key))) {
    throw invalidActorRegistry();
  }
  const normalizedScope: P2ListDataScope = {};
  for (const key of scopeKeys) {
    const values = readScopeArray(dataScope, key as keyof P2ListDataScope);
    if (values !== undefined) {
      Object.assign(normalizedScope, { [key]: values });
    }
  }
  return {
    actorId: requireBoundedString(actor.actorId),
    tenantId: requireBoundedString(actor.tenantId),
    permissions: requireStringArray(actor.permissions),
    dataScope: normalizedScope,
  };
}

function readScopeArray(
  scope: Record<string, unknown>,
  key: keyof P2ListDataScope,
): string[] | undefined {
  return scope[key] === undefined ? undefined : requireStringArray(scope[key]);
}

function requirePlainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidActorRegistry();
  }
  return value as Record<string, unknown>;
}

function requireBoundedString(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 256) {
    throw invalidActorRegistry();
  }
  return value;
}

function requireStringArray(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw invalidActorRegistry();
  }
  const normalized = value.map(requireBoundedString);
  if (new Set(normalized).size !== normalized.length) {
    throw invalidActorRegistry();
  }
  return normalized;
}

function readBearerToken(value: string | undefined): string | undefined {
  if (!value?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = value.slice("Bearer ".length);
  return token.length >= 32 && token.length <= 512 && !/\s/u.test(token)
    ? token
    : undefined;
}

function digestToken(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function readOptionalSecret(value: string | undefined): string | undefined {
  return value === undefined || value.length === 0 ? undefined : value;
}

function createEphemeralSecret(): string {
  return randomBytes(32).toString("base64url");
}

function invalidActorRegistry(): Error {
  return new Error(
    "P2LIST_EMPLOYEE_ACTORS_JSON must contain valid server-owned actor profiles.",
  );
}
