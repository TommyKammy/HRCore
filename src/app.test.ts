import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "./app.js";
import { loadOpenApiContract } from "./openapi.js";
import { resolvePort } from "./server.js";

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

test("OpenAPI contract loading is independent from process cwd", async () => {
  const originalCwd = process.cwd();
  process.chdir("..");
  try {
    const contract = await loadOpenApiContract();
    assert.equal((contract as { openapi?: unknown }).openapi, "3.1.0");
  } finally {
    process.chdir(originalCwd);
  }
});

test("resolvePort accepts only explicit integer port values", () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort("0"), 0);
  assert.equal(resolvePort("3000"), 3000);

  for (const invalidPort of ["", "3000abc", "abc3000", "-1", "65536"]) {
    assert.throws(
      () => resolvePort(invalidPort),
      /PORT must be an integer between 0 and 65535/,
    );
  }
});
