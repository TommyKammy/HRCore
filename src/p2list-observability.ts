import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { FastifyRequest } from "fastify";

import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import {
  p2ListAuditEventVersion,
  p2ListExportSchemaVersion,
  p2ListPermissions,
  p2ListReadiness,
} from "./p2list-contract.js";
import {
  normalizeP2ListDataScope,
  P2ListReadModelError,
  requireBoundedString,
  type P2ListActorContext,
} from "./p2list-read-model-types.js";

export const p2ListCorrelationHeader = "x-hrcore-correlation-id" as const;
export const p2ListMaximumEvidenceEvents = 20;

const p2ListClientCorrelationPattern =
  /^p2list-ui-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface P2ListAuditEvidenceEvent {
  eventType: string;
  eventVersion: typeof p2ListAuditEventVersion;
  occurredAt: string;
  actorId: string | null;
  actorRole: string | null;
  evaluatedPermission: string;
  dataScopeId: string | null;
  filterFingerprint: string | null;
  sort: string | null;
  pageSize: number | null;
  rowCount: number | null;
  resourceType: "employee" | "lifecycleRequest";
  correlationId: string;
  policyDecision: "allow" | "deny";
  reasonCode: string | null;
  exportSchemaVersion: typeof p2ListExportSchemaVersion | null;
  durationMs: number;
}

export interface P2ListAuditEvidenceResponse {
  correlationId: string;
  events: P2ListAuditEvidenceEvent[];
  metrics: {
    requestCount: number;
    latencyMs: {
      count: number;
      minimum: number;
      maximum: number;
      average: number;
    };
    denialReasons: Array<{ reasonCode: string; count: number }>;
    exportResults: {
      requested: number;
      completed: number;
      denied: number;
    };
  };
  authorization: {
    dataScope: "correlation_exact";
    readiness: typeof p2ListReadiness;
  };
}

export function resolveP2ListCorrelationId(
  request: FastifyRequest,
  createCorrelationId: (() => string) | undefined,
): string {
  const supplied = request.headers[p2ListCorrelationHeader];
  if (
    typeof supplied === "string" &&
    p2ListClientCorrelationPattern.test(supplied)
  ) {
    return supplied;
  }
  return createCorrelationId?.() ?? `p2list-${randomUUID()}`;
}

export function startP2ListDuration(): number {
  return performance.now();
}

export function elapsedP2ListDurationMs(startedAt: number): number {
  return Math.min(
    600_000,
    Math.max(0, Math.round(performance.now() - startedAt)),
  );
}

export function safeP2ListActorRole(
  actor: P2ListActorContext | undefined,
): string | undefined {
  try {
    return requireBoundedString(
      actor?.actorRole,
      1,
      64,
      "actor_context_required",
    );
  } catch {
    return undefined;
  }
}

export function readP2ListAuditEvidence(
  db: OnboardingTransactionRequestDatabase,
  actor: P2ListActorContext,
  correlationIdValue: unknown,
): P2ListAuditEvidenceResponse | undefined {
  const correlationId = requireBoundedString(
    correlationIdValue,
    1,
    64,
    "invalid_filter",
  );
  if (!actor.permissions.includes(p2ListPermissions.supportCorrelationRead)) {
    throw new P2ListReadModelError(
      "permission_denied",
      "Support correlation evidence permission is required.",
    );
  }
  const scope = normalizeP2ListDataScope(actor.dataScope);
  if (!scope.correlationIds.includes(correlationId)) {
    throw new P2ListReadModelError(
      "data_scope_denied",
      "Support correlation evidence is outside the actor scope.",
    );
  }

  const rows =
    db
      .prepare(
        `
          SELECT
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
            duration_ms
          FROM p2list_audit_event
          WHERE correlation_id = ?
          ORDER BY occurred_at ASC, event_type ASC
          LIMIT ?
        `,
      )
      .all?.(correlationId, p2ListMaximumEvidenceEvents + 1) ?? [];

  if (rows.length === 0) return undefined;
  if (rows.length > p2ListMaximumEvidenceEvents) {
    throw new P2ListReadModelError(
      "data_scope_denied",
      "Support correlation evidence exceeds the bounded event limit.",
    );
  }

  const events = rows.map(mapEvidenceRow);
  return {
    correlationId,
    events,
    metrics: buildP2ListMetrics(events),
    authorization: {
      dataScope: "correlation_exact",
      readiness: p2ListReadiness,
    },
  };
}

