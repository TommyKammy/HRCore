export type ApiPath = "/health" | "/openapi.json";

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

export class ApiClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readJson<T>(path: ApiPath, init?: RequestInit): Promise<T> {
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
