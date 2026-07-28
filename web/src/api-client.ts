import type { BoundedPersonaId } from "./persona";
import {
  p2ListExportSchemaVersion,
  p2ListMaximumLimit,
  type P2ListExportReasonCode,
} from "../../src/p2list-contract";

export type ApiPath =
  | "/health"
  | "/openapi.json"
  | "/employees"
  | "/lifecycle/transaction-requests";
type ApiOperationPath =
  | ApiPath
  | "/exports/employee-list"
  | "/exports/lifecycle-request-list"
  | "/employees/{employeeId}"
  | "/lifecycle/transaction-requests/{requestId}";
type ApiRequestPath =
  | ApiPath
  | "/exports/employee-list"
  | "/exports/lifecycle-request-list"
  | `${ApiPath}?${string}`
  | `/employees/${string}`
  | `/lifecycle/transaction-requests/${string}`;

export interface ApiContract {
  openapi: "3.1.0";
  info: {
    title: "HRCore API";
    version: string;
  };
  paths: Partial<Record<ApiPath | string, unknown>>;
}

export interface HealthResponse {
  status: "ok";
}

export interface EmployeeListQuery {
  q?: string;
  employeeId?: string;
  employmentStatus?: "active" | "inactive" | "terminated";
  organizationCode?: string;
  asOf?: string;
  sort?: "employeeId" | "displayName" | "hireDate";
  direction?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export interface EmployeeListItem {
  personId: string;
  employeeId: string;
  displayName: string;
  employmentStatus: "active" | "inactive" | "terminated";
  organizationCode: string | null;
  positionCode: string | null;
  hireDate: string;
  terminationDate: string | null;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  pageInfo: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
  appliedFilters: {
    q?: string;
    employeeId?: string;
    employmentStatus?: "active" | "inactive" | "terminated";
    organizationCode?: string;
    asOf: string;
  };
  authorization: {
    dataScope: "bounded";
    maskedFields: Array<keyof EmployeeListItem>;
    readiness: "bounded_synthetic_only_not_production_ready";
  };
  correlationId: string;
}

export interface EmployeeDetailResponse {
  item: EmployeeListItem;
  asOf: string;
  authorization: EmployeeListResponse["authorization"];
  correlationId: string;
}

export interface LifecycleRequestListQuery {
  requestType?: Array<"onboarding" | "transfer" | "termination">;
  status?: Array<
    | "draft"
    | "submitted"
    | "returned"
    | "rejected"
    | "cancelled"
    | "approved"
    | "completed"
  >;
  subjectEmployeeId?: string;
  q?: string;
  organizationCode?: string;
  decidedBy?: string;
  requestedFrom?: string;
  requestedTo?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  correlationId?: string;
  sort?: "requestedAt" | "effectiveDate";
  direction?: "asc" | "desc";
  limit?: number;
  cursor?: string;
}

export interface LifecycleRequestListItem {
  transactionRequestId: string;
  requestType: "onboarding" | "transfer" | "termination";
  status:
    | "draft"
    | "submitted"
    | "returned"
    | "rejected"
    | "cancelled"
    | "approved"
    | "completed";
  subjectPersonId: string;
  subjectEmployeeId: string | null;
  subjectDisplayName: string;
  organizationCode: string;
  decidedBy: string | null;
  requestedAt: string;
  effectiveDate: string;
}

export interface LifecycleRequestListResponse {
  items: LifecycleRequestListItem[];
  pageInfo: {
    limit: number;
    hasNextPage: boolean;
    nextCursor: string | null;
  };
  appliedFilters: Omit<
    LifecycleRequestListQuery,
    "sort" | "direction" | "limit" | "cursor"
  >;
  authorization: {
    dataScope: "bounded";
    maskedFields: Array<keyof LifecycleRequestListItem>;
    readiness: "bounded_synthetic_only_not_production_ready";
  };
  correlationId: string;
}

export interface LifecycleRequestDetailResponse {
  item: LifecycleRequestListItem;
  authorization: LifecycleRequestListResponse["authorization"];
  correlationId: string;
}

export type EmployeeExportFilters = EmployeeListResponse["appliedFilters"];
export type LifecycleExportFilters =
  LifecycleRequestListResponse["appliedFilters"];

export interface BoundedExportArtifact {
  csv: string;
  fileName: string;
  schemaVersion: typeof p2ListExportSchemaVersion;
  correlationId: string;
}

export class ApiClientError extends Error {
  declare readonly status?: number;
  declare readonly correlationId?: string;
  declare readonly code?: string;

