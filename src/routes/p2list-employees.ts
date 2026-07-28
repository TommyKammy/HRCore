import { randomUUID } from "node:crypto";

import { type FastifyInstance, type FastifyRequest } from "fastify";

import {
  p2ListAuditEventVersion,
  p2ListDefaultLimit,
  p2ListEmployeeSortFields,
  p2ListMaximumLimit,
  p2ListPermissions,
  p2ListReadiness,
  type P2ListErrorCode,
} from "../p2list-contract.js";
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
  type P2ListEmployeeQuery,
} from "../p2list-read-model-repository.js";
import {
  fingerprintP2ListCollectionRequest,
  fingerprintP2ListRequestInput,
  fingerprintP2ListRequestResult,
  resolveP2ListCorrelationAcceptedAt,
} from "../p2list-request-identity.js";
import {
  fingerprintP2ListAuthorizationScope,
  P2ListReadModelError,
  requireBoundedString,
  type P2ListActorContext,
  type P2ListVerifiedSyntheticDataset,
} from "../p2list-read-model-types.js";

const employeeQueryKeys = new Set([
  "q",
  "employeeId",
  "employmentStatus",
  "organizationCode",
  "asOf",
  "sort",
  "direction",
  "limit",
  "cursor",
]);
const authorizationAuditErrorCodes = new Set<P2ListErrorCode>([
  "actor_context_required",
  "permission_denied",
  "data_scope_denied",
]);

type MaybePromise<T> = T | Promise<T>;
type EmployeeSort = NonNullable<P2ListEmployeeQuery["sort"]>;
type ParsedEmployeeQuery = Omit<
  P2ListEmployeeQuery,
  "actor" | "provenance" | "acceptedAt" | "filters"
> & {
  filters: P2ListEmployeeFilters;
};

export interface P2ListEmployeeAuditEvent {
  eventId: string;
  eventType:
    | "employee_list.viewed"
    | "employee_list.search_applied"
    | "employee_list.page_requested"
    | "employee_detail.opened_from_list"
    | "authorization.denied";
  eventVersion: typeof p2ListAuditEventVersion;
  occurredAt: string;
  actorId?: string;
  actorRole?: string;
  evaluatedPermission:
    | typeof p2ListPermissions.employeeListRead
    | typeof p2ListPermissions.employeeDetailRead;
  dataScopeId?: string;
  filterFingerprint?: string;
  sort?: string;
  pageSize?: number;
  rowCount?: number;
  resourceType: "employee";
  correlationId: string;
  policyDecision: "allow" | "deny";
  reasonCode?: P2ListErrorCode;
  durationMs: number;
}

export interface P2ListEmployeeApiRuntime {
  repository: P2ListReadModelRepository;
  provenance: P2ListVerifiedSyntheticDataset;
  resolveActor(
    request: FastifyRequest,
  ): MaybePromise<P2ListActorContext | undefined>;
  emitAuditEvent(event: P2ListEmployeeAuditEvent): MaybePromise<void>;
  resolveCorrelationAcceptedAt?(
    correlationId: string,
    observedAt: string,
  ): MaybePromise<string>;
  now?: () => Date;
  createCorrelationId?: () => string;
}

