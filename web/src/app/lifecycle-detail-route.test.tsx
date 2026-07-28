import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LifecycleDetailRoute } from "./lifecycle-detail-route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("LifecycleDetailRoute", () => {
  it("distinguishes a masked employee ID from an unassigned value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          item: {
            transactionRequestId: "request-masked",
            requestType: "transfer",
            status: "submitted",
            subjectPersonId: "person-masked",
            subjectEmployeeId: null,
            subjectDisplayName: "Masked Subject",
            organizationCode: "ORG-001",
            decidedBy: null,
            requestedAt: "2026-07-01T00:00:00.000Z",
            effectiveDate: "2026-08-01",
          },
          authorization: {
            dataScope: "bounded",
            maskedFields: ["subjectEmployeeId"],
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          correlationId: "lifecycle-detail-masked",
        }),
      ),
    );

    render(
      <LifecycleDetailRoute
        personaId="hr-operator"
        requestId="request-masked"
        expectedType="transfer"
        onBack={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Masked Subject" }),
    ).toBeInTheDocument();
    expect(screen.getByText("masked")).toBeInTheDocument();
    expect(screen.queryByText("未採番")).not.toBeInTheDocument();
  });

  it("shows the server correlation ID for a failed detail request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "data_scope_denied",
            message: "The bounded operation was denied.",
            correlationId: "lifecycle-detail-denied",
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          { status: 403 },
        ),
      ),
    );

    render(
      <LifecycleDetailRoute
        personaId="hr-operator"
        requestId="request-denied"
        expectedType="transfer"
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "lifecycle-detail-denied",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("権限またはRequest ID");
  });

  it("rotates a denied correlation and preserves the new ID across a network retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            code: "data_scope_denied",
            message: "The bounded operation was denied.",
            correlationId: "lifecycle-detail-denied-retry",
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          { status: 404 },
        ),
      )
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(
        Response.json({
          item: {
            transactionRequestId: "request-denied-retry",
            requestType: "transfer",
            status: "submitted",
            subjectPersonId: "person-retry",
            subjectEmployeeId: "EMP-RETRY",
            subjectDisplayName: "Retry Transfer",
            organizationCode: "ORG-001",
            decidedBy: null,
            requestedAt: "2026-07-01T00:00:00.000Z",
            effectiveDate: "2026-08-01",
          },
          authorization: {
            dataScope: "bounded",
            maskedFields: [],
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          correlationId: "lifecycle-detail-retry-success",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <LifecycleDetailRoute
        personaId="hr-operator"
        requestId="request-denied-retry"
        expectedType="transfer"
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "lifecycle-detail-denied-retry",
    );
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "手続き詳細APIに接続できません",
    );
    await user.click(screen.getByRole("button", { name: "再試行" }));
    expect(
      await screen.findByRole("heading", { name: "Retry Transfer" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const correlations = fetchMock.mock.calls.map(([, init]) =>
      new Headers(init?.headers).get("x-hrcore-correlation-id"),
    );
    expect(correlations[0]).toMatch(/^p2list-ui-/u);
    expect(correlations[1]).not.toBe(correlations[0]);
    expect(correlations[2]).toBe(correlations[1]);
  });

  it("reports response-contract failures separately from client errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          item: {
            transactionRequestId: "request-invalid",
          },
          authorization: {
            dataScope: "bounded",
            maskedFields: [],
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          correlationId: "lifecycle-detail-invalid",
        }),
      ),
    );

    render(
      <LifecycleDetailRoute
        personaId="hr-operator"
        requestId="request-invalid"
        expectedType="transfer"
        onBack={vi.fn()}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("サーバー応答または契約");
    expect(alert).not.toHaveTextContent("権限またはRequest ID");
  });

  it("ignores a late response after detail navigation aborts it", async () => {
    const responseFor = (
      requestType: "onboarding" | "transfer",
      subjectDisplayName: string,
    ) =>
      Response.json({
        item: {
          transactionRequestId: "request-shared",
          requestType,
          status: "submitted",
          subjectPersonId: `person-${requestType}`,
          subjectEmployeeId: `EMP-${requestType}`,
          subjectDisplayName,
          organizationCode: "ORG-001",
          decidedBy: null,
          requestedAt: "2026-07-01T00:00:00.000Z",
          effectiveDate: "2026-08-01",
        },
        authorization: {
          dataScope: "bounded",
          maskedFields: [],
          readiness: "bounded_synthetic_only_not_production_ready",
        },
        correlationId: `lifecycle-detail-${requestType}`,
      });
    let resolveFirstRequest: ((response: Response) => void) | undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirstRequest = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementationOnce(() => firstRequest)
        .mockResolvedValueOnce(responseFor("transfer", "Current Transfer")),
    );
    const onBack = vi.fn();
    const { rerender } = render(
      <LifecycleDetailRoute
        personaId="hr-operator"
        requestId="request-shared"
        expectedType="onboarding"
        onBack={onBack}
      />,
    );

    rerender(
      <LifecycleDetailRoute
        personaId="hr-operator"
        requestId="request-shared"
        expectedType="transfer"
        onBack={onBack}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Current Transfer" }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveFirstRequest?.(responseFor("onboarding", "Stale Onboarding"));
      await firstRequest;
    });

    expect(screen.queryByText("Stale Onboarding")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Current Transfer" }),
    ).toBeInTheDocument();
  });
});