  constructor(
    message: string,
    options?: { status?: number; correlationId?: string; code?: string },
  ) {
    super(message);
    this.name = "ApiClientError";
    if (options?.status !== undefined) {
      this.status = options.status;
    }
    if (options?.correlationId !== undefined) {
      this.correlationId = options.correlationId;
    }
    if (options?.code !== undefined) {
      this.code = options.code;
    }
  }
}

const completedP2ListDenialCodes = new Set([
  "actor_context_required",
  "permission_denied",
  "data_scope_denied",
]);

export function isCompletedP2ListDenial(caught: unknown): boolean {
  return (
    caught instanceof ApiClientError &&
    (caught.status === 401 ||
      caught.status === 403 ||
      completedP2ListDenialCodes.has(caught.code ?? ""))
  );
}

const requiredApiContractPaths = [
  "/health",
  "/employees",
  "/employees/{employeeId}",
  "/lifecycle/transaction-requests",
  "/lifecycle/transaction-requests/{requestId}",
  "/support/p2list/audit-evidence/{correlationId}",
] as const;
const requiredApiContractPostPaths = [
  "/exports/employee-list",
  "/exports/lifecycle-request-list",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasExactKeys(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === allowedKeys.size &&
    keys.every((key) => allowedKeys.has(key))
  );
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match =
    /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})\.\d{3}Z$/u.exec(
      value,
    );
  const groups = match?.groups;
  if (!groups) {
    return false;
  }
  const calendarProbe = new Date(
    Date.UTC(Number(groups.year), Number(groups.month) - 1, Number(groups.day)),
  );
  return (
    calendarProbe.getUTCFullYear() === Number(groups.year) &&
    calendarProbe.getUTCMonth() === Number(groups.month) - 1 &&
    calendarProbe.getUTCDate() === Number(groups.day) &&
    Number(groups.hour) <= 23 &&
    Number(groups.minute) <= 59 &&
    Number(groups.second) <= 59 &&
    Number.isFinite(new Date(value).getTime())
  );
}

function isPageInfo(value: unknown): value is EmployeeListResponse["pageInfo"] {
  return (
    isRecord(value) &&
    typeof value.limit === "number" &&
    Number.isInteger(value.limit) &&
    value.limit >= 1 &&
    value.limit <= 100 &&
    typeof value.hasNextPage === "boolean" &&
    isNullableString(value.nextCursor) &&
    (value.hasNextPage
      ? typeof value.nextCursor === "string" && value.nextCursor.length > 0
      : value.nextCursor === null)
  );
}

function isAuthorization(
  value: unknown,
  allowedMaskedFields: ReadonlySet<string>,
): value is EmployeeListResponse["authorization"] {
  return (
    isRecord(value) &&
    value.dataScope === "bounded" &&
    value.readiness === "bounded_synthetic_only_not_production_ready" &&
    Array.isArray(value.maskedFields) &&
    value.maskedFields.every(
      (field) => typeof field === "string" && allowedMaskedFields.has(field),
    )
  );
}

