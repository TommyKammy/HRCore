import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  EmployeeListResponse,
  LifecycleRequestListResponse,
} from "../api-client";
import { EmployeeListView, LifecycleListView } from "./list-screens";

const employeeResponse: EmployeeListResponse = {
  items: [
    {
      personId: "person-001",
      employeeId: "EMP-001",
      displayName: "Synthetic Employee 001",
      employmentStatus: "active",
      organizationCode: "ORG-SYNTHETIC",
      positionCode: "POS-001",
      hireDate: "2026-01-01",
      terminationDate: null,
    },
  ],
  pageInfo: {
    limit: 25,
    hasNextPage: true,
    nextCursor: "opaque-next-page",
  },
  appliedFilters: { asOf: "2026-07-26" },
  authorization: {
    dataScope: "bounded",
    maskedFields: ["terminationDate"],
    readiness: "bounded_synthetic_only_not_production_ready",
  },
  correlationId: "employee-list-correlation",
};

const lifecycleResponse: LifecycleRequestListResponse = {
  items: [
    {
      transactionRequestId: "request-001",
      requestType: "onboarding",
      status: "submitted",
      subjectPersonId: "person-001",
      subjectEmployeeId: "EMP-001",
      subjectDisplayName: "Synthetic Lifecycle Subject",
      organizationCode: "ORG-LIFECYCLE-SYNTHETIC",
      decidedBy: null,
      requestedAt: "2026-07-01T00:00:00.000Z",
      effectiveDate: "2026-08-01",
    },
  ],
  pageInfo: {
    limit: 25,
    hasNextPage: false,
    nextCursor: null,
  },
  appliedFilters: {},
  authorization: {
    dataScope: "bounded",
    maskedFields: ["decidedBy"],
    readiness: "bounded_synthetic_only_not_production_ready",
  },
  correlationId: "lifecycle-list-correlation",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

function stubBrowserDownload() {
  const createObjectURL = vi.fn(() => "blob:bounded-export");
  const revokeObjectURL = vi.fn();
  const NativeUrl = URL;
  class DownloadUrl extends NativeUrl {
    static createObjectURL = createObjectURL;
    static revokeObjectURL = revokeObjectURL;
  }
  vi.stubGlobal("URL", DownloadUrl);
  const click = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => undefined);
  return { createObjectURL, revokeObjectURL, click };
}

