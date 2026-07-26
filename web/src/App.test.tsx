import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("App shell", () => {
  it("fails closed until a bounded non-production persona is selected", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}), { status: 503 })),
    );

    render(<App />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Fail-closed persona guard",
    );
    expect(
      screen.getByText(/No bounded non-production persona is selected/),
    ).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveTextContent(
      "Routes stay blocked",
    );
  });

  it("loads the repository-owned API contract after persona selection", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        openapi: "3.1.0",
        info: { title: "HRCore API", version: "0.0.0" },
        paths: { "/health": {} },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    expect(fetchMock).not.toHaveBeenCalled();

    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    await waitFor(() => {
      expect(screen.getByText("API contract connected")).toBeInTheDocument();
    });
    expect(screen.getByRole("navigation")).toHaveTextContent("Onboarding");
    expect(
      screen.getByRole("region", { name: "本日の業務サマリー" }),
    ).toBeInTheDocument();
    expect(screen.getByText("連携状況")).toBeInTheDocument();
  });

  it("retries a failed contract load from the guarded WebUI surface", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 503 }))
      .mockResolvedValueOnce(
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    await waitFor(() => {
      expect(screen.getByText("API contract unavailable")).toBeInTheDocument();
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Retry contract load" }),
    );

    await waitFor(() => {
      expect(screen.getByText("API contract connected")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("marks the selected route button for assistive technologies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    expect(screen.getByRole("button", { name: /Work queue/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));

    expect(screen.getByRole("button", { name: /Work queue/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /Onboarding/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders only shortcuts allowed for the active persona", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith("/employees/EMP-SUPPORT-001")) {
          return Response.json({
            item: {
              personId: "person-support-001",
              employeeId: "EMP-SUPPORT-001",
              displayName: "Synthetic Support Subject",
              employmentStatus: "active",
              organizationCode: "ORG-SUPPORT",
              positionCode: "POS-SUPPORT",
              hireDate: "2026-01-01",
              terminationDate: null,
            },
            asOf: "2026-07-26",
            authorization: {
              dataScope: "bounded",
              maskedFields: [],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "support-detail-correlation",
          });
        }
        if (String(input).startsWith("/lifecycle/transaction-requests")) {
          return Response.json({
            items: [
              {
                transactionRequestId: "request-approver-001",
                requestType: "onboarding",
                status: "submitted",
                subjectPersonId: "person-approver-001",
                subjectEmployeeId: "EMP-APPROVER-001",
                subjectDisplayName: "Synthetic Approver Subject",
                organizationCode: "ORG-APPROVER",
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
            correlationId: "approver-list-correlation",
          });
        }
        if (String(input).startsWith("/employees")) {
          return Response.json({
            items: [
              {
                personId: "person-support-001",
                employeeId: "EMP-SUPPORT-001",
                displayName: "Synthetic Support Subject",
                employmentStatus: "active",
                organizationCode: "ORG-SUPPORT",
                positionCode: "POS-SUPPORT",
                hireDate: "2026-01-01",
                terminationDate: null,
              },
            ],
            pageInfo: {
              limit: 25,
              hasNextPage: false,
              nextCursor: null,
            },
            appliedFilters: { asOf: "2026-07-26" },
            authorization: {
              dataScope: "bounded",
              maskedFields: [],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "support-list-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");

    expect(
      screen.queryByLabelText("Bounded record ID"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /入社開始/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /異動適用/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /future-date apply/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /異動手続き \/ 山田 太郎/ }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: /Procedures/ }),
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    await userEvent.click(screen.getByRole("button", { name: /Work queue/ }));

    expect(screen.getByLabelText("Bounded record ID")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /future-date apply/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /入社開始/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /異動適用/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Employees/ }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Synthetic Support Subjectの詳細を開く",
      }),
    );
    expect(window.location.search).toContain("asOf=2026-07-26");
    expect(
      screen.queryByRole("button", { name: "異動手続きを開く" }),
    ).not.toBeInTheDocument();
  });

  it("rehydrates an employee detail URL without mixing legacy fixture fields", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=employee&employeeId=EMP-000128",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith("/employees/EMP-000128")) {
          return Response.json({
            item: {
              personId: "person-reload-001",
              employeeId: "EMP-000128",
              displayName: "Synthetic Reload Subject",
              employmentStatus: "inactive",
              organizationCode: "ORG-RELOAD",
              positionCode: "POS-RELOAD",
              hireDate: "2026-01-01",
              terminationDate: null,
            },
            asOf: "2026-07-26",
            authorization: {
              dataScope: "bounded",
              maskedFields: [],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "employee-reload-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    expect(
      await screen.findByRole("heading", { name: "Synthetic Reload Subject" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ORG-RELOAD")).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("従業員状態")).getByText("休止"),
    ).toHaveClass("status-queued");
    expect(screen.queryByText("ヤマダ タロウ")).not.toBeInTheDocument();
    expect(screen.queryByText("taro.yamada@***")).not.toBeInTheDocument();
    expect(screen.queryByText("外部ID / 連携状態")).not.toBeInTheDocument();
  });

  it("does not apply fixture mode to a different employee ID", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=employee&employeeId=EMP-OTHER&source=fixture",
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).startsWith("/employees/EMP-OTHER")) {
        return Response.json({
          item: {
            personId: "person-other-001",
            employeeId: "EMP-OTHER",
            displayName: "Authorized Other Employee",
            employmentStatus: "active",
            organizationCode: "ORG-OTHER",
            positionCode: "POS-OTHER",
            hireDate: "2026-01-01",
            terminationDate: null,
          },
          asOf: "2026-07-26",
          authorization: {
            dataScope: "bounded",
            maskedFields: [],
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          correlationId: "employee-other-correlation",
        });
      }
      return Response.json({
        openapi: "3.1.0",
        info: { title: "HRCore API", version: "0.0.0" },
        paths: { "/health": {} },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    expect(
      await screen.findByRole("heading", { name: "Authorized Other Employee" }),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/employees/EMP-OTHER",
      expect.any(Object),
    );
    expect(screen.queryByText("山田 太郎")).not.toBeInTheDocument();
  });

  it("remounts employee detail before loading a different persona scope", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=employee&employeeId=EMP-SCOPED-001",
    );
    vi.stubEnv(
      "VITE_P2LIST_HR_OPERATOR_TOKEN",
      "bounded-local-hr-operator-token-000001",
    );
    vi.stubEnv(
      "VITE_P2LIST_SUPPORT_TOKEN",
      "bounded-local-support-token-000000000001",
    );
    let releaseSupport: ((response: Response) => void) | undefined;
    const supportResponse = new Promise<Response>((resolve) => {
      releaseSupport = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith("/employees/EMP-SCOPED-001")) {
          const authorization = new Headers(init?.headers).get("authorization");
          if (authorization?.includes("support-token")) {
            return supportResponse;
          }
          return Response.json({
            item: {
              personId: "person-operator-detail",
              employeeId: "EMP-SCOPED-001",
              displayName: "Operator Scope Detail",
              employmentStatus: "active",
              organizationCode: "ORG-OPERATOR",
              positionCode: "POS-OPERATOR",
              hireDate: "2026-01-01",
              terminationDate: null,
            },
            asOf: "2026-07-26",
            authorization: {
              dataScope: "bounded",
              maskedFields: [],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "operator-detail-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    expect(
      await screen.findByRole("heading", { name: "Operator Scope Detail" }),
    ).toBeVisible();

    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    expect(
      screen.queryByRole("heading", { name: "Operator Scope Detail" }),
    ).not.toBeInTheDocument();

    releaseSupport?.(
      Response.json({
        item: {
          personId: "person-support-detail",
          employeeId: "EMP-SCOPED-001",
          displayName: "Support Scope Detail",
          employmentStatus: "active",
          organizationCode: "ORG-SUPPORT",
          positionCode: "POS-SUPPORT",
          hireDate: "2026-01-01",
          terminationDate: null,
        },
        asOf: "2026-07-26",
        authorization: {
          dataScope: "bounded",
          maskedFields: [],
          readiness: "bounded_synthetic_only_not_production_ready",
        },
        correlationId: "support-detail-correlation",
      }),
    );
    expect(
      await screen.findByRole("heading", { name: "Support Scope Detail" }),
    ).toBeVisible();
  });

  it("rehydrates a lifecycle detail URL through the authorized detail API", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=transfer&requestId=request-reload-001",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (
          String(input).startsWith(
            "/lifecycle/transaction-requests/request-reload-001",
          )
        ) {
          return Response.json({
            item: {
              transactionRequestId: "request-reload-001",
              requestType: "transfer",
              status: "rejected",
              subjectPersonId: "person-reload-001",
              subjectEmployeeId: "EMP-RELOAD-001",
              subjectDisplayName: "Synthetic Reload Request",
              organizationCode: "ORG-RELOAD",
              decidedBy: null,
              requestedAt: "2026-07-01T00:00:00.000Z",
              effectiveDate: "2026-08-01",
            },
            authorization: {
              dataScope: "bounded",
              maskedFields: ["decidedBy"],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "lifecycle-reload-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    expect(
      await screen.findByRole("heading", { name: "Synthetic Reload Request" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText("手続き状態")).getByText("rejected"),
    ).toHaveClass("status-failed");
    expect(screen.getByText("手続きレコード情報")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create transfer request" }),
    ).not.toBeInTheDocument();
  });

  it("opens lifecycle list records read-only instead of an unrelated workflow", async () => {
    window.history.replaceState(null, "", "/?view=queue");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (
          String(input).startsWith(
            "/lifecycle/transaction-requests/request-selected-001",
          )
        ) {
          return Response.json({
            item: {
              transactionRequestId: "request-selected-001",
              requestType: "transfer",
              status: "submitted",
              subjectPersonId: "person-selected-001",
              subjectEmployeeId: "EMP-SELECTED-001",
              subjectDisplayName: "Synthetic Selected Subject",
              organizationCode: "ORG-SELECTED",
              decidedBy: null,
              requestedAt: "2026-07-01T00:00:00.000Z",
              effectiveDate: "2026-08-01",
            },
            authorization: {
              dataScope: "bounded",
              maskedFields: ["decidedBy"],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "lifecycle-selected-detail-correlation",
          });
        }
        if (String(input).startsWith("/lifecycle/transaction-requests")) {
          return Response.json({
            items: [
              {
                transactionRequestId: "request-selected-001",
                requestType: "transfer",
                status: "submitted",
                subjectPersonId: "person-selected-001",
                subjectEmployeeId: "EMP-SELECTED-001",
                subjectDisplayName: "Synthetic Selected Subject",
                organizationCode: "ORG-SELECTED",
                decidedBy: null,
                requestedAt: "2026-07-01T00:00:00.000Z",
                effectiveDate: "2026-08-01",
              },
            ],
            pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
            appliedFilters: {},
            authorization: {
              dataScope: "bounded",
              maskedFields: ["decidedBy"],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "lifecycle-selected-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Procedures/ }));
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Synthetic Selected Subjectの異動手続きを開く",
      }),
    );

    expect(screen.getByText("手続きレコード情報")).toBeInTheDocument();
    expect(screen.getByText("request-selected-001")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Create transfer request" }),
    ).not.toBeInTheDocument();
  });

  it("clears stale filters when the active collection route is selected again", async () => {
    window.history.replaceState(null, "", "/?view=queue");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).startsWith("/employees")) {
          return Response.json({
            items: [],
            pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
            appliedFilters: { asOf: "2026-07-26" },
            authorization: {
              dataScope: "bounded",
              maskedFields: [],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "employee-route-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Employees/ }));
    await screen.findByText("条件に一致する従業員はいません");
    await userEvent.type(
      screen.getByRole("textbox", { name: "氏名・従業員ID" }),
      "stale",
    );
    await userEvent.click(screen.getByRole("button", { name: "検索" }));
    await waitFor(() => expect(window.location.search).toContain("q=stale"));

    await userEvent.click(screen.getByRole("button", { name: /Employees/ }));

    await waitFor(() => expect(window.location.search).toBe("?view=employees"));
    expect(screen.getByRole("textbox", { name: "氏名・従業員ID" })).toHaveValue(
      "",
    );
  });

  it("remounts collection state before loading a different persona scope", async () => {
    window.history.replaceState(null, "", "/?view=queue");
    vi.stubEnv(
      "VITE_P2LIST_HR_OPERATOR_TOKEN",
      "bounded-local-hr-operator-token-000001",
    );
    vi.stubEnv(
      "VITE_P2LIST_SUPPORT_TOKEN",
      "bounded-local-support-token-000000000001",
    );
    let releaseSupport: ((response: Response) => void) | undefined;
    const supportResponse = new Promise<Response>((resolve) => {
      releaseSupport = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith("/employees")) {
          const authorization = new Headers(init?.headers).get("authorization");
          if (authorization?.includes("support-token")) {
            return supportResponse;
          }
          return Response.json({
            items: [
              {
                personId: "person-operator-001",
                employeeId: "EMP-OPERATOR-001",
                displayName: "Operator Scope Employee",
                employmentStatus: "active",
                organizationCode: "ORG-OPERATOR",
                positionCode: "POS-OPERATOR",
                hireDate: "2026-01-01",
                terminationDate: null,
              },
            ],
            pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
            appliedFilters: { asOf: "2026-07-26" },
            authorization: {
              dataScope: "bounded",
              maskedFields: [],
              readiness: "bounded_synthetic_only_not_production_ready",
            },
            correlationId: "operator-scope-correlation",
          });
        }
        return Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        });
      }),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Employees/ }));
    expect(await screen.findByText("Operator Scope Employee")).toBeVisible();

    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    expect(
      screen.queryByText("Operator Scope Employee"),
    ).not.toBeInTheDocument();

    releaseSupport?.(
      Response.json({
        items: [
          {
            personId: "person-support-002",
            employeeId: "EMP-SUPPORT-002",
            displayName: "Support Scope Employee",
            employmentStatus: "active",
            organizationCode: "ORG-SUPPORT",
            positionCode: "POS-SUPPORT",
            hireDate: "2026-01-01",
            terminationDate: null,
          },
        ],
        pageInfo: { limit: 25, hasNextPage: false, nextCursor: null },
        appliedFilters: { asOf: "2026-07-26" },
        authorization: {
          dataScope: "bounded",
          maskedFields: [],
          readiness: "bounded_synthetic_only_not_production_ready",
        },
        correlationId: "support-scope-correlation",
      }),
    );
    expect(await screen.findByText("Support Scope Employee")).toBeVisible();
  });

  it("replaces a URL route that the selected persona cannot access", async () => {
    window.history.replaceState(
      null,
      "",
      "/?view=employees&q=must-not-survive",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");

    await waitFor(() => {
      expect(window.location.search).toBe("?view=queue");
    });
    expect(
      screen.queryByRole("button", { name: /Employees/ }),
    ).not.toBeInTheDocument();
  });

  it("reports an empty approval queue when no requests exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");
    await userEvent.click(screen.getByRole("button", { name: /Approvals/ }));

    expect(screen.getByLabelText("0件の承認待ち")).toBeInTheDocument();
    expect(screen.getByText("起票者: - / 提出: -")).toBeInTheDocument();
  });

  it("supports bounded onboarding create, inspection, evidence, and approver decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));

    expect(
      screen.getByRole("heading", { name: "Onboarding" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toHaveValue(
      "Synthetic Onboarding Hire",
    );
    expect(screen.getByText("onboarding.hire.001@***")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Start date"));
    await userEvent.type(screen.getByLabelText("Start date"), "2026-04-30");
    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Start date must be on or after the requested date for this bounded workflow.",
    );

    await userEvent.clear(screen.getByLabelText("Start date"));
    await userEvent.type(screen.getByLabelText("Start date"), "2026-06-01");
    await userEvent.clear(screen.getByLabelText("Department"));
    await userEvent.type(
      screen.getByLabelText("Department"),
      "department-people-ops-initial",
    );
    await userEvent.clear(screen.getByLabelText("Manager"));
    await userEvent.type(
      screen.getByLabelText("Manager"),
      "manager-reviewed-001",
    );
    await userEvent.clear(screen.getByLabelText("Work email"));
    await userEvent.type(
      screen.getByLabelText("Work email"),
      "reviewed.hire@example.invalid",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "transaction-request-onboarding-001",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Okta projection evidence")).toBeInTheDocument();
    expect(screen.queryByText("Writeback evidence")).not.toBeInTheDocument();
    expect(screen.getByText("Audit evidence")).toBeInTheDocument();
    expect(screen.getByText("correlation-onboarding-001")).toBeInTheDocument();
    expect(screen.getByText("reviewed.hire@***")).toBeInTheDocument();
    expect(screen.getByText("Step 4/5")).toBeInTheDocument();
    expect(screen.getByText("承認待ち")).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Employment code"));
    await userEvent.type(
      screen.getByLabelText("Employment code"),
      "EMP-ONBOARDING-999",
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "An onboarding request already exists for this synthetic employment code.",
    );

    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");
    await userEvent.click(screen.getByRole("button", { name: /Approvals/ }));
    expect(
      screen.getByRole("button", { name: "Approve request" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("1件の承認待ち")).toBeInTheDocument();
    expect(
      screen.getByText("起票者: HR operator / 提出: 2026/05/21 09:00"),
    ).toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("承認コメント"),
      "Manager linkage needs confirmation.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Return request" }),
    );
    expect(screen.getByText(/is Returned for/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_a\.onboarding\.return decidedBy=approver comment="Manager linkage needs confirmation\."/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("decidedBy=approver")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));
    expect(screen.getByLabelText("Employment code")).toHaveValue(
      "EMP-ONBOARDING-001",
    );
    expect(screen.getByLabelText("Department")).toHaveValue(
      "department-people-ops-initial",
    );
    expect(screen.getByLabelText("Manager")).toHaveValue(
      "manager-reviewed-001",
    );
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "reviewed.hire@example.invalid",
    );
    expect(screen.getByText("Step 2/5")).toBeInTheDocument();
    expect(screen.getByText("差戻し")).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Department"));
    await userEvent.type(
      screen.getByLabelText("Department"),
      "department-people-ops-reviewed",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );

    expect(
      screen.getByText(
        "Returned onboarding request resubmitted with synthetic data only.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_a\.onboarding\.submit, mvp_a\.onboarding\.return decidedBy=approver comment="Manager linkage needs confirmation\.", mvp_a\.onboarding\.submit/,
      ),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");
    await userEvent.click(screen.getByRole("button", { name: /Approvals/ }));
    expect(screen.queryByText("Decision actor")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Approve request" }),
    );
    expect(screen.getByText("Decision actor")).toBeInTheDocument();
    expect(screen.getByText("decidedBy=approver")).toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));
    expect(screen.getByText("Approved")).toBeInTheDocument();
    expect(screen.getByText("Step 5/5")).toBeInTheDocument();
    expect(screen.getByText("承認済み")).toBeInTheDocument();
    expect(screen.getByText("Apply status")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Approved request is waiting for bounded apply; no writeback evidence has been recorded.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Writeback evidence")).not.toBeInTheDocument();
  });

  it.each([
    ["Reject request", "Rejected"],
    ["Cancel request", "Cancelled"],
  ])(
    "blocks terminal onboarding requests from being overwritten after %s",
    async (decisionButton, terminalStatus) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json({
            openapi: "3.1.0",
            info: { title: "HRCore API", version: "0.0.0" },
            paths: { "/health": {} },
          }),
        ),
      );

      render(<App />);
      await userEvent.selectOptions(
        screen.getByLabelText("Persona"),
        "hr-operator",
      );
      await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));
      await userEvent.click(
        screen.getByRole("button", { name: "Create request" }),
      );

      await userEvent.selectOptions(
        screen.getByLabelText("Persona"),
        "approver",
      );
      await userEvent.click(screen.getByRole("button", { name: /Approvals/ }));
      await userEvent.click(
        screen.getByRole("button", { name: decisionButton }),
      );
      expect(
        screen.getByText(new RegExp(`is ${terminalStatus} for`)),
      ).toBeInTheDocument();

      await userEvent.selectOptions(
        screen.getByLabelText("Persona"),
        "hr-operator",
      );
      await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));
      await userEvent.clear(screen.getByLabelText("Employment code"));
      await userEvent.type(
        screen.getByLabelText("Employment code"),
        "EMP-ONBOARDING-TERMINAL",
      );
      await userEvent.click(
        screen.getByRole("button", { name: "Create request" }),
      );

      expect(screen.getByRole("alert")).toHaveTextContent(
        "An onboarding request already exists for this synthetic employment code.",
      );
      expect(screen.getByText(terminalStatus)).toBeInTheDocument();
      expect(screen.getByText("EMP-ONBOARDING-001")).toBeInTheDocument();
      expect(
        screen.queryByText("EMP-ONBOARDING-TERMINAL"),
      ).not.toBeInTheDocument();
    },
  );

  it("validates required and malformed onboarding assignment and contact fields before submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /Onboarding/ }));

    await userEvent.clear(screen.getByLabelText("Department"));
    await userEvent.clear(screen.getByLabelText("Manager"));
    await userEvent.clear(screen.getByLabelText("Work email"));
    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Complete department, manager, work email before submitting this bounded onboarding request.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-onboarding-001",
      }),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("Department"),
      "department-people-ops",
    );
    await userEvent.type(screen.getByLabelText("Manager"), "manager-001");
    await userEvent.type(screen.getByLabelText("Work email"), "not-an-email");
    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a synthetic example.invalid work email before creating projection or writeback evidence.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-onboarding-001",
      }),
    ).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("Work email"));
    await userEvent.type(
      screen.getByLabelText("Work email"),
      "jane.doe@company.com",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create request" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a synthetic example.invalid work email before creating projection or writeback evidence.",
    );
    expect(screen.queryByText("jane.doe@***")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-onboarding-001",
      }),
    ).not.toBeInTheDocument();
  });

  it("supports bounded transfer and termination practical workflows with approval evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );

    await userEvent.click(screen.getByRole("button", { name: /Transfer/ }));
    expect(
      screen.getByRole("heading", { name: "Transfer" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Transfer effective date")).toHaveValue(
      "2026-07-01",
    );
    expect(screen.getByLabelText("Current assignment code")).toHaveValue(
      "ASN-CURRENT-TRANSFER-001",
    );
    expect(screen.getByLabelText("Target organization")).toHaveValue(
      "organization-engineering",
    );
    expect(screen.getByLabelText("Transfer reason")).toHaveValue("team_change");
    expect(screen.getByText("Transfer impact preview")).toBeInTheDocument();
    expect(
      screen.getByText(
        /assignment-current-transfer-001 \(ASN-CURRENT-TRANSFER-001\) closes/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/organization-engineering\/department-product opens/),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Current assignment code"));
    await userEvent.clear(screen.getByLabelText("Target organization"));
    await userEvent.clear(screen.getByLabelText("Transfer reason"));
    await userEvent.click(
      screen.getByRole("button", { name: "Create transfer request" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Complete current assignment code, target organization, transfer reason before submitting this bounded transfer request.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-transfer-001",
      }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Current assignment code"),
      "ASN-CURRENT-TRANSFER-001",
    );
    await userEvent.type(
      screen.getByLabelText("Target organization"),
      "organization-engineering",
    );
    await userEvent.type(screen.getByLabelText("Transfer reason"), "layoff");
    await userEvent.click(
      screen.getByRole("button", { name: "Create transfer request" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Transfer reason must be team_change, manager_change, or organization_change for this bounded workflow.",
    );
    await userEvent.clear(screen.getByLabelText("Transfer reason"));
    await userEvent.type(
      screen.getByLabelText("Transfer reason"),
      " team_change ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Create transfer request" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "transaction-request-transfer-001",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Target assignment evidence")).toBeInTheDocument();
    expect(screen.getByText("Assignment close evidence")).toBeInTheDocument();
    expect(screen.getByText("Okta transfer projection")).toBeInTheDocument();
    expect(screen.getByText("correlation-transfer-001")).toBeInTheDocument();
    expect(screen.getByText("Step 4/5")).toBeInTheDocument();
    expect(screen.getByText("承認待ち")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Termination/ }));
    expect(
      screen.getByRole("heading", { name: "Termination" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Termination effective date")).toHaveValue(
      "2026-08-31",
    );
    expect(screen.getByLabelText("Employment code")).toHaveValue(
      "EMP-TERMINATION-001",
    );
    expect(screen.getByLabelText("Current assignment code")).toHaveValue(
      "ASN-CURRENT-TERMINATION-001",
    );
    expect(screen.getByText("Effective-date confirmation")).toBeInTheDocument();
    expect(
      screen.getByText("Retention/deletion runtime blocked"),
    ).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Employment code"));
    await userEvent.clear(screen.getByLabelText("Current assignment code"));
    await userEvent.click(
      screen.getByRole("button", { name: "Create termination request" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Complete employment code, current assignment code before submitting this bounded termination request.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-termination-001",
      }),
    ).not.toBeInTheDocument();
    await userEvent.type(
      screen.getByLabelText("Employment code"),
      "EMP-TERMINATION-001",
    );
    await userEvent.type(
      screen.getByLabelText("Current assignment code"),
      "ASN-CURRENT-TERMINATION-001",
    );
    await userEvent.clear(screen.getByLabelText("Reason"));
    await userEvent.type(screen.getByLabelText("Reason"), "layoff");
    await userEvent.click(
      screen.getByRole("button", { name: "Create termination request" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Termination reason must be resignation, retirement, contract_end, or mutual_agreement for this bounded workflow.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-termination-001",
      }),
    ).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("Reason"));
    await userEvent.type(screen.getByLabelText("Reason"), " resignation ");
    await userEvent.click(
      screen.getByRole("button", { name: "Create termination request" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "transaction-request-termination-001",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Employment close evidence")).toBeInTheDocument();
    expect(screen.getByText("Assignment close evidence")).toBeInTheDocument();
    expect(screen.getByText("Okta disable projection")).toBeInTheDocument();
    expect(screen.getByText("correlation-termination-001")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");
    await userEvent.click(screen.getByRole("button", { name: /Approvals/ }));
    expect(
      screen.getByRole("heading", { name: "Transfer approvals" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("2件の承認待ち")).toBeInTheDocument();
    expect(
      screen.getByText("起票者: HR operator / 提出: 2026/06/15 09:00"),
    ).toBeInTheDocument();
    const transferApprovalContext = screen.getByRole("group", {
      name: "Transfer approval context",
    });
    expect(
      within(transferApprovalContext).getByText(
        /assignment-current-transfer-001 \(ASN-CURRENT-TRANSFER-001\) closes on 2026-07-01/,
      ),
    ).toBeInTheDocument();
    expect(
      within(transferApprovalContext).getByText(
        /organization-engineering\/department-product opens for position-staff-engineer-001 under manager-product-001\. Reason: team_change/,
      ),
    ).toBeInTheDocument();
    const approveTransferButton = screen.getByRole("button", {
      name: "Approve transfer request",
    });
    expect(
      transferApprovalContext.compareDocumentPosition(approveTransferButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await userEvent.type(
      screen.getByLabelText("承認コメント"),
      "  Target   assignment confirmed.  ",
    );
    await userEvent.click(approveTransferButton);
    expect(screen.getByText(/Transfer is Approved/)).toBeInTheDocument();
    expect(screen.getByText("承認済み")).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_b\.transfer\.approve decidedBy=approver comment="Target assignment confirmed\."/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("1件の承認待ち")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Audit/ }));
    await userEvent.click(screen.getByRole("button", { name: /Approvals/ }));
    expect(
      screen.getByRole("heading", { name: "Termination approvals" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("起票者: HR operator / 提出: 2026/08/01 09:00"),
    ).toBeInTheDocument();
    const terminationApprovalContext = screen.getByRole("group", {
      name: "Termination approval context",
    });
    expect(
      within(terminationApprovalContext).getByText(
        /employment-termination-001 \(EMP-TERMINATION-001\) closes on 2026-08-31\. Reason: resignation/,
      ),
    ).toBeInTheDocument();
    expect(
      within(terminationApprovalContext).getByText(
        /assignment-current-termination-001 \(ASN-CURRENT-TERMINATION-001\) closes on 2026-08-31/,
      ),
    ).toBeInTheDocument();
    const returnTerminationButton = screen.getByRole("button", {
      name: "Return termination request",
    });
    expect(
      terminationApprovalContext.compareDocumentPosition(
        returnTerminationButton,
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    await userEvent.type(
      screen.getByLabelText("承認コメント"),
      'Confirm "retention" handoff.',
    );
    await userEvent.click(returnTerminationButton);

    expect(screen.getByText(/Termination is Returned/)).toBeInTheDocument();
    expect(screen.getByText("差戻し")).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_c\.termination\.return decidedBy=approver comment="Confirm \\"retention\\" handoff\."/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("0件の承認待ち")).toBeInTheDocument();
  });

  it("uses the active CSV actor in audit evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-operator",
    );
    await userEvent.click(screen.getByRole("button", { name: /CSV dry-run/ }));

    expect(
      screen.getByText(/mvp_d\.csv\.upload\.synthetic acceptedBy=hr-operator/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        /mvp_d\.csv\.upload\.synthetic acceptedBy=hr-ops-support/,
      ),
    ).not.toBeInTheDocument();
  });

  it("requires reason and confirmation before recording DLQ decisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    await userEvent.click(screen.getByRole("button", { name: /Ops\/DLQ/ }));
    expect(screen.getByText("0/3")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Decision action"), [
      "replay",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Capture a decision reason before retry, replay, ignore, or close.",
    );
    expect(
      screen.queryByText(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.replay/,
      ),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Synthetic row reconciled against the bounded dry-run evidence.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Confirm this destructive DLQ decision before writing audit evidence.",
    );
    expect(
      screen.queryByText(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.replay/,
      ),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByLabelText("Confirm bounded non-production DLQ action"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(
      screen.getByText("DLQ decision recorded with bounded audit evidence."),
    ).toBeInTheDocument();
    expect(screen.getByText("Replayed")).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.replay evidenceVersion=mvp_d_lifecycle_support_v1 reason=Synthetic row reconciled against the bounded dry-run evidence\. decidedBy=hr-ops-support/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "replay: Synthetic row reconciled against the bounded dry-run evidence.",
      ),
    ).toBeInTheDocument();
  });

  it("rejects terminal DLQ decisions and retry attempts beyond the bounded limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          openapi: "3.1.0",
          info: { title: "HRCore API", version: "0.0.0" },
          paths: { "/health": {} },
        }),
      ),
    );

    let app = render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    await userEvent.click(screen.getByRole("button", { name: /Ops\/DLQ/ }));
    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Synthetic row reconciled against the bounded dry-run evidence.",
    );
    await userEvent.click(
      screen.getByLabelText("Confirm bounded non-production DLQ action"),
    );

    await userEvent.selectOptions(screen.getByLabelText("Decision action"), [
      "replay",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(screen.getByText("Replayed")).toBeInTheDocument();
    const replayAuditEvidence = screen.getByText(
      /mvp_d\.ops_job\.failure_decision\.csv_import\.replay/,
    ).textContent;
    expect(
      replayAuditEvidence?.match(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.replay/g,
      ),
    ).toHaveLength(1);

    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "terminal decisions cannot be overwritten",
    );
    const duplicateReplayAuditEvidence = screen.getByText(
      /mvp_d\.ops_job\.failure_decision\.csv_import\.replay/,
    ).textContent;
    expect(
      duplicateReplayAuditEvidence?.match(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.replay/g,
      ),
    ).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText("Decision action"), [
      "retry",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "terminal decisions cannot be overwritten",
    );
    expect(screen.getByText("Replayed")).toBeInTheDocument();
    expect(screen.getByText("0/3")).toBeInTheDocument();
    expect(
      screen.queryByText(/mvp_d\.ops_job\.failure_decision\.csv_import\.retry/),
    ).not.toBeInTheDocument();
    app.unmount();

    app = render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    await userEvent.click(screen.getByRole("button", { name: /Ops\/DLQ/ }));
    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Synthetic row reconciled against the bounded dry-run evidence.",
    );
    await userEvent.click(
      screen.getByLabelText("Confirm bounded non-production DLQ action"),
    );
    await userEvent.selectOptions(screen.getByLabelText("Decision action"), [
      "close",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(screen.getByText("Closed")).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.close evidenceVersion=mvp_d_lifecycle_support_v1 reason=Synthetic row reconciled against the bounded dry-run evidence\. decidedBy=hr-ops-support/,
      ),
    ).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Decision action"), [
      "ignore",
    ]);
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "terminal decisions cannot be overwritten",
    );
    expect(
      screen.queryByText(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.ignore/,
      ),
    ).not.toBeInTheDocument();
    app.unmount();

    render(<App />);
    await userEvent.selectOptions(
      screen.getByLabelText("Persona"),
      "hr-ops-support",
    );
    await userEvent.click(screen.getByRole("button", { name: /Ops\/DLQ/ }));
    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Retry stays within bounded non-production evidence.",
    );
    await userEvent.click(
      screen.getByLabelText("Confirm bounded non-production DLQ action"),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Record selected DLQ decision" }),
    );

    expect(screen.getByText("3/3")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "already reached 3/3 retries",
    );
    const auditEvidence = screen.getByText(
      /mvp_d\.ops_job\.failure_decision\.csv_import\.retry/,
    ).textContent;
    expect(
      auditEvidence?.match(
        /mvp_d\.ops_job\.failure_decision\.csv_import\.retry/g,
      ),
    ).toHaveLength(3);
  });
});
