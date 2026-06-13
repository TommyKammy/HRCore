import { render, screen, waitFor } from "@testing-library/react";
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
      screen.getByText("No bounded queue records yet"),
    ).toBeInTheDocument();
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

    await userEvent.click(
      screen.getByRole("button", { name: "Return request" }),
    );
    expect(screen.getByText(/is Returned for/)).toBeInTheDocument();
    expect(
      screen.getByText(/mvp_a\.onboarding\.return decidedBy=approver/),
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
        /mvp_a\.onboarding\.submit, mvp_a\.onboarding\.return decidedBy=approver, mvp_a\.onboarding\.submit/,
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
    expect(screen.getByText("Writeback evidence")).toBeInTheDocument();
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
      "Enter a valid work email address before creating projection or writeback evidence.",
    );
    expect(
      screen.queryByRole("heading", {
        name: "transaction-request-onboarding-001",
      }),
    ).not.toBeInTheDocument();
  });
});