const employeeStatuses = new Set(["active", "inactive", "terminated"]);
const employeeFields = new Set([
  "personId",
  "employeeId",
  "displayName",
  "employmentStatus",
  "organizationCode",
  "positionCode",
  "hireDate",
  "terminationDate",
]);
const employeeListResponseFields = new Set([
  "items",
  "pageInfo",
  "appliedFilters",
  "authorization",
  "correlationId",
]);
const employeeDetailResponseFields = new Set([
  "item",
  "asOf",
  "authorization",
  "correlationId",
]);

function isEmployeeListItem(value: unknown): value is EmployeeListItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, employeeFields) &&
    isNonEmptyString(value.personId) &&
    isNonEmptyString(value.employeeId) &&
    isNonEmptyString(value.displayName) &&
    employeeStatuses.has(String(value.employmentStatus)) &&
    isNullableString(value.organizationCode) &&
    isNullableString(value.positionCode) &&
    isIsoDate(value.hireDate) &&
    (value.terminationDate === null || isIsoDate(value.terminationDate))
  );
}

function isEmployeeListResponse(value: unknown): value is EmployeeListResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, employeeListResponseFields) &&
    Array.isArray(value.items) &&
    value.items.length <= p2ListMaximumLimit &&
    value.items.every(isEmployeeListItem) &&
    isPageInfo(value.pageInfo) &&
    isRecord(value.appliedFilters) &&
    isIsoDate(value.appliedFilters.asOf) &&
    isAuthorization(value.authorization, employeeFields) &&
    isNonEmptyString(value.correlationId)
  );
}

function isEmployeeDetailResponse(
  value: unknown,
): value is EmployeeDetailResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, employeeDetailResponseFields) &&
    isEmployeeListItem(value.item) &&
    isIsoDate(value.asOf) &&
    isAuthorization(value.authorization, employeeFields) &&
    isNonEmptyString(value.correlationId)
  );
}

const lifecycleRequestTypes = new Set([
  "onboarding",
  "transfer",
  "termination",
]);
const lifecycleStatuses = new Set([
  "draft",
  "submitted",
  "returned",
  "rejected",
  "cancelled",
  "approved",
  "completed",
]);
const lifecycleFields = new Set([
  "transactionRequestId",
  "requestType",
  "status",
  "subjectPersonId",
  "subjectEmployeeId",
  "subjectDisplayName",
  "organizationCode",
  "decidedBy",
  "requestedAt",
  "effectiveDate",
]);
const lifecycleListResponseFields = new Set([
  "items",
  "pageInfo",
  "appliedFilters",
  "authorization",
  "correlationId",
]);
const lifecycleDetailResponseFields = new Set([
  "item",
  "authorization",
  "correlationId",
]);

function isLifecycleRequestListItem(
  value: unknown,
): value is LifecycleRequestListItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, lifecycleFields) &&
    isNonEmptyString(value.transactionRequestId) &&
    lifecycleRequestTypes.has(String(value.requestType)) &&
    lifecycleStatuses.has(String(value.status)) &&
    isNonEmptyString(value.subjectPersonId) &&
    isNullableString(value.subjectEmployeeId) &&
    isNonEmptyString(value.subjectDisplayName) &&
    isNonEmptyString(value.organizationCode) &&
    isNullableString(value.decidedBy) &&
    isIsoTimestamp(value.requestedAt) &&
    isIsoDate(value.effectiveDate)
  );
}

function isLifecycleRequestListResponse(
  value: unknown,
): value is LifecycleRequestListResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, lifecycleListResponseFields) &&
    Array.isArray(value.items) &&
    value.items.length <= p2ListMaximumLimit &&
    value.items.every(isLifecycleRequestListItem) &&
    isPageInfo(value.pageInfo) &&
    isRecord(value.appliedFilters) &&
    isAuthorization(value.authorization, lifecycleFields) &&
    isNonEmptyString(value.correlationId)
  );
}