describe("employee list screen", () => {
  it("confirms a reason and downloads the server-owned bounded CSV", async () => {
    const download = stubBrowserDownload();
    const filteredResponse: EmployeeListResponse = {
      ...employeeResponse,
      appliedFilters: {
        organizationCode: "ORG-SYNTHETIC",
        employmentStatus: "active",
        asOf: "2026-07-26",
      },
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) === "/exports/employee-list") {
          return new Response("employee_id\nEMP-001\n", {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition":
                'attachment; filename="hrcore-bounded-employees-p2list_export_v1.csv"',
              "x-hrcore-correlation-id": "employee-export-correlation",
              "x-hrcore-export-schema-version": "p2list_export_v1",
            },
          });
        }
        return Response.json(filteredResponse);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);
    await screen.findByText("Synthetic Employee 001");
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "出力理由" }),
      "operational_reconciliation",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));

    expect(
      await screen.findByText(/ダウンロードを開始しました/u),
    ).toBeVisible();
    const exportCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === "/exports/employee-list",
    );
    expect(exportCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          filters: filteredResponse.appliedFilters,
          reasonCode: "operational_reconciliation",
        }),
      }),
    );
    expect(download.createObjectURL).toHaveBeenCalledOnce();
    expect(download.click).toHaveBeenCalledOnce();
    expect(download.revokeObjectURL).toHaveBeenCalledWith(
      "blob:bounded-export",
    );
  });

  it("reuses export correlations for network retries and rotates after a server conflict", async () => {
    const download = stubBrowserDownload();
    const filteredResponse: EmployeeListResponse = {
      ...employeeResponse,
      appliedFilters: {
        organizationCode: "ORG-SYNTHETIC",
        asOf: "2026-07-26",
      },
    };
    let exportAttempt = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) !== "/exports/employee-list") {
          return Response.json(filteredResponse);
        }
        exportAttempt += 1;
        if (exportAttempt === 1) {
          throw new TypeError("response lost");
        }
        if (exportAttempt === 2) {
          return Response.json(
            {
              code: "correlation_reuse_conflict",
              message: "private server text",
              correlationId: "poisoned-export-correlation",
            },
            { status: 400 },
          );
        }
        return new Response("employee_id\nEMP-001\n", {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="hrcore-bounded-employees-p2list_export_v1.csv"',
            "x-hrcore-correlation-id": "employee-export-retry-success",
            "x-hrcore-export-schema-version": "p2list_export_v1",
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);
    await screen.findByText("Synthetic Employee 001");
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "出力理由" }),
      "operational_reconciliation",
    );

    await user.click(screen.getByRole("button", { name: "確認して出力" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CSV出力APIに接続できません",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CSV出力条件が受理されませんでした",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));
    expect(
      await screen.findByText(/ダウンロードを開始しました/u),
    ).toBeVisible();

    const correlations = fetchMock.mock.calls
      .filter(([input]) => String(input) === "/exports/employee-list")
      .map(([, init]) =>
        new Headers(init?.headers).get("x-hrcore-correlation-id"),
      );
    expect(correlations[0]).toMatch(/^p2list-ui-/u);
    expect(correlations[1]).toBe(correlations[0]);
    expect(correlations[2]).not.toBe(correlations[1]);
    expect(download.click).toHaveBeenCalledOnce();
  });

  it("rotates export correlations when the authorized request context changes", async () => {
    const download = stubBrowserDownload();
    const filteredResponse: EmployeeListResponse = {
      ...employeeResponse,
      appliedFilters: {
        organizationCode: "ORG-SYNTHETIC",
        asOf: "2026-07-26",
      },
    };
    let exportAttempt = 0;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (String(input) !== "/exports/employee-list") {
          return Response.json(filteredResponse);
        }
        exportAttempt += 1;
        if (exportAttempt === 1) {
          throw new TypeError("response lost");
        }
        return new Response("employee_id\nEMP-001\n", {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
              'attachment; filename="hrcore-bounded-employees-p2list_export_v1.csv"',
            "x-hrcore-correlation-id": "employee-export-context-success",
            "x-hrcore-export-schema-version": "p2list_export_v1",
          },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const view = render(
      <EmployeeListView personaId="hr-operator" onOpenEmployee={null} />,
    );
    await screen.findByText("Synthetic Employee 001");
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "出力理由" }),
      "operational_reconciliation",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "CSV出力APIに接続できません",
    );

    view.rerender(
      <EmployeeListView personaId="approver" onOpenEmployee={null} />,
    );
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).startsWith("/employees"),
        ),
      ).toHaveLength(2);
    });
    await screen.findByText("Synthetic Employee 001");
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "出力理由" }),
      "operational_reconciliation",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));
    expect(
      await screen.findByText(/ダウンロードを開始しました/u),
    ).toBeVisible();

    const correlations = fetchMock.mock.calls
      .filter(([input]) => String(input) === "/exports/employee-list")
      .map(([, init]) =>
        new Headers(init?.headers).get("x-hrcore-correlation-id"),
      );
    expect(correlations).toHaveLength(2);
    expect(correlations[0]).toMatch(/^p2list-ui-/u);
    expect(correlations[1]).not.toBe(correlations[0]);
    expect(download.click).toHaveBeenCalledOnce();
  });

  it("cancels an in-flight export before an unmounted result can download", async () => {
    const download = stubBrowserDownload();
    const filteredResponse: EmployeeListResponse = {
      ...employeeResponse,
      appliedFilters: {
        organizationCode: "ORG-SYNTHETIC",
        asOf: "2026-07-26",
      },
    };
    let resolveExport: ((response: Response) => void) | undefined;
    let exportSignal: AbortSignal | undefined;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/exports/employee-list") {
        exportSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveExport = resolve;
        });
      }
      return Promise.resolve(Response.json(filteredResponse));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const view = render(
      <EmployeeListView personaId="hr-operator" onOpenEmployee={null} />,
    );
    await screen.findByText("Synthetic Employee 001");
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "出力理由" }),
      "operational_reconciliation",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));
    await waitFor(() => expect(resolveExport).toBeTypeOf("function"));

    view.unmount();
    expect(exportSignal?.aborted).toBe(true);
    resolveExport?.(
      new Response("employee_id\nEMP-001\n", {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition":
            'attachment; filename="hrcore-bounded-employees-p2list_export_v1.csv"',
          "x-hrcore-correlation-id": "stale-export-correlation",
          "x-hrcore-export-schema-version": "p2list_export_v1",
        },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(download.createObjectURL).not.toHaveBeenCalled();
    expect(download.click).not.toHaveBeenCalled();
  });

  it("loads the API, synchronizes filters and paging, and opens detail", async () => {
    window.history.replaceState(null, "", "/?view=employees&asOf=2026-01-01");
    vi.stubEnv(
      "VITE_P2LIST_HR_OPERATOR_TOKEN",
      "bounded-local-hr-operator-token-000001",
    );
    const historicalEmployeeResponse = {
      ...employeeResponse,
      appliedFilters: { asOf: "2026-01-01" },
    };
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const response = url.includes("cursor=opaque-next-page")
          ? {
              ...historicalEmployeeResponse,
              items: [],
              pageInfo: {
                limit: 25,
                hasNextPage: false,
                nextCursor: null,
              },
            }
          : historicalEmployeeResponse;
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer bounded-local-hr-operator-token-000001",
        );
        return Response.json(response);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const onOpenEmployee = vi.fn();
    const user = userEvent.setup();

    render(
      <EmployeeListView
        personaId="hr-operator"
        onOpenEmployee={onOpenEmployee}
      />,
    );

    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
    expect(screen.getByText("employee-list-correlation")).toBeInTheDocument();
    expect(
      within(screen.getByRole("status")).getByText("2026/01/01"),
    ).toBeVisible();

    const searchInput = screen.getByRole("textbox", {
      name: "氏名・従業員ID",
    });
    expect(searchInput).toHaveAttribute("maxlength", "100");
    expect(screen.getByRole("textbox", { name: "従業員ID" })).toHaveAttribute(
      "maxlength",
      "128",
    );
    expect(screen.getByRole("textbox", { name: "組織コード" })).toHaveAttribute(
      "maxlength",
      "128",
    );
    await user.type(searchInput, "Synthetic");
    await user.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() =>
      expect(window.location.search).toContain("q=Synthetic"),
    );
    expect(window.location.search).toContain("asOf=2026-01-01");
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("q=Synthetic"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("asOf=2026-01-01"),
      expect.any(Object),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Synthetic Employee 001の詳細を開く",
      }),
    );
    expect(onOpenEmployee).toHaveBeenCalledWith(
      employeeResponse.items[0],
      "2026-01-01",
    );

    await user.click(screen.getByRole("button", { name: "次のページへ" }));
    await waitFor(() =>
      expect(window.location.search).toContain("cursor=opaque-next-page"),
    );
    expect(
      await screen.findByText("条件に一致する従業員はいません"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "前のページへ" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "前のページへ" }));
    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("q=Synthetic");
    expect(window.location.search).not.toContain("cursor=");
  });

  it("does not use global browser history for a bookmarked cursor", async () => {
    window.history.replaceState(
      {
        p2ListCollection: {
          view: "employees",
          previousLocations: ["http://["],
        },
      },
      "",
      "/?view=employees&cursor=bookmarked-page",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...employeeResponse,
          pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
        }),
      ),
    );

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);

    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "前のページへ" })).toBeDisabled();
  });

  it("restores cursor history after the list is remounted", async () => {
    window.history.replaceState(null, "", "/?view=employees");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        Response.json(
          String(input).includes("cursor=opaque-next-page")
            ? {
                ...employeeResponse,
                items: [],
                pageInfo: {
                  limit: 25,
                  hasNextPage: false,
                  nextCursor: null,
                },
              }
            : employeeResponse,
        ),
      ),
    );
    const user = userEvent.setup();
    const firstRender = render(
      <EmployeeListView personaId="hr-operator" onOpenEmployee={null} />,
    );
    await screen.findByText("Synthetic Employee 001");

    await user.click(screen.getByRole("button", { name: "次のページへ" }));
    await screen.findByText("条件に一致する従業員はいません");
    expect(window.location.search).toContain("asOf=2026-07-26");
    firstRender.unmount();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);
    await screen.findByText("条件に一致する従業員はいません");
    expect(screen.getByRole("button", { name: "前のページへ" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "前のページへ" }));
    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
    expect(window.location.search).toContain("asOf=2026-07-26");
    expect(window.location.search).not.toContain("cursor=");
  });

  it("distinguishes masked assignments from genuinely unassigned fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...employeeResponse,
          items: [
            {
              ...employeeResponse.items[0],
              organizationCode: null,
              positionCode: null,
            },
          ],
          authorization: {
            ...employeeResponse.authorization,
            maskedFields: ["organizationCode"],
          },
          pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
        }),
      ),
    );

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);

    const row = await screen.findByRole("row", {
      name: /Synthetic Employee 001/u,
    });
    expect(within(row).getByText("masked")).toBeInTheDocument();
    expect(within(row).getByText("未割当")).toBeInTheDocument();
  });

  it("rejects boundary whitespace without rewriting the search", async () => {
    const fetchMock = vi.fn(async () => Response.json(employeeResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);
    await screen.findByText("Synthetic Employee 001");
    await user.type(
      screen.getByRole("textbox", { name: "氏名・従業員ID" }),
      " Synthetic",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      screen.getByText("検索条件の前後に空白を含めないでください。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a locally invalid bounded search term", async () => {
    const fetchMock = vi.fn(async () => Response.json(employeeResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);
    await screen.findByText("Synthetic Employee 001");
    await user.type(
      screen.getByRole("textbox", { name: "氏名・従業員ID" }),
      "A",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      screen.getByText("q は 2 文字以上で指定してください。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows actionable denied and network retry states without fixtures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 403,
          headers: { "x-correlation-id": "employee-list-denied" },
        }),
      )
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(Response.json(employeeResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);

    expect(
      await screen.findByText("この一覧を表示する権限が確認できません"),
    ).toBeVisible();
    expect(screen.getByText("employee-list-denied")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("一覧APIに接続できません")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const correlations = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("x-hrcore-correlation-id"),
    );
    expect(correlations[0]).toMatch(/^p2list-ui-/u);
    expect(correlations[1]).not.toBe(correlations[0]);
    expect(correlations[2]).toBe(correlations[1]);
  });

  it("distinguishes service and contract failures from network failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { "x-correlation-id": "employee-list-service-failure" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);

    expect(
      await screen.findByText("一覧APIの応答を確認できません"),
    ).toBeVisible();
    expect(screen.getByText("employee-list-service-failure")).toBeVisible();
    expect(
      screen.queryByText("一覧APIに接続できません"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "再試行" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(
        screen.queryByText("employee-list-service-failure"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("一覧APIの応答を確認できません")).toBeVisible();
    expect(
      screen.queryByText("一覧APIに接続できません"),
    ).not.toBeInTheDocument();
  });

  it("fails closed for invalid URL state until filters are reset", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=employees&employmentStatus=invalid&cursor=",
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);

    expect(
      await screen.findByText("URLの検索条件を確認してください"),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(Response.json(employeeResponse));
    await user.click(screen.getByRole("button", { name: "条件をリセット" }));
    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
  });
});

describe("lifecycle list screen", () => {
  it("shows the bounded denial reason and correlation without downloading", async () => {
    const download = stubBrowserDownload();
    const filteredResponse: LifecycleRequestListResponse = {
      ...lifecycleResponse,
      appliedFilters: {
        organizationCode: "ORG-LIFECYCLE",
        status: ["submitted"],
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/exports/lifecycle-request-list") {
        return Response.json(
          {
            code: "export_row_limit_exceeded",
            message: "private server text",
            correlationId: "lifecycle-export-denied",
          },
          { status: 422 },
        );
      }
      return Response.json(filteredResponse);
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <LifecycleListView personaId="hr-operator" onOpenRequest={vi.fn()} />,
    );
    await screen.findByText("Synthetic Lifecycle Subject");
    await user.click(screen.getByRole("button", { name: "CSV出力" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "出力理由" }),
      "uat_reconciliation",
    );
    await user.click(screen.getByRole("button", { name: "確認して出力" }));

    expect(
      await screen.findByText(/対象が 100 件を超えています/u),
    ).toBeVisible();
    expect(screen.getByText(/lifecycle-export-denied/u)).toBeVisible();
    expect(screen.queryByText(/private server text/u)).not.toBeInTheDocument();
    expect(download.createObjectURL).not.toHaveBeenCalled();
  });

  it("filters by type, status, and date then opens the existing workflow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(lifecycleResponse)),
    );
    const onOpenRequest = vi.fn();
    const user = userEvent.setup();

    render(
      <LifecycleListView personaId="approver" onOpenRequest={onOpenRequest} />,
    );

    expect(
      await screen.findByText("Synthetic Lifecycle Subject"),
    ).toBeVisible();
    expect(screen.getByText(/2026\/07\/01 00:00/u)).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: "対象者・従業員ID" }),
    ).toHaveAttribute("maxlength", "100");
    await user.selectOptions(
      screen.getByRole("listbox", { name: "手続き種別" }),
      "onboarding",
    );
    await user.selectOptions(
      screen.getByRole("listbox", { name: "状態" }),
      "submitted",
    );
    await user.type(screen.getByLabelText("適用日（開始）"), "2026-08-01");
    await user.type(screen.getByLabelText("適用日（終了）"), "2026-08-31");
    await user.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() => {
      expect(window.location.search).toContain("requestType=onboarding");
      expect(window.location.search).toContain("status=submitted");
      expect(window.location.search).toContain("effectiveFrom=2026-08-01");
    });

    await user.click(
      screen.getByRole("button", {
        name: "Synthetic Lifecycle Subjectの入社手続きを開く",
      }),
    );
    expect(onOpenRequest).toHaveBeenCalledWith(lifecycleResponse.items[0]);
  });

  it("does not submit an incomplete effective-date range", async () => {
    const fetchMock = vi.fn(async () => Response.json(lifecycleResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<LifecycleListView personaId="approver" onOpenRequest={vi.fn()} />);

    await screen.findByText("Synthetic Lifecycle Subject");
    await user.type(screen.getByLabelText("適用日（開始）"), "2026-08-01");
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      screen.getByText("適用日の開始日と終了日を両方指定してください。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not submit an effective-date range over 366 inclusive days", async () => {
    const fetchMock = vi.fn(async () => Response.json(lifecycleResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<LifecycleListView personaId="approver" onOpenRequest={vi.fn()} />);

    await screen.findByText("Synthetic Lifecycle Subject");
    await user.type(screen.getByLabelText("適用日（開始）"), "2026-01-01");
    await user.type(screen.getByLabelText("適用日（終了）"), "2027-01-02");
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      screen.getByText("適用日の範囲は 366 日以内で指定してください。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("preserves hidden and multi-value lifecycle URL filters on submit", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=lifecycle&requestType=onboarding,termination&status=submitted,approved&subjectEmployeeId=EMP-001&organizationCode=ORG-001&decidedBy=approver-001&requestedFrom=2026-07-01T00%3A00%3A00.000Z&requestedTo=2026-07-02T00%3A00%3A00.000Z&correlationId=correlation-001&limit=10",
    );
    const fetchMock = vi.fn(async () => Response.json(lifecycleResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <LifecycleListView personaId="hr-operator" onOpenRequest={vi.fn()} />,
    );
    await screen.findByText("Synthetic Lifecycle Subject");
    expect(screen.getByRole("listbox", { name: "手続き種別" })).toHaveValue([
      "onboarding",
      "termination",
    ]);
    expect(screen.getByRole("listbox", { name: "状態" })).toHaveValue([
      "submitted",
      "approved",
    ]);
    expect(screen.getByRole("combobox", { name: "表示件数" })).toHaveValue(
      "10",
    );
    const activeFilters = screen.getByLabelText("適用中の追加条件");
    for (const visibleFilter of [
      "EMP-001",
      "ORG-001",
      "approver-001",
      "correlation-001",
    ]) {
      expect(within(activeFilters).getByText(visibleFilter)).toBeVisible();
    }
    expect(
      within(activeFilters).getByText(
        /2026\/07\/01 00:00.*2026\/07\/02 00:00/u,
      ),
    ).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: "対象者・従業員ID" }),
      "Synthetic",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() =>
      expect(window.location.search).toContain("q=Synthetic"),
    );
    for (const retained of [
      "requestType=onboarding%2Ctermination",
      "status=submitted%2Capproved",
      "subjectEmployeeId=EMP-001",
      "organizationCode=ORG-001",
      "decidedBy=approver-001",
      "requestedFrom=2026-07-01T00%3A00%3A00.000Z",
      "correlationId=correlation-001",
    ]) {
      expect(window.location.search).toContain(retained);
    }

    await user.click(screen.getByRole("button", { name: "correlationを解除" }));
    await waitFor(() =>
      expect(window.location.search).not.toContain("correlationId="),
    );
    expect(window.location.search).toContain("subjectEmployeeId=EMP-001");
  });

  it("renders masked employee IDs without substituting request IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ...lifecycleResponse,
          items: [
            {
              ...lifecycleResponse.items[0],
              subjectEmployeeId: null,
            },
          ],
          authorization: {
            ...lifecycleResponse.authorization,
            maskedFields: ["subjectEmployeeId"],
          },
        }),
      ),
    );

    render(
      <LifecycleListView personaId="hr-operator" onOpenRequest={vi.fn()} />,
    );

    const row = await screen.findByRole("row", {
      name: /Synthetic Lifecycle Subject/u,
    });
    expect(within(row).getByText("masked")).toBeInTheDocument();
    expect(within(row).queryByText("request-001")).not.toBeInTheDocument();
    expect(within(row).queryByText("未採番")).not.toBeInTheDocument();
  });

  it("rejects lifecycle search boundary whitespace without an API request", async () => {
    const fetchMock = vi.fn(async () => Response.json(lifecycleResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <LifecycleListView personaId="hr-operator" onOpenRequest={vi.fn()} />,
    );
    await screen.findByText("Synthetic Lifecycle Subject");
    await user.type(
      screen.getByRole("textbox", { name: "対象者・従業員ID" }),
      "Synthetic ",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      screen.getByText("検索条件の前後に空白を含めないでください。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects prohibited lifecycle search characters locally", async () => {
    const fetchMock = vi.fn(async () => Response.json(lifecycleResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <LifecycleListView personaId="hr-operator" onOpenRequest={vi.fn()} />,
    );
    await screen.findByText("Synthetic Lifecycle Subject");
    await user.type(
      screen.getByRole("textbox", { name: "対象者・従業員ID" }),
      "A%",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    expect(
      screen.getByText("q に使用できない文字が含まれています。"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
