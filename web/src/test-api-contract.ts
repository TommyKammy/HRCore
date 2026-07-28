import type { ApiContract } from "./api-client";

export const repositoryOwnedApiContract = {
  openapi: "3.1.0",
  info: { title: "HRCore API", version: "0.0.0" },
  paths: {
    "/health": { get: {} },
    "/employees": { get: {} },
    "/employees/{employeeId}": { get: {} },
    "/lifecycle/transaction-requests": { get: {} },
    "/lifecycle/transaction-requests/{requestId}": { get: {} },
    "/exports/employee-list": { post: {} },
    "/exports/lifecycle-request-list": { post: {} },
    "/support/p2list/audit-evidence/{correlationId}": { get: {} },
  },
} satisfies ApiContract;