export function registerP2ListEmployeeRoutes(
  app: FastifyInstance,
  options: { p2ListEmployeeApi?: P2ListEmployeeApiRuntime },
): void {
  app.get("/employees", { logLevel: "silent" }, async (request, reply) => {
    const startedAt = startP2ListDuration();
    const runtime = options.p2ListEmployeeApi;
    if (runtime && typeof runtime.emitAuditEvent !== "function") {
      throw new Error("The employee list audit sink is required.");
    }
    const correlationId = resolveP2ListCorrelationId(
      request,
      runtime?.createCorrelationId,
    );
    const occurredAt = (runtime?.now?.() ?? new Date()).toISOString();
    const acceptedAt = await resolveP2ListCorrelationAcceptedAt(
      runtime,
      correlationId,
      occurredAt,
    );
    const ingressRequestFingerprint = fingerprintP2ListRequestInput(
      "employee.list",
      request.query,
    );
    reply.header("x-correlation-id", correlationId);
    reply.header(p2ListCorrelationHeader, correlationId);

    let actor: P2ListActorContext | undefined;
    let parsedQuery: ParsedEmployeeQuery | undefined;
    try {
      if (!runtime) {
        throw new P2ListReadModelError(
          "actor_context_required",
          "Server actor context is required.",
        );
      }
      actor = await runtime.resolveActor(request);
      if (!actor) {
        throw new P2ListReadModelError(
          "actor_context_required",
          "Server actor context is required.",
        );
      }

      const query = parseEmployeeQuery(request.query);
      parsedQuery = query;
      const page = runtime.repository.listEmployees({
        ...query,
        actor,
        provenance: runtime.provenance,
        acceptedAt,
      });
      const response = {
        ...page,
        authorization: {
          dataScope: "bounded" as const,
          maskedFields: [] as string[],
          readiness: p2ListReadiness,
        },
        correlationId,
      };

      await emitAuditEvent(runtime, {
        eventId: randomUUID(),
        eventType: query.cursor
          ? "employee_list.page_requested"
          : hasExplicitFilter(query.filters)
            ? "employee_list.search_applied"
            : "employee_list.viewed",
        eventVersion: p2ListAuditEventVersion,
        occurredAt,
        actorId: actor.actorId,
        actorRole: actor.actorRole,
        evaluatedPermission: p2ListPermissions.employeeListRead,
        dataScopeId: fingerprintP2ListAuthorizationScope(actor),
        filterFingerprint: fingerprintP2ListRequestResult(
          "employee.list",
          fingerprintP2ListCollectionRequest(
            "employee.list",
            page.appliedFilters,
            query.cursor,
          ),
          {
            items: page.items,
            pageInfo: page.pageInfo,
          },
        ),
        sort: `${query.sort ?? "employeeId"}:${query.direction ?? "asc"}`,
        pageSize: page.pageInfo.limit,
        rowCount: page.items.length,
        resourceType: "employee",
        correlationId,
        policyDecision: "allow",
        durationMs: elapsedP2ListDurationMs(startedAt),
      });
      return reply.send(response);
    } catch (error) {
      if (!(error instanceof P2ListReadModelError)) {
        throw error;
      }

      let responseError = error;
      if (runtime && authorizationAuditErrorCodes.has(error.code)) {
        responseError = await emitDenialAuditEvent(
          runtime,
          {
            eventId: randomUUID(),
            eventType: "authorization.denied",
            eventVersion: p2ListAuditEventVersion,
            occurredAt,
            actorId: safeActorId(actor),
            actorRole: safeP2ListActorRole(actor),
            evaluatedPermission: p2ListPermissions.employeeListRead,
            dataScopeId: safeDataScopeFingerprint(actor),
            filterFingerprint: parsedQuery
              ? fingerprintP2ListCollectionRequest(
                  "employee.list",
                  parsedQuery.filters,
                  parsedQuery.cursor,
                )
              : ingressRequestFingerprint,
            ...(parsedQuery
              ? {
                  sort: `${parsedQuery.sort ?? "employeeId"}:${parsedQuery.direction ?? "asc"}`,
                  pageSize: parsedQuery.limit,
                }
              : {}),
            resourceType: "employee",
            correlationId,
            policyDecision: "deny",
            reasonCode: error.code,
            durationMs: elapsedP2ListDurationMs(startedAt),
          },
          error,
        );
      }
      return reply.code(statusForError(responseError.code)).send({
        code: responseError.code,
        message: publicErrorMessage(responseError.code),
        correlationId,
        readiness: p2ListReadiness,
      });
    }
  });

  app.get(
    "/employees/:employeeId",
    { logLevel: "silent" },
    async (request, reply) => {
      const startedAt = startP2ListDuration();
      const runtime = options.p2ListEmployeeApi;
      if (runtime && typeof runtime.emitAuditEvent !== "function") {
        throw new Error("The employee detail audit sink is required.");
      }
      const correlationId = resolveP2ListCorrelationId(
        request,
        runtime?.createCorrelationId,
      );
      const occurredAt = (runtime?.now?.() ?? new Date()).toISOString();
      const acceptedAt = await resolveP2ListCorrelationAcceptedAt(
        runtime,
        correlationId,
        occurredAt,
      );
      const ingressRequestFingerprint = fingerprintP2ListRequestInput(
        "employee.detail",
        {
          params: request.params,
          query: request.query,
        },
      );
      reply.header("x-correlation-id", correlationId);
      reply.header(p2ListCorrelationHeader, correlationId);

      let actor: P2ListActorContext | undefined;
      let detailFilterFingerprint = ingressRequestFingerprint;
      try {
        if (!runtime) {
          throw new P2ListReadModelError(
            "actor_context_required",
            "Server actor context is required.",
          );
        }
        actor = await runtime.resolveActor(request);
        if (!actor) {
          throw new P2ListReadModelError(
            "actor_context_required",
            "Server actor context is required.",
          );
        }
        const employeeId = requireBoundedString(
          (request.params as Record<string, unknown>).employeeId,
          1,
          128,
          "invalid_filter",
        );
        const detailQuery = parseEmployeeDetailQuery(request.query);
        detailFilterFingerprint = fingerprintP2ListRequestInput(
          "employee.detail",
          {
            employeeId,
            asOf: detailQuery.asOf ?? acceptedAt.slice(0, 10),
          },
        );
        const detail = runtime.repository.getEmployee({
          actor,
          provenance: runtime.provenance,
          acceptedAt,
          employeeId,
          ...(detailQuery.asOf !== undefined ? { asOf: detailQuery.asOf } : {}),
        });
        const item = detail.item;
        if (!item) {
          await emitAuditEvent(runtime, {
            eventId: randomUUID(),
            eventType: "authorization.denied",
            eventVersion: p2ListAuditEventVersion,
            occurredAt,
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            evaluatedPermission: p2ListPermissions.employeeDetailRead,
            dataScopeId: fingerprintP2ListAuthorizationScope(actor),
            filterFingerprint: detailFilterFingerprint,
            resourceType: "employee",
            correlationId,
            policyDecision: "deny",
            reasonCode: "data_scope_denied",
            durationMs: elapsedP2ListDurationMs(startedAt),
          });
          return reply.code(404).send({
            code: "data_scope_denied",
            message: "The requested employee detail is unavailable.",
            correlationId,
            readiness: p2ListReadiness,
          });
        }

        await emitAuditEvent(runtime, {
          eventId: randomUUID(),
          eventType: "employee_detail.opened_from_list",
          eventVersion: p2ListAuditEventVersion,
          occurredAt,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          evaluatedPermission: p2ListPermissions.employeeDetailRead,
          dataScopeId: fingerprintP2ListAuthorizationScope(actor),
          filterFingerprint: fingerprintP2ListRequestResult(
            "employee.detail",
            fingerprintP2ListRequestInput(
              "employee.detail",
              detail.appliedFilters,
            ),
            item,
          ),
          rowCount: 1,
          resourceType: "employee",
          correlationId,
          policyDecision: "allow",
          durationMs: elapsedP2ListDurationMs(startedAt),
        });
        return reply.send({
          item,
          asOf: detail.appliedFilters.asOf,
          authorization: {
            dataScope: "bounded" as const,
            maskedFields: [] as string[],
            readiness: p2ListReadiness,
          },
          correlationId,
        });
      } catch (error) {
        if (!(error instanceof P2ListReadModelError)) {
          throw error;
        }
        let responseError = error;
        if (runtime && authorizationAuditErrorCodes.has(error.code)) {
          responseError = await emitDenialAuditEvent(
            runtime,
            {
              eventId: randomUUID(),
              eventType: "authorization.denied",
              eventVersion: p2ListAuditEventVersion,
              occurredAt,
              actorId: safeActorId(actor),
              actorRole: safeP2ListActorRole(actor),
              evaluatedPermission: p2ListPermissions.employeeDetailRead,
              dataScopeId: safeDataScopeFingerprint(actor),
              filterFingerprint: detailFilterFingerprint,
              resourceType: "employee",
              correlationId,
              policyDecision: "deny",
              reasonCode: error.code,
              durationMs: elapsedP2ListDurationMs(startedAt),
            },
            error,
          );
        }
        return reply.code(statusForError(responseError.code)).send({
          code: responseError.code,
          message: publicErrorMessage(responseError.code),
          correlationId,
          readiness: p2ListReadiness,
        });
      }
    },
  );
}

