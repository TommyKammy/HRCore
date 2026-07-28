import { randomUUID } from "node:crypto";

import { type FastifyInstance, type FastifyRequest } from "fastify";

import {
  p2ListAuditEventVersion,
  p2ListDefaultLimit,
  p2ListLifecycleSortFields,
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
  type P2ListLifecycleFilters,
  type P2ListLifecycleQuery,
} from "../p2list-read-model-repository.js";
import {
  fingerprintP2ListCollectionRequest,
  fingerprintP2ListRequestInput,
  fingerprintP2ListRequestResult,
} from "../p2list-request-identity.js";
import {
  fingerprintP2ListAuthorizationScope,
  P2ListReadModelError,
  requireBoundedString,
  type P2ListActorContext,
  type P2ListVerifiedSyntheticDataset,
} from "../p2list-read-model-types.js";

const lifecycleQueryKeys = new Set([
  "requestType",
  "status",
  "subjectEmployeeId",
  "q",
  "organizationCode",
  "decidedBy",
  "requestedFrom",
  "requestedTo",
  "effectiveFrom",
  "effectiveTo",
  "correlationId",
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
type LifecycleSort = NonNullable<P2ListLifecycleQuery["sort"]>;
type ParsedLifecycleQuery = Omit<
  P2ListLifecycleQuery,
  "actor" | "provenance" | "filters"
> & {
  filters: P2ListLifecycleFilters;
};

export interface P2ListLifecycleAuditEvent {
  eventId: string;
  eventType:
    | "lifecycle_request_list.viewed"
    | "lifecycle_request_list.search_applied"
    | "lifecycle_request_list.page_requested"
    | "lifecycle_request_detail.opened_from_list"
    | "authorization.denied";
  eventVersion: typeof p2ListAuditEventVersion;
  occurredAt: string;
  actorId?: string;
  actorRole?: string;
  evaluatedPermission:
    | typeof p2ListPermissions.lifecycleRequestListRead
    | typeof p2ListPermissions.lifecycleRequestDetailRead;
  dataScopeId?: string;
  filterFingerprint?: string;
  sort?: string;
  pageSize?: number;
  rowCount?: number;
  resourceType: "lifecycleRequest";
  correlationId: string;
  policyDecision: "allow" | "deny";
  reasonCode?: P2ListErrorCode;
  durationMs: number;
}

export interface P2ListLifecycleApiRuntime {
  repository: P2ListReadModelRepository;
  provenance: P2ListVerifiedSyntheticDataset;
  resolveActor(
    request: FastifyRequest,
  ): MaybePromise<P2ListActorContext | undefined>;
  emitAuditEvent(event: P2ListLifecycleAuditEvent): MaybePromise<void>;
  now?: () => Date;
  createCorrelationId?: () => string;
}

export function registerP2ListLifecycleRoutes(
  app: FastifyInstance,
  options: { p2ListLifecycleApi?: P2ListLifecycleApiRuntime },
): void {
  app.get(
    "/lifecycle/transaction-requests",
    { logLevel: "silent" },
    async (request, reply) => {
      const startedAt = startP2ListDuration();
      const runtime = options.p2ListLifecycleApi;
      if (runtime && typeof runtime.emitAuditEvent !== "function") {
        throw new Error("The lifecycle request list audit sink is required.");
      }
      const correlationId = resolveP2ListCorrelationId(
        request,
        runtime?.createCorrelationId,
      );
      const occurredAt = (runtime?.now?.() ?? new Date()).toISOString();
      const ingressRequestFingerprint = fingerprintP2ListRequestInput(
        "lifecycleRequest.list",
        request.query,
      );
      reply.header("x-correlation-id", correlationId);
      reply.header(p2ListCorrelationHeader, correlationId);

      let actor: P2ListActorContext | undefined;
      let parsedQuery: ParsedLifecycleQuery | undefined;
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

        const query = parseLifecycleQuery(request.query);
        parsedQuery = query;
        const page = runtime.repository.listLifecycleRequests({
          ...query,
          actor,
          provenance: runtime.provenance,
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

        await runtime.emitAuditEvent({
          eventId: randomUUID(),
          eventType: query.cursor
            ? "lifecycle_request_list.page_requested"
            : hasExplicitFilter(query.filters)
              ? "lifecycle_request_list.search_applied"
              : "lifecycle_request_list.viewed",
          eventVersion: p2ListAuditEventVersion,
          occurredAt,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          evaluatedPermission: p2ListPermissions.lifecycleRequestListRead,
          dataScopeId: fingerprintP2ListAuthorizationScope(actor),
          filterFingerprint: fingerprintP2ListRequestResult(
            "lifecycleRequest.list",
            fingerprintP2ListCollectionRequest(
              "lifecycleRequest.list",
              page.appliedFilters,
              query.cursor,
            ),
            {
              items: page.items,
              pageInfo: page.pageInfo,
            },
          ),
          sort: `${query.sort ?? "requestedAt"}:${query.direction ?? "desc"}`,
          pageSize: page.pageInfo.limit,
          rowCount: page.items.length,
          resourceType: "lifecycleRequest",
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
              evaluatedPermission: p2ListPermissions.lifecycleRequestListRead,
              dataScopeId: safeDataScopeFingerprint(actor),
              filterFingerprint: parsedQuery
                ? fingerprintP2ListCollectionRequest(
                    "lifecycleRequest.list",
                    parsedQuery.filters,
                    parsedQuery.cursor,
                  )
                : ingressRequestFingerprint,
              ...(parsedQuery
                ? {
                    sort: `${parsedQuery.sort ?? "requestedAt"}:${parsedQuery.direction ?? "desc"}`,
                    pageSize: parsedQuery.limit,
                  }
                : {}),
              resourceType: "lifecycleRequest",
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

  app.get(
    "/lifecycle/transaction-requests/:requestId",
    { logLevel: "silent" },
    async (request, reply) => {
      const startedAt = startP2ListDuration();
      const runtime = options.p2ListLifecycleApi;
      if (runtime && typeof runtime.emitAuditEvent !== "function") {
        throw new Error("The lifecycle detail audit sink is required.");
      }
      const correlationId = resolveP2ListCorrelationId(
        request,
        runtime?.createCorrelationId,
      );
      const occurredAt = (runtime?.now?.() ?? new Date()).toISOString();
      const ingressRequestFingerprint = fingerprintP2ListRequestInput(
        "lifecycleRequest.detail",
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
        if (
          !request.query ||
          typeof request.query !== "object" ||
          Array.isArray(request.query)
        ) {
          throw invalidFilter();
        }
        if (Object.keys(request.query).length > 0) {
          throw new P2ListReadModelError(
            "unsupported_filter",
            "The lifecycle detail filter is not supported.",
          );
        }
        const requestId = requireBoundedString(
          (request.params as Record<string, unknown>).requestId,
          1,
          256,
          "invalid_filter",
        );
        detailFilterFingerprint = fingerprintP2ListRequestInput(
          "lifecycleRequest.detail",
          { transactionRequestId: requestId },
        );
        const item = runtime.repository.getLifecycleRequest({
          actor,
          provenance: runtime.provenance,
          transactionRequestId: requestId,
        });
        if (!item) {
          await runtime.emitAuditEvent({
            eventId: randomUUID(),
            eventType: "authorization.denied",
            eventVersion: p2ListAuditEventVersion,
            occurredAt,
            actorId: actor.actorId,
            actorRole: actor.actorRole,
            evaluatedPermission: p2ListPermissions.lifecycleRequestDetailRead,
            dataScopeId: fingerprintP2ListAuthorizationScope(actor),
            filterFingerprint: detailFilterFingerprint,
            resourceType: "lifecycleRequest",
            correlationId,
            policyDecision: "deny",
            reasonCode: "data_scope_denied",
            durationMs: elapsedP2ListDurationMs(startedAt),
          });
          return reply.code(404).send({
            code: "data_scope_denied",
            message: "The requested lifecycle detail is unavailable.",
            correlationId,
            readiness: p2ListReadiness,
          });
        }

        await runtime.emitAuditEvent({
          eventId: randomUUID(),
          eventType: "lifecycle_request_detail.opened_from_list",
          eventVersion: p2ListAuditEventVersion,
          occurredAt,
          actorId: actor.actorId,
          actorRole: actor.actorRole,
          evaluatedPermission: p2ListPermissions.lifecycleRequestDetailRead,
          dataScopeId: fingerprintP2ListAuthorizationScope(actor),
          filterFingerprint: fingerprintP2ListRequestResult(
            "lifecycleRequest.detail",
            fingerprintP2ListRequestInput("lifecycleRequest.detail", {
              transactionRequestId: requestId,
            }),
            item,
          ),
          rowCount: 1,
          resourceType: "lifecycleRequest",
          correlationId,
          policyDecision: "allow",
          durationMs: elapsedP2ListDurationMs(startedAt),
        });
        return reply.send({
          item,
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
              evaluatedPermission: p2ListPermissions.lifecycleRequestDetailRead,
              dataScopeId: safeDataScopeFingerprint(actor),
              filterFingerprint: detailFilterFingerprint,
              resourceType: "lifecycleRequest",
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

function parseLifecycleQuery(value: unknown): ParsedLifecycleQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalidFilter();
  }
  const query = value as Record<string, unknown>;
  if (Object.keys(query).some((key) => !lifecycleQueryKeys.has(key))) {
    throw new P2ListReadModelError(
      "unsupported_filter",
      "The lifecycle request list filter is not supported.",
    );
  }

  const filters: P2ListLifecycleFilters = {};
  const requestType = readOptionalCsv(query.requestType);
  if (requestType !== undefined) {
    filters.requestType = requestType as NonNullable<
      P2ListLifecycleFilters["requestType"]
    >;
  }
  const status = readOptionalCsv(query.status);
  if (status !== undefined) {
    filters.status = status as NonNullable<P2ListLifecycleFilters["status"]>;
  }
  for (const key of [
    "subjectEmployeeId",
    "q",
    "organizationCode",
    "decidedBy",
    "requestedFrom",
    "requestedTo",
    "effectiveFrom",
    "effectiveTo",
    "correlationId",
  ] as const) {
    const field = readOptionalString(query[key]);
    if (field !== undefined) {
      Object.assign(filters, { [key]: field });
    }
  }

  const sort = readOptionalString(query.sort);
  if (
    sort !== undefined &&
    !p2ListLifecycleSortFields.includes(sort as LifecycleSort)
  ) {
    throw new P2ListReadModelError(
      "unsupported_sort",
      "The lifecycle request list sort is not supported.",
    );
  }
  const direction = readOptionalString(query.direction);
  if (direction !== undefined && direction !== "asc" && direction !== "desc") {
    throw new P2ListReadModelError(
      "invalid_sort",
      "The lifecycle request list direction is invalid.",
    );
  }
  const limitValue = readOptionalString(query.limit);
  let limit = p2ListDefaultLimit;
  if (limitValue !== undefined) {
    if (!/^[1-9]\d*$/u.test(limitValue)) {
      throw new P2ListReadModelError(
        "limit_out_of_range",
        "The lifecycle request list limit is invalid.",
      );
    }
    limit = Number(limitValue);
    if (!Number.isSafeInteger(limit) || limit > p2ListMaximumLimit) {
      throw new P2ListReadModelError(
        "limit_out_of_range",
        "The lifecycle request list limit is invalid.",
      );
    }
  }

  return {
    filters,
    sort: sort as LifecycleSort | undefined,
    direction: direction as "asc" | "desc" | undefined,
    limit,
    cursor: readOptionalCursor(query.cursor),
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

function readOptionalCsv(value: unknown): string[] | undefined {
  const text = readOptionalString(value);
  return text === undefined ? undefined : text.split(",");
}

function readOptionalCursor(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new P2ListReadModelError(
      "cursor_invalid",
      "The lifecycle request list cursor is invalid.",
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

async function emitDenialAuditEvent(
  runtime: P2ListLifecycleApiRuntime,
  event: P2ListLifecycleAuditEvent,
  originalError: P2ListReadModelError,
): Promise<P2ListReadModelError> {
  try {
    await runtime.emitAuditEvent(event);
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

function safeDataScopeFingerprint(
  actor: P2ListActorContext | undefined,
): string | undefined {
  try {
    return actor ? fingerprintP2ListAuthorizationScope(actor) : undefined;
  } catch {
    return undefined;
  }
}

function hasExplicitFilter(filters: P2ListLifecycleFilters): boolean {
  return Object.keys(filters).length > 0;
}

function invalidFilter(): P2ListReadModelError {
  return new P2ListReadModelError(
    "invalid_filter",
    "The lifecycle request list filter is invalid.",
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
    return "The requested lifecycle request list is not authorized.";
  }
  return "The lifecycle request list request is invalid.";
}
