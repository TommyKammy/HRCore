import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";

import type {
  OnboardingTransactionRequestDatabase,
  SqlRunResult,
} from "./onboarding-transaction-request-types.js";
import { P2ListCursorManager } from "./p2list-cursor.js";
import { P2ListReadModelRepository } from "./p2list-read-model-repository.js";
import {
  P2ListReadModelError,
  signP2ListSyntheticDatasetManifest,
  verifyP2ListSyntheticDatasetManifest,
  type P2ListActorContext,
  type P2ListDataScope,
  type P2ListSyntheticDatasetManifest,
} from "./p2list-read-model-types.js";
import type {
  P2ListEmployeeApiRuntime,
  P2ListEmployeeAuditEvent,
} from "./routes/p2list-employees.js";
import type {
  P2ListExportApiRuntime,
  P2ListExportAuditEvent,
} from "./routes/p2list-exports.js";
import type {
  P2ListLifecycleApiRuntime,
  P2ListLifecycleAuditEvent,
} from "./routes/p2list-lifecycle-requests.js";
import type { P2ListAuditEvidenceRuntime } from "./routes/p2list-audit-evidence.js";

const actorKeys = new Set([
  "actorId",
  "actorRole",
  "tenantId",
  "permissions",
  "dataScope",
]);
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

interface P2ListServerBaseRuntime {
  repository: P2ListReadModelRepository;
  provenance: P2ListEmployeeApiRuntime["provenance"];
  resolveActor: P2ListEmployeeApiRuntime["resolveActor"];
  now?: () => Date;
  resolveCorrelationAcceptedAt(
    correlationId: string,
    observedAt: string,
  ): string;
}

export interface P2ListServerRuntimeOptions {
  now?: () => Date;
}

export async function createServerP2ListEmployeeRuntime(
  db: OnboardingTransactionRequestDatabase,
  environment: NodeJS.ProcessEnv = process.env,
  options: P2ListServerRuntimeOptions = {},
): Promise<P2ListEmployeeApiRuntime> {
  const runtime = await createServerP2ListBaseRuntime(environment, db, options);
  return createEmployeeRuntime(db, runtime);
}

export async function createServerP2ListLifecycleRuntime(
  db: OnboardingTransactionRequestDatabase,
  environment: NodeJS.ProcessEnv = process.env,
  options: P2ListServerRuntimeOptions = {},
): Promise<P2ListLifecycleApiRuntime> {
  const runtime = await createServerP2ListBaseRuntime(environment, db, options);
  return createLifecycleRuntime(db, runtime);
}

export async function createServerP2ListRuntimes(
  db: OnboardingTransactionRequestDatabase,
  environment: NodeJS.ProcessEnv = process.env,
  options: P2ListServerRuntimeOptions = {},
): Promise<{
  employee: P2ListEmployeeApiRuntime;
  auditEvidence: P2ListAuditEvidenceRuntime;
  export: P2ListExportApiRuntime;
  lifecycle: P2ListLifecycleApiRuntime;
}> {
  const runtime = await createServerP2ListBaseRuntime(environment, db, options);
  return {
    employee: createEmployeeRuntime(db, runtime),
    auditEvidence: {
      database: db,
      resolveActor: runtime.resolveActor,
    },
    export: createExportRuntime(db, runtime),
    lifecycle: createLifecycleRuntime(db, runtime),
  };
}

async function createServerP2ListBaseRuntime(
  environment: NodeJS.ProcessEnv,
  db: OnboardingTransactionRequestDatabase,
  options: P2ListServerRuntimeOptions,
): Promise<P2ListServerBaseRuntime> {
  const provenance = await loadVerifiedProvenance(environment);
  const cursorSecret =
    readOptionalSecret(environment.P2LIST_EMPLOYEE_CURSOR_SECRET) ??
    createEphemeralSecret();
  const actors = parseActorRegistry(environment.P2LIST_EMPLOYEE_ACTORS_JSON);

  const repository = new P2ListReadModelRepository(
    db,
    new P2ListCursorManager({ secret: cursorSecret, now: options.now }),
  );
  return {
    repository,
    provenance,
    now: options.now,
    resolveActor(request) {
      const token = readBearerToken(request.headers.authorization);
      if (!token) {
        return undefined;
      }
      const digest = digestToken(token);
      return actors.find((entry) => timingSafeEqual(entry.tokenDigest, digest))
        ?.actor;
    },
    resolveCorrelationAcceptedAt(correlationId, observedAt) {
      return readP2ListCorrelationAcceptedAt(db, correlationId) ?? observedAt;
    },
  };
}

