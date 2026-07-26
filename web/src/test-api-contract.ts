import type { ApiContract } from "./api-client";

export const repositoryOwnedApiContract = {
  openapi: "3.1.0",
  info: { title: "HRCore API", version: "0.0.0" },
  paths: {
    "/health": {},
    "/employees": {},
    "/employees/{employeeId}": {},
    "/lifecycle/transaction-requests": {},
    "/lifecycle/transaction-requests/{requestId}": {},
  },
} satisfies ApiContract;
