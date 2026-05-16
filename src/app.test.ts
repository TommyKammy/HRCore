import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "./app.js";

test("GET /health returns the smoke-test health response", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("GET /openapi.json serves the baseline OpenAPI contract", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/openapi.json",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );

  const contract = response.json();
  assert.equal(contract.openapi, "3.1.0");
  assert.equal(contract.info.title, "HRCore API");
  assert.ok(contract.paths["/health"]);
});