function readP2ListCorrelationAcceptedAt(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): string | undefined {
  const row = db
    .prepare(
      `
        SELECT occurred_at
        FROM p2list_audit_event
        WHERE correlation_id = ?
        ORDER BY occurred_at ASC, event_id ASC
        LIMIT 1
      `,
    )
    .get(correlationId) as { occurred_at?: unknown } | undefined;
  return typeof row?.occurred_at === "string" ? row.occurred_at : undefined;
}

function createEmployeeRuntime(
  db: OnboardingTransactionRequestDatabase,
  runtime: P2ListServerBaseRuntime,
): P2ListEmployeeApiRuntime {
  return {
    ...runtime,
    emitAuditEvent(event) {
      persistP2ListAuditEvent(db, event);
    },
  };
}

function createLifecycleRuntime(
  db: OnboardingTransactionRequestDatabase,
  runtime: P2ListServerBaseRuntime,
): P2ListLifecycleApiRuntime {
  return {
    ...runtime,
    emitAuditEvent(event) {
      persistP2ListAuditEvent(db, event);
    },
  };
}

function createExportRuntime(
  db: OnboardingTransactionRequestDatabase,
  runtime: P2ListServerBaseRuntime,
): P2ListExportApiRuntime {
  return {
    ...runtime,
    emitAuditEvent(event) {
      persistP2ListAuditEvent(db, event);
    },
  };
}

function persistP2ListAuditEvent(
  db: OnboardingTransactionRequestDatabase,
  event:
    | P2ListEmployeeAuditEvent
    | P2ListLifecycleAuditEvent
    | P2ListExportAuditEvent,
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    persistP2ListAuditEventInTransaction(db, event);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the audit failure that caused the rollback.
    }
    throw error;
  }
}

function persistP2ListAuditEventInTransaction(
  db: OnboardingTransactionRequestDatabase,
  event:
    | P2ListEmployeeAuditEvent
    | P2ListLifecycleAuditEvent
    | P2ListExportAuditEvent,
): void {
  assertP2ListAuditCorrelationAvailable(db, event);
  const result = db
    .prepare(
      `
      INSERT INTO p2list_audit_event (
        event_id,
        event_type,
        event_version,
        occurred_at,
        actor_id,
        actor_role,
        evaluated_permission,
        data_scope_id,
        filter_fingerprint,
        sort,
        page_size,
        row_count,
        resource_type,
        correlation_id,
        policy_decision,
        reason_code,
        export_schema_version,
        duration_ms,
        poc_marker
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(correlation_id, event_type) DO NOTHING
    `,
    )
    .run(
      event.eventId,
      event.eventType,
      event.eventVersion,
      event.occurredAt,
      event.actorId ?? null,
      event.actorRole ?? null,
      event.evaluatedPermission,
      event.dataScopeId ?? null,
      event.filterFingerprint ?? null,
      event.sort ?? null,
      event.pageSize ?? null,
      event.rowCount ?? null,
      event.resourceType,
      event.correlationId,
      event.policyDecision,
      event.reasonCode ?? null,
      "exportSchemaVersion" in event ? event.exportSchemaVersion : null,
      event.durationMs,
      "synthetic_poc",
    );
  if (Number((result as SqlRunResult | undefined)?.changes ?? 1) === 0) {
    assertIdempotentP2ListAuditRetry(db, event);
  }
}

type PersistedP2ListAuditEvent = Record<string, unknown> & {
  event_type: unknown;
};

const p2ListAuditEvidenceSelect = `
  SELECT
    event_type,
    event_version,
    actor_id,
    actor_role,
    evaluated_permission,
    data_scope_id,
    filter_fingerprint,
    sort,
    page_size,
    row_count,
    resource_type,
    policy_decision,
    reason_code,
    export_schema_version
  FROM p2list_audit_event
`;

