import type { BoundedPersonaId } from "./persona";

export type ApiPath =
  | "/health"
  | "/openapi.json"
  | "/employees"
  | "/lifecycle/transaction-requests";
type ApiRequestPath = ApiPath | `${ApiPath}?${string}`;

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

export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

const listPageLimits = new Set([25, 50, 100]);

function isPageInfo(value: unknown): value is EmployeeListResponse["pageInfo"] {
  return (
    isRecord(value) &&
    typeof value.limit === "number" &&
    Number.isInteger(value.limit) &&
    listPageLimits.has(value.limit) &&
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

function isEmployeeListItem(value: unknown): value is EmployeeListItem {
  return (
    isRecord(value) &&
    typeof value.personId === "string" &&
    typeof value.employeeId === "string" &&
    typeof value.displayName === "string" &&
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
    Array.isArray(value.items) &&
    value.items.every(isEmployeeListItem) &&
    isPageInfo(value.pageInfo) &&
    isRecord(value.appliedFilters) &&
    isIsoDate(value.appliedFilters.asOf) &&
    isAuthorization(value.authorization, employeeFields) &&
    typeof value.correlationId === "string"
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

function isLifecycleRequestListItem(
  value: unknown,
): value is LifecycleRequestListItem {
  return (
    isRecord(value) &&
    typeof value.transactionRequestId === "string" &&
    lifecycleRequestTypes.has(String(value.requestType)) &&
    lifecycleStatuses.has(String(value.status)) &&
    typeof value.subjectPersonId === "string" &&
    isNullableString(value.subjectEmployeeId) &&
    typeof value.subjectDisplayName === "string" &&
    typeof value.organizationCode === "string" &&
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
    Array.isArray(value.items) &&
    value.items.every(isLifecycleRequestListItem) &&
    isPageInfo(value.pageInfo) &&
    isRecord(value.appliedFilters) &&
    isAuthorization(value.authorization, lifecycleFields) &&
    typeof value.correlationId === "string"
  );
}

export function createP2ListRequestInit(
  personaId: BoundedPersonaId,
  signal?: AbortSignal,
): RequestInit {
  const tokenByPersona: Partial<Record<BoundedPersonaId, string | undefined>> =
    {
      "hr-operator": import.meta.env.VITE_P2LIST_HR_OPERATOR_TOKEN,
      approver: import.meta.env.VITE_P2LIST_APPROVER_TOKEN,
      "hr-ops-support": import.meta.env.VITE_P2LIST_SUPPORT_TOKEN,
    };
  const token = tokenByPersona[personaId]?.trim();
  return {
    signal,
    ...(token
      ? {
          headers: {
            authorization: `Bearer ${token}`,
          },
        }
      : {}),
  };
}

async function readJson<T>(
  path: ApiRequestPath,
  operation: ApiPath,
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
    throw new ApiClientError(
      `Request failed for ${operation}: ${response.status}`,
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

export async function fetchOpenApiContract(): Promise<ApiContract> {
  const contract = await readJson<ApiContract>(
    "/openapi.json",
    "/openapi.json",
  );

  if (
    contract.openapi !== "3.1.0" ||
    contract.info?.title !== "HRCore API" ||
    !contract.paths?.["/health"]
  ) {
    throw new ApiClientError(
      "OpenAPI contract did not match the repository-owned HRCore API shape.",
    );
  }

  return contract;
}
