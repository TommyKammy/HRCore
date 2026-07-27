import { randomUUID } from "node:crypto";

import {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";

import {
  p2ListAuditEventVersion,
  p2ListExportMaximumRows,
  p2ListExportReasonCodes,
  p2ListExportSchemaVersion,
  p2ListPermissions,
  p2ListReadiness,
  type P2ListErrorCode,
  type P2ListExportReasonCode,
} from "../p2list-contract.js";
import {
  buildEmployeeExportArtifact,
  buildLifecycleExportArtifact,
  isP2ListExportReasonCode,
} from "../p2list-export.js";
import {
  elapsedP2ListDurationMs,
  p2ListCorrelationHeader,
  resolveP2ListCorrelationId,
  safeP2ListActorRole,
  startP2ListDuration,
} from "../p2list-observability.js";
import {
  P2ListReadModelRepository,
  type P2ListEmployeeFilters,
  type P2ListLifecycleFilters,
} from "../p2list-read-model-repository.js";
import {
  fingerprintP2ListValue,
  normalizeP2ListDataScope,
  P2ListReadModelError,
  type P2ListActorContext,
  type P2ListVerifiedSyntheticDataset,
} from "../p2list-read-model-types.js";

type MaybePromise<T> = T | Promise<T>;
type ExportResource = "employee" | "lifecycleRequest";

interface ParsedExportRequest<Filters> {
  filters: Filters;
  reasonCode: P2ListExportReasonCode;
}

interface ExportRoutePolicy {
  permission: string;
  requiredPermissions: readonly string[];
  resourceType: ExportResource;
}

export interface P2ListExportAuditEvent {
  eventId: string;
  eventType:
    | "bounded_export.requested"
    | "bounded_export.completed"
    | "bounded_export.denied";
  eventVersion: typeof p2ListAuditEventVersion;
  occurredAt: string;
  actorId?: string;
  actorRole?: string;
  evaluatedPermission: string;
  dataScopeId?: string;
  filterFingerprint?: string;
  sort?: string;
  pageSize?: number;
  rowCount?: number;
  resourceType: ExportResource;
  correlationId: string;
  policyDecision: "allow" | "deny";
  reasonCode: P2ListExportReasonCode | P2ListErrorCode;
  exportSchemaVersion: typeof p2ListExportSchemaVersion;
  durationMs: number;
}

export interface P2ListExportApiRuntime {
  repository: P2ListReadModelRepository;
  provenance: P2ListVerifiedSyntheticDataset;
  resolveActor(
    request: FastifyRequest,
  ): MaybePromise<P2ListActorContext | undefined>;
  emitAuditEvent(event: P2ListExportAuditEvent): MaybePromise<void>;
  now?: () => Date;
  createCorrelationId?: () => string;
}

export function registerP2ListExportRoutes(
  app: FastifyInstance,
  options: { p2ListExportApi?: P2ListExportApiRuntime },
): void {
  const employeePolicy: ExportRoutePolicy = {
    permission: p2ListPermissions.employeeListExport,
    requiredPermissions: [
      p2ListPermissions.employeeListRead,
      p2ListPermissions.employeeListExport,
      p2ListPermissions.csvDownload,
    ],
    resourceType: "employee",
  };
  const lifecyclePolicy: ExportRoutePolicy = {
    permission: p2ListPermissions.lifecycleRequestListExport,
    requiredPermissions: [
      p2ListPermissions.lifecycleRequestListRead,
      p2ListPermissions.lifecycleRequestListExport,
      p2ListPermissions.csvDownload,
    ],
    resourceType: "lifecycleRequest",
  };

  app.post(
    "/exports/employee-list",
    {
      logLevel: "silent",
      errorHandler: createExportRouteErrorHandler(
        options.p2ListExportApi,
        employeePolicy,
      ),
    },
    async (request, reply) => {
      const startedAt = startP2ListDuration();
      const runtime = options.p2ListExportApi;
      const correlationId = resolveP2ListCorrelationId(
        request,
        runtime?.createCorrelationId,
      );
      const occurredAt = currentTimestamp(runtime);
      const permission = employeePolicy.permission;
      reply.header(p2ListCorrelationHeader, correlationId);
      let actor: P2ListActorContext | undefined;

      try {
        const activeRuntime = requireRuntime(runtime);
        actor = await requireActor(activeRuntime, request);
        requirePermissions(actor, employeePolicy.requiredPermissions);
        const input = parseEmployeeExportRequest(request.body);
        const collection = activeRuntime.repository.listEmployeesForExport({
          actor,
          provenance: activeRuntime.provenance,
          filters: input.filters,
          sort: "employeeId",
          direction: "asc",
          limit: p2ListExportMaximumRows,
          acceptedAt: occurredAt,
        });
        if (collection.hasMore) {
          throw exportError(
            "export_row_limit_exceeded",
            "The bounded export row limit was exceeded.",
          );
        }
        const filterFingerprint = fingerprintP2ListValue(
          collection.appliedFilters,
        );
        const auditContext = {
          occurredAt,
          actor,
          permission,
          resourceType: "employee" as const,
          correlationId,
          reasonCode: input.reasonCode,
          filterFingerprint,
          rowCount: collection.items.length,
          startedAt,
        };
        await emitAllowedExportEvent(
          activeRuntime,
          "bounded_export.requested",
          auditContext,
        );
        const artifact = buildEmployeeExportArtifact(collection.items);
        await emitAllowedExportEvent(
          activeRuntime,
          "bounded_export.completed",
          {
            ...auditContext,
            occurredAt: currentTimestamp(activeRuntime),
          },
        );
        return sendArtifact(reply, artifact);
      } catch (error) {
        return handleExportError(reply, error, runtime, {
          occurredAt,
          actor,
          permission,
          resourceType: "employee",
          correlationId,
          startedAt,
        });
      }
    },
  );

  app.post(
    "/exports/lifecycle-request-list",
    {
      logLevel: "silent",
      errorHandler: createExportRouteErrorHandler(
        options.p2ListExportApi,
        lifecyclePolicy,
      ),
    },
    async (request, reply) => {
      const startedAt = startP2ListDuration();
      const runtime = options.p2ListExportApi;
      const correlationId = resolveP2ListCorrelationId(
        request,
        runtime?.createCorrelationId,
      );
      const occurredAt = currentTimestamp(runtime);
      const permission = lifecyclePolicy.permission;
      reply.header(p2ListCorrelationHeader, correlationId);
      let actor: P2ListActorContext | undefined;

      try {
        const activeRuntime = requireRuntime(runtime);
        actor = await requireActor(activeRuntime, request);
        requirePermissions(actor, lifecyclePolicy.requiredPermissions);
        const input = parseLifecycleExportRequest(request.body);
        const collection =
          activeRuntime.repository.listLifecycleRequestsForExport({
            actor,
            provenance: activeRuntime.provenance,
            filters: input.filters,
            sort: "requestedAt",
            direction: "desc",
            limit: p2ListExportMaximumRows,
          });
        if (collection.hasMore) {
          throw exportError(
            "export_row_limit_exceeded",
            "The bounded export row limit was exceeded.",
          );
        }
        const filterFingerprint = fingerprintP2ListValue(
          collection.appliedFilters,
        );
        const auditContext = {
          occurredAt,
          actor,
          permission,
          resourceType: "lifecycleRequest" as const,
          correlationId,
          reasonCode: input.reasonCode,
          filterFingerprint,
          rowCount: collection.items.length,
          startedAt,
        };
        await emitAllowedExportEvent(
          activeRuntime,
          "bounded_export.requested",
          auditContext,
        );
        const artifact = buildLifecycleExportArtifact(collection.items);
        await emitAllowedExportEvent(
          activeRuntime,
          "bounded_export.completed",
          {
            ...auditContext,
            occurredAt: currentTimestamp(activeRuntime),
          },
        );
        return sendArtifact(reply, artifact);
      } catch (error) {
        return handleExportError(reply, error, runtime, {
          occurredAt,
          actor,
          permission,
          resourceType: "lifecycleRequest",
          correlationId,
          startedAt,
        });
      }
    },
  );
}

function createExportRouteErrorHandler(
  runtime: P2ListExportApiRuntime | undefined,
  policy: ExportRoutePolicy,
) {
  return async (
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (
      error.code !== "FST_ERR_CTP_INVALID_JSON_BODY" &&
      error.code !== "FST_ERR_CTP_EMPTY_JSON_BODY"
    ) {
      throw error;
    }

    const startedAt = startP2ListDuration();
    const correlationId = resolveP2ListCorrelationId(
      request,
      runtime?.createCorrelationId,
    );
    const occurredAt = currentTimestamp(runtime);
    let actor: P2ListActorContext | undefined;
    reply.header(p2ListCorrelationHeader, correlationId);

    try {
      const activeRuntime = requireRuntime(runtime);
      actor = await requireActor(activeRuntime, request);
      requirePermissions(actor, policy.requiredPermissions);
    } catch (authorizationError) {
      await handleExportError(reply, authorizationError, runtime, {
        occurredAt,
        actor,
        permission: policy.permission,
        resourceType: policy.resourceType,
        correlationId,
        startedAt,
      });
      return;
    }

    await handleExportError(
      reply,
      exportError("invalid_filter", "The export request is invalid."),
      runtime,
      {
        occurredAt,
        actor,
        permission: policy.permission,
        resourceType: policy.resourceType,
        correlationId,
        startedAt,
      },
    );
  };
}

function currentTimestamp(runtime: P2ListExportApiRuntime | undefined): string {
  return (runtime?.now?.() ?? new Date()).toISOString();
}

function requireRuntime(
  runtime: P2ListExportApiRuntime | undefined,
): P2ListExportApiRuntime {
  if (!runtime || typeof runtime.emitAuditEvent !== "function") {
    throw exportError(
      "actor_context_required",
      "Server actor context is required.",
    );
  }
  return runtime;
}

async function requireActor(
  runtime: P2ListExportApiRuntime,
  request: FastifyRequest,
): Promise<P2ListActorContext> {
  const actor = await runtime.resolveActor(request);
  if (!actor) {
    throw exportError(
      "actor_context_required",
      "Server actor context is required.",
    );
  }
  return actor;
}

function requirePermissions(
  actor: P2ListActorContext,
  required: readonly string[],
): void {
  if (required.some((permission) => !actor.permissions.includes(permission))) {
    throw exportError("permission_denied", "The export is not permitted.");
  }
}

function parseEmployeeExportRequest(
  value: unknown,
): ParsedExportRequest<P2ListEmployeeFilters> {
  const request = parseExportRequest(value);
  const filters = requireRecord(request.filters);
  if (!hasOwn(filters, "employeeId") && !hasOwn(filters, "organizationCode")) {
    throw exportError(
      "export_filter_required",
      "A meaningful employee export filter is required.",
    );
  }
  return {
    filters: filters as P2ListEmployeeFilters,
    reasonCode: request.reasonCode,
  };
}

function parseLifecycleExportRequest(
  value: unknown,
): ParsedExportRequest<P2ListLifecycleFilters> {
  const request = parseExportRequest(value);
  const filters = requireRecord(request.filters);
  const hasRequestedRange =
    hasOwn(filters, "requestedFrom") && hasOwn(filters, "requestedTo");
  const hasEffectiveRange =
    hasOwn(filters, "effectiveFrom") && hasOwn(filters, "effectiveTo");
  if (
    !hasOwn(filters, "subjectEmployeeId") &&
    !hasOwn(filters, "organizationCode") &&
    !hasOwn(filters, "correlationId") &&
    !hasRequestedRange &&
    !hasEffectiveRange
  ) {
    throw exportError(
      "export_filter_required",
      "A meaningful lifecycle export filter is required.",
    );
  }
  return {
    filters: filters as P2ListLifecycleFilters,
    reasonCode: request.reasonCode,
  };
}

function parseExportRequest(value: unknown): {
  filters: unknown;
  reasonCode: P2ListExportReasonCode;
} {
  const request = requireRecord(value);
  const keys = Object.keys(request);
  if (keys.includes("fields") || keys.includes("columns")) {
    throw exportError("export_field_denied", "Export fields are server-owned.");
  }
  if (keys.some((key) => key !== "filters" && key !== "reasonCode")) {
    throw exportError(
      "unsupported_filter",
      "The export request contains unsupported fields.",
    );
  }
  if (!hasOwn(request, "reasonCode") || request.reasonCode === "") {
    throw exportError(
      "export_reason_code_required",
      "An export reason code is required.",
    );
  }
  if (!isP2ListExportReasonCode(request.reasonCode, p2ListExportReasonCodes)) {
    throw exportError(
      "export_reason_code_unsupported",
      "The export reason code is unsupported.",
    );
  }
  if (!hasOwn(request, "filters")) {
    throw exportError(
      "export_filter_required",
      "A meaningful bounded export filter is required.",
    );
  }
  return {
    filters: request.filters,
    reasonCode: request.reasonCode,
  };
}

async function emitAllowedExportEvent(
  runtime: P2ListExportApiRuntime,
  eventType: "bounded_export.requested" | "bounded_export.completed",
  event: {
    occurredAt: string;
    actor: P2ListActorContext;
    permission: string;
    resourceType: ExportResource;
    correlationId: string;
    reasonCode: P2ListExportReasonCode;
    filterFingerprint: string;
    rowCount: number;
    startedAt: number;
  },
): Promise<void> {
  const shared = {
    eventVersion: p2ListAuditEventVersion,
    occurredAt: event.occurredAt,
    actorId: event.actor.actorId,
    actorRole: event.actor.actorRole,
    evaluatedPermission: event.permission,
    dataScopeId: fingerprintP2ListValue(
      normalizeP2ListDataScope(event.actor.dataScope),
    ),
    filterFingerprint: event.filterFingerprint,
    rowCount: event.rowCount,
    resourceType: event.resourceType,
    correlationId: event.correlationId,
    policyDecision: "allow" as const,
    reasonCode: event.reasonCode,
    exportSchemaVersion: p2ListExportSchemaVersion,
    durationMs: elapsedP2ListDurationMs(event.startedAt),
  };
  await runtime.emitAuditEvent({
    ...shared,
    eventId: randomUUID(),
    eventType,
  });
}

async function handleExportError(
  reply: FastifyReply,
  error: unknown,
  runtime: P2ListExportApiRuntime | undefined,
  context: {
    occurredAt: string;
    actor: P2ListActorContext | undefined;
    permission: string;
    resourceType: ExportResource;
    correlationId: string;
    startedAt: number;
  },
) {
  if (!(error instanceof P2ListReadModelError)) {
    throw error;
  }
  if (runtime?.emitAuditEvent && error.code !== "correlation_reuse_conflict") {
    await runtime.emitAuditEvent({
      eventId: randomUUID(),
      eventType: "bounded_export.denied",
      eventVersion: p2ListAuditEventVersion,
      occurredAt: context.occurredAt,
      actorId: safeActorId(context.actor),
      actorRole: safeP2ListActorRole(context.actor),
      evaluatedPermission: context.permission,
      dataScopeId: safeDataScopeFingerprint(context.actor),
      resourceType: context.resourceType,
      correlationId: context.correlationId,
      policyDecision: "deny",
      reasonCode: error.code,
      exportSchemaVersion: p2ListExportSchemaVersion,
      durationMs: elapsedP2ListDurationMs(context.startedAt),
    });
  }
  return reply.code(statusForError(error.code)).send({
    code: error.code,
    message: publicErrorMessage(error.code),
    correlationId: context.correlationId,
    readiness: p2ListReadiness,
  });
}

function sendArtifact(
  reply: FastifyReply,
  artifact: ReturnType<typeof buildEmployeeExportArtifact>,
) {
  return reply
    .header("x-hrcore-export-schema-version", artifact.schemaVersion)
    .header(
      "content-disposition",
      `attachment; filename="${artifact.fileName}"`,
    )
    .type(artifact.contentType)
    .send(artifact.csv);
}

function statusForError(code: P2ListErrorCode): 400 | 401 | 403 | 422 {
  if (code === "actor_context_required") return 401;
  if (code === "permission_denied" || code === "data_scope_denied") return 403;
  if (
    code === "export_reason_code_required" ||
    code === "export_reason_code_unsupported"
  ) {
    return 400;
  }
  if (code.startsWith("export_")) return 422;
  return 400;
}

function publicErrorMessage(code: P2ListErrorCode): string {
  if (code === "actor_context_required") {
    return "Server actor context is required.";
  }
  if (code === "permission_denied" || code === "data_scope_denied") {
    return "The bounded export is not authorized.";
  }
  if (code === "export_row_limit_exceeded") {
    return "The bounded export exceeds the 100-row limit.";
  }
  if (code === "export_filter_required") {
    return "A meaningful bounded export filter is required.";
  }
  if (
    code === "export_reason_code_required" ||
    code === "export_reason_code_unsupported"
  ) {
    return "A supported export reason code is required.";
  }
  if (code === "export_field_denied") {
    return "Export columns are server-owned and bounded.";
  }
  return "The bounded export request is invalid.";
}

function exportError(code: P2ListErrorCode, message: string) {
  return new P2ListReadModelError(code, message);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw exportError("invalid_filter", "The export request is invalid.");
  }
  return value as Record<string, unknown>;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeActorId(
  actor: P2ListActorContext | undefined,
): string | undefined {
  return typeof actor?.actorId === "string" && actor.actorId.length > 0
    ? actor.actorId
    : undefined;
}

function safeDataScopeFingerprint(
  actor: P2ListActorContext | undefined,
): string | undefined {
  try {
    return actor
      ? fingerprintP2ListValue(normalizeP2ListDataScope(actor.dataScope))
      : undefined;
  } catch {
    return undefined;
  }
}
