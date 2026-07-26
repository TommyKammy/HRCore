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
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  window.history.replaceState(null, "", "/");
});

describe("employee list screen", () => {
  it("loads the API, synchronizes filters and paging, and opens detail", async () => {
    window.history.replaceState(null, "", "/?view=employees");
    vi.stubEnv(
      "VITE_P2LIST_HR_OPERATOR_TOKEN",
      "bounded-local-hr-operator-token-000001",
    );
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const response = url.includes("cursor=opaque-next-page")
          ? {
              ...employeeResponse,
              items: [],
              pageInfo: {
                limit: 25,
                hasNextPage: false,
                nextCursor: null,
              },
            }
          : employeeResponse;
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

    await user.type(
      screen.getByRole("textbox", { name: "氏名・従業員ID" }),
      "Synthetic",
    );
    await user.click(screen.getByRole("button", { name: "検索" }));

    await waitFor(() =>
      expect(window.location.search).toContain("q=Synthetic"),
    );
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("q=Synthetic"),
      expect.any(Object),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Synthetic Employee 001の詳細を開く",
      }),
    );
    expect(onOpenEmployee).toHaveBeenCalledWith(employeeResponse.items[0]);

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
      null,
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

  it("shows actionable denied and network retry states without fixtures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(Response.json(employeeResponse));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<EmployeeListView personaId="hr-operator" onOpenEmployee={null} />);

    expect(
      await screen.findByText("この一覧を表示する権限が確認できません"),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByText("一覧APIに接続できません")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(
      await screen.findByText("Synthetic Employee 001"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
    await user.selectOptions(
      screen.getByRole("combobox", { name: "手続き種別" }),
      "onboarding",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "状態" }),
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
});