function parseEmployeeDetailQuery(value: unknown): { asOf?: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidFilter();
  }
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => key !== "asOf")) {
    throw new P2ListReadModelError(
      "unsupported_filter",
      "The employee detail filter is not supported.",
    );
  }
  return { asOf: readOptionalString(query.asOf) };
}

function parseEmployeeQuery(value: unknown): ParsedEmployeeQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidFilter();
  }
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => !employeeQueryKeys.has(key))) {
    throw new P2ListReadModelError(
      "unsupported_filter",
      "The employee list filter is not supported.",
    );
  }

  const filters: P2ListEmployeeFilters = {};
  for (const key of [
    "q",
    "employeeId",
    "employmentStatus",
    "organizationCode",
    "asOf",
  ] as const) {
    const field = readOptionalString(query[key]);
    if (field !== undefined) {
      Object.assign(filters, { [key]: field });
    }
  }

  const sort = readOptionalString(query.sort);
  if (
    sort !== undefined &&
    !p2ListEmployeeSortFields.includes(sort as EmployeeSort)
  ) {
    throw new P2ListReadModelError(
      "unsupported_sort",
      "The employee list sort is not supported.",
    );
  }
  const direction = readOptionalString(query.direction);
  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    throw new P2ListReadModelError(
      "invalid_sort",
      "The employee list direction is invalid.",
    );
  }
  const limitValue = readOptionalString(query.limit);
  let limit = p2ListDefaultLimit;
  if (limitValue !== undefined) {
    if (!/^[1-9]\d*$/u.test(limitValue)) {
      throw new P2ListReadModelError(
        "limit_out_of_range",
        "The employee list limit is invalid.",
      );
    }
    limit = Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit > p2ListMaximumLimit) {
      throw new P2ListReadModelError(
        "limit_out_of_range",
        "The employee list limit is invalid.",
      );
    }
  }

  const cursor = readOptionalCursor(query.cursor);

  return {
    filters,
    sort: sort as EmployeeSort | undefined,
    direction: direction as "asc" | "desc" | undefined,
    limit,
    cursor,
  };
}

