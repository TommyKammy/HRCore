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
});
