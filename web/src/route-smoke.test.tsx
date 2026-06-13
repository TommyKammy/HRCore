import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";

describe("route smoke", () => {
  it("shows persona-scoped planned practical-use routes", async () => {
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

    expect(screen.getByRole("navigation")).toHaveTextContent("Ops/DLQ");
    expect(screen.getByRole("navigation")).toHaveTextContent("Audit");
    expect(screen.queryByText("Onboarding")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Audit/ }));
    expect(screen.getByRole("heading", { name: "Audit" })).toBeInTheDocument();
    expect(screen.getByText(/Direct correlation lookup/)).toBeInTheDocument();
  });
});
