import { describe, expect, it } from "vitest";

import config from "../../vite.config";

describe("Vite API proxy configuration", () => {
  it("forwards all bounded list and export routes to the API server", () => {
    expect(config.server?.proxy).toMatchObject({
      "/employees": "http://127.0.0.1:3000",
      "/lifecycle": "http://127.0.0.1:3000",
      "/exports": "http://127.0.0.1:3000",
    });
  });
});
