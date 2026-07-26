import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiClientError,
  createP2ListRequestInit,
  fetchEmployeeDetail,
  fetchEmployees,
  fetchLifecycleRequestDetail,
  fetchLifecycleRequests,
  fetchOpenApiContract,
  type EmployeeListResponse,
  type LifecycleRequestListResponse,
} from "./api-client";
import { repositoryOwnedApiContract } from "./test-api-contract";

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
const lifecycleListItem: LifecycleRequestListResponse["items"][number] = {
  transactionRequestId: "request-001",
  requestType: "transfer",
  status: "submitted",
  subjectPersonId: "person-001",
  subjectEmployeeId: "EMP-001",
  subjectDisplayName: "Synthetic Subject",
  organizationCode: "ORG-001",
  decidedBy: null,
  requestedAt: "2026-07-01T00:00:00.000Z",
  effectiveDate: "2026-08-01",
};
const employeeListItem: EmployeeListResponse["items"][number] = {
  personId: "person-001",
  employeeId: "EMP-001",
  displayName: "Synthetic Employee",
  employmentStatus: "active",
  organizationCode: "ORG-001",
  positionCode: "POS-001",
  hireDate: "2026-01-01",
  terminationDate: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OpenAPI contract API client", () => {
  it("accepts the repository-owned contract paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(repositoryOwnedApiContract)),
    );

    await expect(fetchOpenApiContract()).resolves.toEqual(
      repositoryOwnedApiContract,
    );
  });

  it.each([
    "/employees",
    "/employees/{employeeId}",
    "/lifecycle/transaction-requests",
    "/lifecycle/transaction-requests/{requestId}",
  ])("rejects a contract missing %s", async (missingPath) => {
    const paths: Record<string, unknown> = {
      ...repositoryOwnedApiContract.paths,
    };
    delete paths[missingPath];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ ...repositoryOwnedApiContract, paths }),
      ),
    );

    await expect(fetchOpenApiContract()).rejects.toEqual(
      new ApiClientError(
        "OpenAPI contract did not match the repository-owned HRCore API shape.",
      ),
    );
  });

  it("rejects a required path without a GET operation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...repositoryOwnedApiContract,
          paths: {
            ...repositoryOwnedApiContract.paths,
            "/employees": { post: {} },
          },
        }),
      ),
    );

    await expect(fetchOpenApiContract()).rejects.toBeInstanceOf(ApiClientError);
  });
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
      vi.fn(async () =>
        Response.json(
          {
            code: "permission_denied",
            message: "The bounded operation was denied.",
            correlationId: "lifecycle-denied-correlation",
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          { status: 403 },
        ),
      ),
    );

    const request = fetchLifecycleRequests({
      q: "Private Subject",
      correlationId: "private-correlation",
      cursor: "private-cursor",
    });

    await expect(request).rejects.toMatchObject({
      message: "Request failed for /lifecycle/transaction-requests: 403",
      status: 403,
      correlationId: "lifecycle-denied-correlation",
    });
    await expect(request).rejects.not.toHaveProperty(
      "message",
      expect.stringMatching(/Private|private-cursor/u),
    );
  });

  it("rejects noncanonical timestamps and impossible calendar dates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...lifecycleListResponse,
          items: [{ ...lifecycleListItem, requestedAt: "0" }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...lifecycleListResponse,
          items: [{ ...lifecycleListItem, effectiveDate: "2026-02-30" }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...lifecycleListResponse,
          items: [
            {
              ...lifecycleListItem,
              requestedAt: "2026-07-01T09:00:00+09:00",
            },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it("loads a server-authorized lifecycle detail response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        item: lifecycleListItem,
        authorization: lifecycleListResponse.authorization,
        correlationId: "lifecycle-detail-correlation",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchLifecycleRequestDetail("request-001", {
        headers: { authorization: "Bearer lifecycle-token" },
      }),
    ).resolves.toMatchObject({
      item: { transactionRequestId: "request-001" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/lifecycle/transaction-requests/request-001",
      expect.any(Object),
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
      vi.fn(
        async () =>
          new Response(null, {
            status: 400,
            headers: { "x-correlation-id": "employee-invalid-correlation" },
          }),
      ),
    );

    const request = fetchEmployees({
      q: "Private Search Term",
      employeeId: "PRIVATE-001",
      cursor: "private-cursor",
    });

    await expect(request).rejects.toMatchObject({
      message: "Request failed for /employees: 400",
      status: 400,
      correlationId: "employee-invalid-correlation",
    });
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

  it("rejects collection responses over the bounded row limit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...employeeListResponse,
          items: Array.from({ length: 101 }, () => employeeListItem),
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...lifecycleListResponse,
          items: Array.from({ length: 101 }, () => lifecycleListItem),
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEmployees()).rejects.toBeInstanceOf(ApiClientError);
    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it("rejects empty correlation IDs in bounded responses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ ...employeeListResponse, correlationId: "" }),
      )
      .mockResolvedValueOnce(
        Response.json({ ...lifecycleListResponse, correlationId: "" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          item: employeeListItem,
          asOf: "2026-07-26",
          authorization: employeeListResponse.authorization,
          correlationId: "",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          item: lifecycleListItem,
          authorization: lifecycleListResponse.authorization,
          correlationId: "",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEmployees()).rejects.toBeInstanceOf(ApiClientError);
    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(fetchEmployeeDetail("EMP-001")).rejects.toBeInstanceOf(
      ApiClientError,
    );
    await expect(
      fetchLifecycleRequestDetail("request-001"),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  it("rejects additional properties in bounded list items", async () => {
    const employeeItem = {
      personId: "person-001",
      employeeId: "EMP-001",
      displayName: "Synthetic Employee",
      employmentStatus: "active",
      organizationCode: "ORG-001",
      positionCode: "POS-001",
      hireDate: "2026-01-01",
      terminationDate: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...employeeListResponse,
          items: [{ ...employeeItem, payload: { private: true } }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...lifecycleListResponse,
          items: [{ ...lifecycleListItem, notes: "private" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEmployees()).rejects.toBeInstanceOf(ApiClientError);
    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it("rejects empty identifiers in bounded list items", async () => {
    const employeeItem = {
      personId: "person-001",
      employeeId: "EMP-001",
      displayName: "Synthetic Employee",
      employmentStatus: "active",
      organizationCode: "ORG-001",
      positionCode: "POS-001",
      hireDate: "2026-01-01",
      terminationDate: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...employeeListResponse,
          items: [{ ...employeeItem, employeeId: "" }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          ...lifecycleListResponse,
          items: [{ ...lifecycleListItem, transactionRequestId: "" }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchEmployees()).rejects.toBeInstanceOf(ApiClientError);
    await expect(fetchLifecycleRequests()).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it("accepts every contract-valid page limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...employeeListResponse,
          pageInfo: { limit: 10, hasNextPage: false, nextCursor: null },
        }),
      ),
    );

    await expect(fetchEmployees({ limit: 10 })).resolves.toMatchObject({
      pageInfo: { limit: 10 },
    });
  });

  it("loads a server-authorized employee detail response", async () => {
    const item = {
      personId: "person-001",
      employeeId: "EMP-001",
      displayName: "Synthetic Employee",
      employmentStatus: "active" as const,
      organizationCode: "ORG-001",
      positionCode: "POS-001",
      hireDate: "2026-01-01",
      terminationDate: null,
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        item,
        asOf: "2026-01-01",
        authorization: employeeListResponse.authorization,
        correlationId: "employee-detail-correlation",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEmployeeDetail(
        "EMP-001",
        { asOf: "2026-01-01" },
        { headers: { authorization: "Bearer employee-token" } },
      ),
    ).resolves.toMatchObject({ item: { employeeId: "EMP-001" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "/employees/EMP-001?asOf=2026-01-01",
      expect.any(Object),
    );
  });
});
