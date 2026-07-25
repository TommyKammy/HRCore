import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiClientError, fetchEmployees } from "./api-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("employee API client", () => {
  it("preserves every RequestInit headers form", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({}),
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
});
