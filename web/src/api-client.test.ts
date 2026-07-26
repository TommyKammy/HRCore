import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  createP2ListRequestInit,
  fetchEmployees,
  fetchLifecycleRequests,
  type EmployeeListResponse,
  type LifecycleRequestListResponse,
} from "./api-client";

const employeeListResponse: EmployeeListResponse = {
  items: [],
  pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
  appliedFilters: { asOf: "2026-07-26" },
  authorization: {
    dataScope: "bounded",
    maskedFields: [],
    readiness: "bounded_synthetic_only_not_production_ready",
  },
  correlationId: "employee-list-test-correlation",
};

const lifecycleListResponse: LifecycleRequestListResponse = {
  items: [],
  pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
  appliedFilters: {},
  authorization: {
    dataScope: "bounded",
    maskedFields: [],
    readiness: "bounded_synthetic_only_not_production_ready",
  },
  correlationId: "lifecycle-list-test-correlation",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lifecycle request API client", () => {
  it("serializes array filters using the contract form encoding", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(lifecycleListResponse),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchLifecycleRequests(
      {
        requestType: ["onboarding", "termination"],
        status: ["submitted", "approved"],
        limit: 25,
      },
      { headers: { authorization: "Bearer lifecycle-token" } },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/lifecycle/transaction-requests?requestType=onboarding%2Ctermination&status=submitted%2Capproved&limit=25",
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
    );
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe("Bearer lifecycle-token");
  });

  it("does not expose lifecycle query values in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 403 })),
    );

    const request = fetchLifecycleRequests({
      q: "Private Subject",
      correlationId: "private-correlation",
      cursor: "private-cursor",
    });

    await expect(request).rejects.toEqual(
      new ApiClientError(
        "Request failed for /lifecycle/transaction-requests: 403",
      ),
    );
    await expect(request).rejects.not.toHaveProperty(
      "message",
      expect.stringMatching(/Private|private-cursor/u),
    );
  });
});

describe("employee API client", () => {
  it("uses only the configured opaque actor token for the selected persona", () => {
    vi.stubEnv(
      "VITE_P2LIST_HR_OPERATOR_TOKEN",
      "bounded-local-hr-operator-token-000001",
    );

    expect(
      new Headers(createP2ListRequestInit("hr-operator").headers).get(
        "authorization",
      ),
    ).toBe("Bearer bounded-local-hr-operator-token-000001");
    expect(
      new Headers(createP2ListRequestInit("bounded-admin").headers).has(
        "authorization",
      ),
    ).toBe(false);
  });

  it("preserves every RequestInit headers form", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json(employeeListResponse),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchEmployees(
      {},
      {
        headers: new Headers({
          authorization: "Bearer headers-instance-token",
        }),
      },
    );
    await fetchEmployees(
      {},
      {
        headers: [["authorization", "Bearer tuple-token"]],
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe("Bearer headers-instance-token");
    expect(
      new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("authorization"),
    ).toBe("Bearer tuple-token");
    expect(
      new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("accept"),
    ).toBe("application/json");
  });

  it("does not expose employee query values in errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 400 })),
    );

    const request = fetchEmployees({
      q: "Private Search Term",
      employeeId: "PRIVATE-001",
      cursor: "private-cursor",
    });

    await expect(request).rejects.toEqual(
      new ApiClientError("Request failed for /employees: 400"),
    );
    await expect(request).rejects.not.toHaveProperty(
      "message",
      expect.stringMatching(/Private|private-cursor/u),
    );
  });

  it("rejects malformed successful collection payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...employeeListResponse,
          authorization: undefined,
        }),
      ),
    );

    await expect(fetchEmployees()).rejects.toEqual(
      new ApiClientError(
        "Response contract did not match the repository-owned shape for /employees.",
      ),
    );
  });
});
