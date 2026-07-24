export type ApiPath = "/health" | "/openapi.json" | "/employees";
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

export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readJson<T>(
  path: ApiRequestPath,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiClientError(`Request failed for ${path}: ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return readJson<HealthResponse>("/health");
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
    init,
  );
}

export async function fetchOpenApiContract(): Promise<ApiContract> {
  const contract = await readJson<ApiContract>("/openapi.json");

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
