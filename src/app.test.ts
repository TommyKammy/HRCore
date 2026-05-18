import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildApp } from "./app.js";
import { loadOpenApiContract } from "./openapi.js";
import { buildServerApp, resolvePort } from "./server.js";
import { createSyntheticWorkEmailWritebackFixture } from "./writeback-ingest.js";

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
  assert.ok(contract.paths["/provisioning-runs"]);
  assert.ok(contract.paths["/writeback-events/work-email"]);

  const writebackOperation =
    contract.paths["/writeback-events/work-email"].post;
  assert.equal(
    writebackOperation.responses["400"].description,
    "Synthetic writeback input was malformed or violated local synthetic constraints.",
  );
  assert.equal(
    writebackOperation.responses["400"].content["application/json"].schema.$ref,
    "#/components/schemas/ErrorResponse",
  );
});

test("GET /provisioning-runs exposes minimal synthetic run evidence", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/provisioning-runs",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );

  assert.deepEqual(response.json(), {
    runs: [
      {
        runId: "synthetic-okta-run-001",
        status: "completed",
        targetOperation: "create",
        result: "success",
        correlationId:
          "okta:mock:create:EMP-LOG-001:2026-05-18T07%3A00%3A00.000Z",
        synthetic: true,
      },
      {
        runId: "synthetic-okta-run-002",
        status: "needs_attention",
        targetOperation: "disable",
        result: "permanent_failure",
        correlationId:
          "okta:mock:disable:EMP-PERM:2026-05-18T06%3A00%3A00.000Z",
        synthetic: true,
      },
    ],
  });
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

test("buildServerApp wires the local writeback database into the actual server app", async (t) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-server-db-"));
  process.env.DATABASE_URL = `file:${join(tempDirectory, "hrcore.sqlite")}`;

  t.after(async () => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    await rm(tempDirectory, { recursive: true, force: true });
  });

  const app = await buildServerApp();
  t.after(async () => {
    await app.close();
  });

  const db = await import("node:sqlite");
  const sqlite = new db.DatabaseSync(join(tempDirectory, "hrcore.sqlite"));
  t.after(() => {
    sqlite.close();
  });

  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
  `);

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture(),
  });

  assert.equal(response.statusCode, 201);
  assert.equal(
    sqlite
      .prepare(
        `
          SELECT provider_value
          FROM writeback_event
          WHERE id = 'writeback-event-work-email-001'
        `,
      )
      .get()?.provider_value,
    "confirmed.writeback@example.invalid",
  );
});
