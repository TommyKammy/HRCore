import { render, screen } from "@testing-library/react";
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
});