function isLifecycleRequestDetailResponse(
  value: unknown,
): value is LifecycleRequestDetailResponse {
  return (
    isRecord(value) &&
    hasExactKeys(value, lifecycleDetailResponseFields) &&
    isLifecycleRequestListItem(value.item) &&
    isAuthorization(value.authorization, lifecycleFields) &&
    isNonEmptyString(value.correlationId)
  );
}

export function createP2ListRequestInit(
  personaId: BoundedPersonaId,
  signal?: AbortSignal,
  correlationId = createP2ListCorrelationId(),
): RequestInit {
  const tokenByPersona: Partial<Record<BoundedPersonaId, string | undefined>> =
    {
      "hr-operator": import.meta.env.VITE_P2LIST_HR_OPERATOR_TOKEN,
      approver: import.meta.env.VITE_P2LIST_APPROVER_TOKEN,
      "hr-ops-support": import.meta.env.VITE_P2LIST_SUPPORT_TOKEN,
    };
  const token = tokenByPersona[personaId]?.trim();
  const headers = new Headers();
  headers.set("x-hrcore-correlation-id", correlationId);
  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return {
    signal,
    headers,
  };
}

export function createP2ListCorrelationId(): string {
  return `p2list-ui-${globalThis.crypto.randomUUID()}`;
}

async function readJson<T>(
  path: ApiRequestPath,
  operation: ApiOperationPath,
  init?: RequestInit,
  validate?: (value: unknown) => value is T,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }
  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const errorDetails = await readErrorDetails(response);
    throw new ApiClientError(
      `Request failed for ${operation}: ${response.status}`,
      { status: response.status, ...errorDetails },
    );
  }

  const payload: unknown = await response.json();
  if (validate && !validate(payload)) {
    throw new ApiClientError(
      `Response contract did not match the repository-owned shape for ${operation}.`,
    );
  }
  return payload as T;
}

async function readErrorDetails(
  response: Response,
): Promise<{ correlationId?: string; code?: string }> {
  const headerValue =
    response.headers.get("x-hrcore-correlation-id")?.trim() ||
    response.headers.get("x-correlation-id")?.trim();
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload)) {
      return headerValue ? { correlationId: headerValue } : {};
    }
    const correlationId = headerValue
      ? headerValue
      : isNonEmptyString(payload.correlationId)
        ? payload.correlationId
        : undefined;
    const code =
      typeof payload.code === "string" &&
      /^[a-z][a-z0-9_]{0,63}$/u.test(payload.code)
        ? payload.code
        : undefined;
    return {
      ...(correlationId ? { correlationId } : {}),
      ...(code ? { code } : {}),
    };
  } catch {
    return headerValue ? { correlationId: headerValue } : {};
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  return readJson<HealthResponse>("/health", "/health");
}

export async function fetchEmployees(
  query: EmployeeListQuery = {},
  init?: RequestInit,
): Promise<EmployeeListResponse> {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      parameters.set(key, String(value));
    }
  }
  const queryString = parameters.toString();
  return readJson<EmployeeListResponse>(
    queryString ? `/employees?${queryString}` : "/employees",
    "/employees",
    init,
    isEmployeeListResponse,
  );
}

export async function fetchEmployeeDetail(
  employeeId: string,
  query: Pick<EmployeeListQuery, "asOf"> = {},
  init?: RequestInit,
): Promise<EmployeeDetailResponse> {
  const parameters = new URLSearchParams();
  if (query.asOf !== undefined) {
    parameters.set("asOf", query.asOf);
  }
  const queryString = parameters.toString();
  const operation = "/employees/{employeeId}";
  const path: `/employees/${string}` = `/employees/${encodeURIComponent(employeeId)}`;
  return readJson<EmployeeDetailResponse>(
    queryString ? `${path}?${queryString}` : path,
    operation,
    init,
    isEmployeeDetailResponse,
  );
}

