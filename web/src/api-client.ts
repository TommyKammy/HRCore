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

async function readJson<T>(
  path: ApiRequestPath,
  operation: ApiPath,
  init?: RequestInit,
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

  return (await response.json()) as T;
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