function mapEvidenceRow(
  row: Record<string, unknown>,
): P2ListAuditEvidenceEvent {
  return {
    eventType: requireRowString(row.event_type),
    eventVersion: requireExactRowValue(
      row.event_version,
      p2ListAuditEventVersion,
    ),
    occurredAt: requireRowString(row.occurred_at),
    actorId: readNullableRowString(row.actor_id),
    actorRole: readNullableRowString(row.actor_role),
    evaluatedPermission: requireRowString(row.evaluated_permission),
    dataScopeId: readNullableRowString(row.data_scope_id),
    filterFingerprint: readNullableRowString(row.filter_fingerprint),
    sort: readNullableRowString(row.sort),
    pageSize: readNullableRowInteger(row.page_size),
    rowCount: readNullableRowInteger(row.row_count),
    resourceType: requireResourceType(row.resource_type),
    correlationId: requireRowString(row.correlation_id),
    policyDecision: requirePolicyDecision(row.policy_decision),
    reasonCode: readNullableRowString(row.reason_code),
    exportSchemaVersion:
      row.export_schema_version === null
        ? null
        : requireExactRowValue(
            row.export_schema_version,
            p2ListExportSchemaVersion,
          ),
    durationMs: requireRowInteger(row.duration_ms),
  };
}

function buildP2ListMetrics(events: P2ListAuditEvidenceEvent[]) {
  const durations = events.map((event) => event.durationMs);
  const denialCounts = new Map<string, number>();
  for (const event of events) {
    if (event.policyDecision === "deny" && event.reasonCode) {
      denialCounts.set(
        event.reasonCode,
        (denialCounts.get(event.reasonCode) ?? 0) + 1,
      );
    }
  }
  const exportCount = (eventType: string) =>
    events.filter((event) => event.eventType === eventType).length;
  const requestDuration = Math.max(...durations);
  return {
    requestCount: 1,
    latencyMs: {
      count: 1,
      minimum: requestDuration,
      maximum: requestDuration,
      average: requestDuration,
    },
    denialReasons: [...denialCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reasonCode, count]) => ({ reasonCode, count })),
    exportResults: {
      requested: exportCount("bounded_export.requested"),
      completed: exportCount("bounded_export.completed"),
      denied: exportCount("bounded_export.denied"),
    },
  };
}

function requireRowString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("P2LIST audit evidence contains an invalid string field.");
  }
  return value;
}

function readNullableRowString(value: unknown): string | null {
  return value === null ? null : requireRowString(value);
}

function requireRowInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("P2LIST audit evidence contains an invalid numeric field.");
  }
  return value;
}

function readNullableRowInteger(value: unknown): number | null {
  return value === null ? null : requireRowInteger(value);
}

function requireExactRowValue<TValue extends string>(
  value: unknown,
  expected: TValue,
): TValue {
  if (value !== expected) {
    throw new Error("P2LIST audit evidence contains an invalid version field.");
  }
  return expected;
}

function requireResourceType(
  value: unknown,
): P2ListAuditEvidenceEvent["resourceType"] {
  if (value !== "employee" && value !== "lifecycleRequest") {
    throw new Error("P2LIST audit evidence contains an invalid resource type.");
  }
  return value;
}

function requirePolicyDecision(
  value: unknown,
): P2ListAuditEvidenceEvent["policyDecision"] {
  if (value !== "allow" && value !== "deny") {
    throw new Error("P2LIST audit evidence contains an invalid decision.");
  }
  return value;
}
