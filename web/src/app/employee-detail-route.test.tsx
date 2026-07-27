import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EmployeeDetailRoute } from "./employee-detail-route";

const authorization = {
  dataScope: "bounded",
  maskedFields: [],
  readiness: "bounded_synthetic_only_not_production_ready",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("EmployeeDetailRoute", () => {
  it("rejects an explicitly empty employee ID without fetching", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId=""
        asOf={null}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "従業員詳細URLの従業員IDが空です",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("distinguishes a masked termination date from an absent value", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          item: {
            personId: "person-masked",
            employeeId: "EMP-MASKED",
            displayName: "Masked Employee",
            employmentStatus: "active",
            organizationCode: "ORG-001",
            positionCode: "POS-001",
            hireDate: "2026-01-01",
            terminationDate: null,
          },
          asOf: "2026-07-26",
          authorization: {
            ...authorization,
            maskedFields: ["terminationDate"],
          },
          correlationId: "employee-detail-masked",
        }),
      ),
    );

    render(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId="EMP-MASKED"
        asOf={null}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Masked Employee" }),
    ).toBeInTheDocument();
    expect(screen.getByText("masked")).toBeInTheDocument();
    expect(screen.queryByText("該当なし")).not.toBeInTheDocument();
  });

  it("shows the server correlation ID for a failed detail request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "permission_denied",
            message: "The bounded operation was denied.",
            correlationId: "employee-detail-denied",
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          { status: 403 },
        ),
      ),
    );

    render(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId="EMP-DENIED"
        asOf={null}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "employee-detail-denied",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("権限または検索条件");
  });

  it("reports server failures separately from client authorization errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "service_unavailable",
            message: "The bounded detail service is unavailable.",
            correlationId: "employee-detail-service-failure",
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          { status: 503 },
        ),
      ),
    );

    render(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId="EMP-FAILED"
        asOf={null}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("サーバー応答または契約");
    expect(alert).toHaveTextContent("employee-detail-service-failure");
    expect(alert).not.toHaveTextContent("権限または検索条件");
  });

  it.each([
    {
      name: "employee ID",
      employeeId: "EMP-REQUESTED",
      asOf: null,
      responseEmployeeId: "EMP-OTHER",
      responseAsOf: "2026-07-26",
    },
    {
      name: "explicit as-of date",
      employeeId: "EMP-REQUESTED",
      asOf: "2026-07-25",
      responseEmployeeId: "EMP-REQUESTED",
      responseAsOf: "2026-07-26",
    },
  ])("rejects a response with a mismatched $name", async (scenario) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          item: {
            personId: "person-other",
            employeeId: scenario.responseEmployeeId,
            displayName: "Wrong Employee",
            employmentStatus: "active",
            organizationCode: "ORG-001",
            positionCode: "POS-001",
            hireDate: "2026-01-01",
            terminationDate: null,
          },
          asOf: scenario.responseAsOf,
          authorization,
          correlationId: "employee-detail-mismatch",
        }),
      ),
    );

    render(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId={scenario.employeeId}
        asOf={scenario.asOf}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "従業員詳細を表示できません",
    );
    expect(screen.queryByText("Wrong Employee")).not.toBeInTheDocument();
  });

  it("ignores a successful response from an aborted route request", async () => {
    let resolveFirstRequest: ((response: Response) => void) | undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const responseFor = (employeeId: string, displayName: string) =>
      Response.json({
        item: {
          personId: `person-${employeeId}`,
          employeeId,
          displayName,
          employmentStatus: "active",
          organizationCode: "ORG-001",
          positionCode: "POS-001",
          hireDate: "2026-01-01",
          terminationDate: null,
        },
        asOf: "2026-07-26",
        authorization,
        correlationId: `employee-detail-${employeeId}`,
      });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(firstRequest)
      .mockResolvedValueOnce(responseFor("EMP-CURRENT", "Current Employee"));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId="EMP-STALE"
        asOf={null}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender(
      <EmployeeDetailRoute
        personaId="hr-operator"
        employeeId="EMP-CURRENT"
        asOf={null}
        useLegacyFixture={false}
        onOpenTransfer={null}
      />,
    );
    expect(
      await screen.findByRole("heading", { name: "Current Employee" }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveFirstRequest?.(responseFor("EMP-STALE", "Stale Employee"));
      await firstRequest;
    });

    expect(screen.queryByText("Stale Employee")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Current Employee" }),
    ).toBeInTheDocument();
  });
});