function assertP2ListAuditCorrelationAvailable(
  db: OnboardingTransactionRequestDatabase,
  event:
    | P2ListEmployeeAuditEvent
    | P2ListLifecycleAuditEvent
    | P2ListExportAuditEvent,
): void {
  const matchingEvent = db
    .prepare(
      `
        ${p2ListAuditEvidenceSelect}
        WHERE correlation_id = ?
          AND event_type = ?
      `,
    )
    .get(event.correlationId, event.eventType) as
    | PersistedP2ListAuditEvent
    | undefined;
  if (matchingEvent) {
    assertMatchingP2ListAuditEvidence(matchingEvent, event);
  }
  const existing = db
    .prepare(
      `
        ${p2ListAuditEvidenceSelect}
        WHERE correlation_id = ?
          AND event_type <> ?
        ORDER BY event_type
        LIMIT 1
      `,
    )
    .get(event.correlationId, event.eventType) as
    | PersistedP2ListAuditEvent
    | undefined;
  if (!existing) {
    if (event.eventType === "bounded_export.completed") {
      throwP2ListAuditCorrelationConflict();
    }
    return;
  }
  const eventTypes = new Set([existing.event_type, event.eventType]);
  const isAllowedExportSequence =
    eventTypes.size === 2 &&
    eventTypes.has("bounded_export.requested") &&
    eventTypes.has("bounded_export.completed") &&
    (event.eventType === "bounded_export.completed" || !!matchingEvent);
  if (!isAllowedExportSequence) {
    throwP2ListAuditCorrelationConflict();
  }
  assertMatchingP2ListAuditEvidence(existing, event);
}

function assertIdempotentP2ListAuditRetry(
  db: OnboardingTransactionRequestDatabase,
  event:
    | P2ListEmployeeAuditEvent
    | P2ListLifecycleAuditEvent
    | P2ListExportAuditEvent,
): void {
  const existing = db
    .prepare(
      `
        ${p2ListAuditEvidenceSelect}
        WHERE correlation_id = ?
          AND event_type = ?
      `,
    )
    .get(event.correlationId, event.eventType) as
    | PersistedP2ListAuditEvent
    | undefined;
  assertMatchingP2ListAuditEvidence(existing, event);
}

function assertMatchingP2ListAuditEvidence(
  existing: PersistedP2ListAuditEvent | undefined,
  event:
    | P2ListEmployeeAuditEvent
    | P2ListLifecycleAuditEvent
    | P2ListExportAuditEvent,
): void {
  const expected = {
    event_version: event.eventVersion,
    actor_id: event.actorId ?? null,
    actor_role: event.actorRole ?? null,
    evaluated_permission: event.evaluatedPermission,
    data_scope_id: event.dataScopeId ?? null,
    filter_fingerprint: event.filterFingerprint ?? null,
    sort: event.sort ?? null,
    page_size: event.pageSize ?? null,
    row_count: event.rowCount ?? null,
    resource_type: event.resourceType,
    policy_decision: event.policyDecision,
    reason_code: event.reasonCode ?? null,
    export_schema_version:
      "exportSchemaVersion" in event ? event.exportSchemaVersion : null,
  };
  if (
    !existing ||
    Object.entries(expected).some(([key, value]) => existing[key] !== value)
  ) {
    throwP2ListAuditCorrelationConflict();
  }
}

function throwP2ListAuditCorrelationConflict(): never {
  throw new P2ListReadModelError(
    "correlation_reuse_conflict",
    "P2LIST audit correlation reuse conflicts with existing evidence.",
  );
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
    actorRole: requireActorRole(actor.actorRole),
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
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > 256 ||
    value.trim() !== value
  ) {
    throw invalidActorRegistry();
  }
  return value;
}

function requireActorRole(value: unknown): string {
  const role = requireBoundedString(value);
  if (!/^[a-z][a-z0-9_]{0,63}$/u.test(role)) {
    throw invalidActorRegistry();
  }
  return role;
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
  const match = /^Bearer +(\S+)$/iu.exec(value ?? "");
  if (!match) {
    return undefined;
  }
  const token = match[1]!;
  return token.length >= 32 && token.length <= 512 ? token : undefined;
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