export async function fetchLifecycleRequests(
  query: LifecycleRequestListQuery = {},
  init?: RequestInit,
): Promise<LifecycleRequestListResponse> {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      parameters.set(
        key,
        Array.isArray(value) ? value.join(",") : String(value),
      );
    }
  }
  const queryString = parameters.toString();
  const path = "/lifecycle/transaction-requests";
  return readJson<LifecycleRequestListResponse>(
    queryString ? `${path}?${queryString}` : path,
    path,
    init,
    isLifecycleRequestListResponse,
  );
}

export async function fetchLifecycleRequestDetail(
  requestId: string,
  init?: RequestInit,
): Promise<LifecycleRequestDetailResponse> {
  const operation = "/lifecycle/transaction-requests/{requestId}";
  return readJson<LifecycleRequestDetailResponse>(
    `/lifecycle/transaction-requests/${encodeURIComponent(requestId)}`,
    operation,
    init,
    isLifecycleRequestDetailResponse,
  );
}

export async function fetchEmployeeExport(
  filters: EmployeeExportFilters,
  reasonCode: P2ListExportReasonCode,
  init?: RequestInit,
): Promise<BoundedExportArtifact> {
  return fetchBoundedExport(
    "/exports/employee-list",
    filters,
    reasonCode,
    init,
  );
}

export async function fetchLifecycleExport(
  filters: LifecycleExportFilters,
  reasonCode: P2ListExportReasonCode,
  init?: RequestInit,
): Promise<BoundedExportArtifact> {
  return fetchBoundedExport(
    "/exports/lifecycle-request-list",
    filters,
    reasonCode,
    init,
  );
}

async function fetchBoundedExport(
  path: "/exports/employee-list" | "/exports/lifecycle-request-list",
  filters: EmployeeExportFilters | LifecycleExportFilters,
  reasonCode: P2ListExportReasonCode,
  init?: RequestInit,
): Promise<BoundedExportArtifact> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "text/csv");
  headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify({ filters, reasonCode }),
  });
  if (!response.ok) {
    const errorDetails = await readErrorDetails(response);
    throw new ApiClientError(`Request failed for ${path}: ${response.status}`, {
      status: response.status,
      ...errorDetails,
    });
  }

  const contentType = response.headers
    .get("content-type")
    ?.toLowerCase()
    .replaceAll(" ", "");
  const schemaVersion = response.headers.get("x-hrcore-export-schema-version");
  const correlationId = response.headers.get("x-hrcore-correlation-id")?.trim();
  const fileName = parseExportFileName(
    response.headers.get("content-disposition"),
  );
  if (
    contentType !== "text/csv;charset=utf-8" ||
    schemaVersion !== p2ListExportSchemaVersion ||
    !correlationId ||
    !fileName
  ) {
    throw new ApiClientError(
      `Response contract did not match the repository-owned shape for ${path}.`,
    );
  }
  return {
    csv: await response.text(),
    fileName,
    schemaVersion,
    correlationId,
  };
}

function parseExportFileName(value: string | null): string | undefined {
  const match = /^attachment; filename="(?<fileName>[a-z0-9._-]+\.csv)"$/u.exec(
    value ?? "",
  );
  return match?.groups?.fileName;
}

export async function fetchOpenApiContract(): Promise<ApiContract> {
  const contract = await readJson<ApiContract>(
    "/openapi.json",
    "/openapi.json",
  );

  if (
    contract.openapi !== "3.1.0" ||
    contract.info?.title !== "HRCore API" ||
    !isRecord(contract.paths) ||
    requiredApiContractPaths.some((path) => {
      const pathItem = contract.paths[path];
      return !isRecord(pathItem) || !isRecord(pathItem.get);
    }) ||
    requiredApiContractPostPaths.some((path) => {
      const pathItem = contract.paths[path];
      return !isRecord(pathItem) || !isRecord(pathItem.post);
    })
  ) {
    throw new ApiClientError(
      "OpenAPI contract did not match the repository-owned HRCore API shape.",
    );
  }

  return contract;
}
