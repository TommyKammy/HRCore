import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "./App";
import { repositoryOwnedApiContract } from "./test-api-contract";

describe("accessibility smoke", () => {
  it("provides landmarks, labels, status messaging, and keyboard reachable route controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(repositoryOwnedApiContract)),
    );

    render(<App />);

    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveAccessibleName(
      "Planned practical-use areas",
    );
    expect(screen.getByLabelText("Persona")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Persona"), "approver");

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approvals/ })).toBeEnabled();
  });
});
