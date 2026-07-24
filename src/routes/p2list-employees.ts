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
  P2ListReadModelRepository,
  type P2ListEmployeeFilters,
  type P2ListEmployeeQuery,
} from "../p2list-read-model-repository.js";
import {
  fingerprintP2ListValue,
  P2ListReadModelError,
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
    | "authorization.denied";
  eventVersion: typeof p2ListAuditEventVersion;
  occurredAt: string;
  actorId?: string;
  evaluatedPermission: typeof p2ListPermissions.employeeListRead;
  dataScopeId?: string;
  filterFingerprint?: string;
  sort?: string;
  pageSize?: number;
  rowCount?: number;
  resourceType: "employee";
  correlationId: string;
  policyDecision: "allow" | "deny";
  reasonCode?: P2ListErrorCode;
}

export interface P2ListEmployeeApiRuntime {
  repository: P2ListReadModelRepository;
  provenance: P2ListVerifiedSyntheticDataset;
  resolveActor(
    request: FastifyRequest,
  ): MaybePromise<P2ListActorContext | undefined>;
  emitAuditEvent?(event: P2ListEmployeeAuditEvent): MaybePromise<void>;
  now?: () => Date;
  createCorrelationId?: () => string;
}

export function registerP2ListEmployeeRoutes(
  app: FastifyInstance,
  options: { p2ListEmployeeApi?: P2ListEmployeeApiRuntime },
): void {
  app.get("/employees", { logLevel: "silent" }, async (request, reply) => {
    const runtime = options.p2ListEmployeeApi;
    const correlationId =
      runtime?.createCorrelationId?.() ?? `p2list-${randomUUID()}`;
    const occurredAt = (runtime?.now?.() ?? new Date()).toISOString();
    reply.header("x-correlation-id", correlationId);

    let actor: P2ListActorContext | undefined;
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
      const page = runtime.repository.listEmployees({
        ...query,
        actor,
        provenance: runtime.provenance,
        acceptedAt: occurredAt,
      });
      assertOrganizationFilterInScope(query.filters, actor);
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
        evaluatedPermission: p2ListPermissions.employeeListRead,
        dataScopeId: fingerprintP2ListValue(actor.dataScope),
        filterFingerprint: fingerprintP2ListValue(page.appliedFilters),
        sort: `${query.sort ?? "employeeId"}:${query.direction ?? "asc"}`,
        pageSize: page.pageInfo.limit,
        rowCount: page.items.length,
        resourceType: "employee",
        correlationId,
        policyDecision: "allow",
      });
      return reply.send(response);
    } catch (error) {
      if (!(error instanceof P2ListReadModelError)) {
        throw error;
      }

      if (runtime) {
        await emitAuditEvent(runtime, {
          eventId: randomUUID(),
          eventType: "authorization.denied",
          eventVersion: p2ListAuditEventVersion,
          occurredAt,
          actorId: safeActorId(actor),
          evaluatedPermission: p2ListPermissions.employeeListRead,
          dataScopeId: safeDataScopeFingerprint(actor),
          resourceType: "employee",
          correlationId,
          policyDecision: "deny",
          reasonCode: error.code,
        });
      }
      return reply.code(statusForError(error.code)).send({
        code: error.code,
        message: publicErrorMessage(error.code),
        correlationId,
        readiness: p2ListReadiness,
      });
    }
  });
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

  return {
    filters,
    sort: sort as EmployeeSort | undefined,
    direction: direction as "asc" | "desc" | undefined,
    limit,
    cursor: readOptionalString(query.cursor),
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

function assertOrganizationFilterInScope(
  filters: P2ListEmployeeFilters,
  actor: P2ListActorContext,
): void {
  if (filters.organizationCode === undefined) {
    return;
  }
  const organizationCodes = actor.dataScope?.organizationCodes;
  if (
    !Array.isArray(organizationCodes) ||
    !organizationCodes.includes(filters.organizationCode)
  ) {
    throw new P2ListReadModelError(
      "data_scope_denied",
      "The employee list data scope is denied.",
    );
  }
}

function safeActorId(
  actor: P2ListActorContext | undefined,
): string | undefined {
  return typeof actor?.actorId === "string" ? actor.actorId : undefined;
}

function safeDataScopeFingerprint(
  actor: P2ListActorContext | undefined,
): string | undefined {
  try {
    return actor?.dataScope
      ? fingerprintP2ListValue(actor.dataScope)
      : undefined;
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
  await runtime.emitAuditEvent?.(event);
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