function readOptionalString(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw invalidFilter();
  }
  return value;
}

function readOptionalCursor(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new P2ListReadModelError(
      "cursor_invalid",
      "The employee list cursor is invalid.",
    );
  }
  return value;
}

function safeActorId(
  actor: P2ListActorContext | undefined,
): string | undefined {
  try {
    return requireBoundedString(
      actor?.actorId,
      1,
      256,
      "actor_context_required",
    );
  } catch {
    return undefined;
  }
}

function safeDataScopeFingerprint(
  actor: P2ListActorContext | undefined,
): string | undefined {
  try {
    return actor ? fingerprintP2ListAuthorizationScope(actor) : undefined;
  } catch {
    return undefined;
  }
}

function hasExplicitFilter(filters: P2ListEmployeeFilters): boolean {
  return Object.keys(filters).length > 0;
}

async function emitAuditEvent(
  runtime: P2ListEmployeeApiRuntime,
  event: P2ListEmployeeAuditEvent,
): Promise<void> {
  await runtime.emitAuditEvent(event);
}

async function emitDenialAuditEvent(
  runtime: P2ListEmployeeApiRuntime,
  event: P2ListEmployeeAuditEvent,
  originalError: P2ListReadModelError,
): Promise<P2ListReadModelError> {
  try {
    await emitAuditEvent(runtime, event);
    return originalError;
  } catch (auditError) {
    if (
      auditError instanceof P2ListReadModelError &&
      auditError.code === "correlation_reuse_conflict"
    ) {
      return auditError;
    }
    throw auditError;
  }
}

function invalidFilter(): P2ListReadModelError {
  return new P2ListReadModelError(
    "invalid_filter",
    "The employee list filter is invalid.",
  );
}

function statusForError(code: P2ListErrorCode): 400 | 401 | 403 {
  if (code === "actor_context_required") {
    return 401;
  }
  if (code === "permission_denied" || code === "data_scope_denied") {
    return 403;
  }
  return 400;
}

function publicErrorMessage(code: P2ListErrorCode): string {
  if (code === "actor_context_required") {
    return "Server actor context is required.";
  }
  if (code === "permission_denied" || code === "data_scope_denied") {
    return "The requested employee list is not authorized.";
  }
  return "The employee list request is invalid.";
}
