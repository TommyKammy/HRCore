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
    await userEvent.click(approveTransferButton);
    await userEvent.click(returnTerminationButton);

    expect(screen.getByText(/Transfer is Approved/)).toBeInTheDocument();
    expect(screen.getByText(/Termination is Returned/)).toBeInTheDocument();
    expect(
      screen.getByText(/mvp_b\.transfer\.approve decidedBy=approver/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/mvp_c\.termination\.return decidedBy=approver/),
    ).toBeInTheDocument();
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

    await userEvent.click(
      screen.getByRole("button", { name: "Replay failed row" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Capture a decision reason before retry, replay, ignore, or close.",
    );
    expect(
      screen.queryByText(/mvp_d\.dlq\.replay reason=/),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByLabelText("Decision reason"),
      "Synthetic row reconciled against the bounded dry-run evidence.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Replay failed row" }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Confirm this destructive DLQ decision before writing audit evidence.",
    );
    expect(
      screen.queryByText(/mvp_d\.dlq\.replay reason=/),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByLabelText("Confirm bounded non-production DLQ action"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Replay failed row" }),
    );

    expect(
      screen.getByText("DLQ decision recorded with bounded audit evidence."),
    ).toBeInTheDocument();
    expect(screen.getByText("Replayed")).toBeInTheDocument();
    expect(
      screen.getByText(
        /mvp_d\.dlq\.replay reason=Synthetic row reconciled against the bounded dry-run evidence\. decidedBy=hr-ops-support/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "replay: Synthetic row reconciled against the bounded dry-run evidence.",
      ),
    ).toBeInTheDocument();
  });
});
