import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import test, { type TestContext } from "node:test";

import Fastify from "fastify";

import { buildApp } from "./app.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import { P2ListCursorManager } from "./p2list-cursor.js";
import {
  createP2ListEmployeeFixtureRows,
  createP2ListFixtureManifest,
  type P2ListEmployeeFixtureRow,
} from "./p2list-read-model-fixtures.js";
import { P2ListReadModelRepository } from "./p2list-read-model-repository.js";
import {
  verifyP2ListSyntheticDatasetManifest,
  type P2ListActorContext,
} from "./p2list-read-model-types.js";
import { p2ListPermissions } from "./p2list-contract.js";
import { buildServerApp } from "./server.js";
import {
  registerP2ListEmployeeRoutes,
  type P2ListEmployeeApiRuntime,
  type P2ListEmployeeAuditEvent,
} from "./routes/p2list-employees.js";

const manifestSecret =
  "p2list-api-manifest-fixture-secret-2026-at-least-32-bytes";
const cursorSecret = "p2list-api-cursor-fixture-secret-2026-at-least-32-bytes";
const acceptedAt = new Date("2026-07-24T08:00:00.000Z");
const authorizedActor: P2ListActorContext = {
  actorId: "actor-hr-operator",
  tenantId: "tenant-repo-owned-synthetic",
  permissions: [p2ListPermissions.employeeListRead],
  dataScope: { organizationCodes: ["ORG-SYNTHETIC"] },
};

test("GET /employees suppresses raw query values from request logs", async (t) => {
  let logs = "";
  const app = Fastify({
    logger: {
      stream: new Writable({
        write(chunk, _encoding, callback) {
          logs += String(chunk);
          callback();
        },
      }),
    },
  });
  registerP2ListEmployeeRoutes(app, {});
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/employees?q=PrivateName&employeeId=PRIVATE-001",
  });
  assert.equal(response.statusCode, 401);
  assert.doesNotMatch(logs, /PrivateName|PRIVATE-001|rawQuery/u);
});

test("GET /employees returns a bounded authorized page and safe audit handoff", async (t) => {
  const harness = await createHarness(t, 26);
  if (!harness) return;

  const response = await harness.app.inject({
    method: "GET",
    url: "/employees?sort=displayName&direction=asc&q=Synthetic",
    headers: { authorization: "Bearer authorized" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-correlation-id"], "employee-correlation-1");
  const body = response.json();
  assert.equal(body.items.length, 25);
  assert.deepEqual(Object.keys(body.items[0]).sort(), [
    "displayName",
    "employeeId",
    "employmentStatus",
    "hireDate",
    "organizationCode",
    "personId",
    "positionCode",
    "terminationDate",
  ]);
  assert.deepEqual(body.pageInfo, {
    limit: 25,
    hasNextPage: true,
    nextCursor: body.pageInfo.nextCursor,
  });
  assert.equal(typeof body.pageInfo.nextCursor, "string");
  assert.deepEqual(body.authorization, {
    dataScope: "bounded",
    maskedFields: [],
    readiness: "bounded_synthetic_only_not_production_ready",
  });
  assert.deepEqual(body.appliedFilters, {
    q: "Synthetic",
    asOf: "2026-07-24",
  });
  assert.equal(body.correlationId, "employee-correlation-1");

  assert.equal(harness.auditEvents.length, 1);
  assert.equal(
    harness.auditEvents[0]?.eventType,
    "employee_list.search_applied",
  );
  assert.equal(harness.auditEvents[0]?.rowCount, 25);
  const serializedAudit = JSON.stringify(harness.auditEvents);
  assert.doesNotMatch(serializedAudit, /Synthetic Employee/u);
  assert.doesNotMatch(serializedAudit, /"q"|rawQuery|rawCursor/u);
});

test("GET /employees binds pagination to filters and rejects tampered cursors", async (t) => {
  const harness = await createHarness(t, 26);
  if (!harness) return;

  const first = await harness.app.inject({
    method: "GET",
    url: "/employees?limit=25",
    headers: { authorization: "Bearer authorized" },
  });
  const cursor = first.json().pageInfo.nextCursor as string;

  const next = await harness.app.inject({
    method: "GET",
    url: `/employees?limit=25&cursor=${encodeURIComponent(cursor)}`,
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(next.statusCode, 200);
  assert.equal(next.json().items.length, 1);
  assert.equal(
    harness.auditEvents.at(-1)?.eventType,
    "employee_list.page_requested",
  );

  const mismatched = await harness.app.inject({
    method: "GET",
    url: `/employees?limit=25&employeeId=EMP-001&cursor=${encodeURIComponent(cursor)}`,
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(mismatched.statusCode, 400);
  assert.equal(mismatched.json().code, "cursor_filter_mismatch");

  const tamperedCursor = `${cursor.slice(0, -1)}${cursor.endsWith("A") ? "B" : "A"}`;
  const tampered = await harness.app.inject({
    method: "GET",
    url: `/employees?cursor=${encodeURIComponent(tamperedCursor)}`,
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(tampered.statusCode, 400);
  assert.equal(tampered.json().code, "cursor_invalid");
});

test("GET /employees fails closed across actor, permission, and organization scope", async (t) => {
  const actors: Record<string, P2ListActorContext> = {
    authorized: authorizedActor,
    "missing-permission": {
      ...authorizedActor,
      actorId: "actor-without-permission",
      permissions: [],
    },
    "missing-scope": {
      ...authorizedActor,
      actorId: "actor-without-scope",
      dataScope: {},
    },
    "malformed-scope": {
      ...authorizedActor,
      actorId: "actor-with-malformed-scope",
      dataScope: null,
    } as unknown as P2ListActorContext,
    "person-scoped": {
      ...authorizedActor,
      actorId: "actor-person-scoped",
      dataScope: { personIds: ["p2list-person-001"] },
    },
    "employee-scoped": {
      ...authorizedActor,
      actorId: "actor-employee-scoped",
      dataScope: { employeeIds: ["EMP-001"] },
    },
  };
  const harness = await createHarness(t, 1, actors);
  if (!harness) return;

  for (const fixture of [
    { token: undefined, status: 401, code: "actor_context_required" },
    { token: "unknown", status: 401, code: "actor_context_required" },
    { token: "missing-permission", status: 403, code: "permission_denied" },
    { token: "missing-scope", status: 403, code: "data_scope_denied" },
    { token: "malformed-scope", status: 403, code: "data_scope_denied" },
  ]) {
    const response: {
      statusCode: number;
      body: string;
      json(): Record<string, unknown>;
    } = await harness.app.inject({
      method: "GET",
      url: "/employees?employeeId=EMP-001",
      headers: fixture.token
        ? { authorization: `Bearer ${fixture.token}` }
        : undefined,
    });
    assert.equal(response.statusCode, fixture.status);
    assert.equal(response.json().code, fixture.code);
    assert.equal(
      response.json().message,
      fixture.status === 401
        ? "Server actor context is required."
        : "The requested employee list is not authorized.",
    );
    assert.doesNotMatch(response.body, /EMP-001|Synthetic Employee/u);
  }

  for (const token of ["person-scoped", "employee-scoped"]) {
    const response: {
      statusCode: number;
      json(): { items: Array<{ employeeId: string }> };
    } = await harness.app.inject({
      method: "GET",
      url: "/employees?organizationCode=ORG-SYNTHETIC",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().items.map((item) => item.employeeId),
      ["EMP-001"],
    );
  }

  const narrowedOutsideScope = await harness.app.inject({
    method: "GET",
    url: "/employees?organizationCode=ORG-OUT-OF-SCOPE",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(narrowedOutsideScope.statusCode, 200);
  assert.deepEqual(narrowedOutsideScope.json().items, []);
});

test("buildServerApp wires verified provenance and server-owned person scope", async (t) => {
  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-p2list-server-"));
  const databasePath = join(tempDirectory, "hrcore.sqlite");
  const manifestPath = join(tempDirectory, "employee-manifest.json");
  const token = "local-p2list-operator-token-at-least-32-bytes";
  const rows = createP2ListEmployeeFixtureRows(1);
  let db: OnboardingTransactionRequestDatabase & { close(): void };
  try {
    db = await openLocalSyntheticWritebackDatabase(`file:${databasePath}`);
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true });
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return;
    }
    throw error;
  }
  seedEmployeeRows(db, rows);
  db.close();
  await writeFile(
    manifestPath,
    JSON.stringify(
      createP2ListFixtureManifest(
        {
          datasetReference: "server-employee-api-fixture",
          employees: rows,
        },
        manifestSecret,
      ),
    ),
    "utf8",
  );

  const environment = {
    DATABASE_URL: process.env.DATABASE_URL,
    P2LIST_EMPLOYEE_MANIFEST_PATH: process.env.P2LIST_EMPLOYEE_MANIFEST_PATH,
    P2LIST_EMPLOYEE_MANIFEST_SECRET:
      process.env.P2LIST_EMPLOYEE_MANIFEST_SECRET,
    P2LIST_EMPLOYEE_CURSOR_SECRET: process.env.P2LIST_EMPLOYEE_CURSOR_SECRET,
    P2LIST_EMPLOYEE_ACTORS_JSON: process.env.P2LIST_EMPLOYEE_ACTORS_JSON,
  };
  process.env.DATABASE_URL = `file:${databasePath}`;
  process.env.P2LIST_EMPLOYEE_MANIFEST_PATH = manifestPath;
  process.env.P2LIST_EMPLOYEE_MANIFEST_SECRET = manifestSecret;
  process.env.P2LIST_EMPLOYEE_CURSOR_SECRET = cursorSecret;
  process.env.P2LIST_EMPLOYEE_ACTORS_JSON = JSON.stringify([
    {
      token,
      actor: {
        actorId: "actor-person-scoped-operator",
        tenantId: "tenant-repo-owned-synthetic",
        permissions: [p2ListPermissions.employeeListRead],
        dataScope: { personIds: [rows[0]!.personId] },
      },
    },
  ]);

  t.after(async () => {
    restoreEnvironment(environment);
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const app = await buildServerApp();
  t.after(async () => {
    await app.close();
  });
  const response = await app.inject({
    method: "GET",
    url: "/employees?organizationCode=ORG-SYNTHETIC",
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response
      .json()
      .items.map((item: { employeeId: string }) => item.employeeId),
    ["EMP-001"],
  );
});

test("GET /employees rejects unsupported and unbounded query inputs", async (t) => {
  const harness = await createHarness(t, 1);
  if (!harness) return;

  for (const fixture of [
    { query: "department=People", code: "unsupported_filter" },
    { query: "employmentType=full-time", code: "unsupported_filter" },
    { query: "sort=privateSalary", code: "unsupported_sort" },
    { query: "direction=sideways", code: "invalid_sort" },
    { query: "limit=0", code: "limit_out_of_range" },
    { query: "limit=101", code: "limit_out_of_range" },
  ]) {
    const response: {
      statusCode: number;
      json(): Record<string, unknown>;
    } = await harness.app.inject({
      method: "GET",
      url: `/employees?${fixture.query}`,
      headers: { authorization: "Bearer authorized" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, fixture.code);
    assert.equal(
      response.json().message,
      "The employee list request is invalid.",
    );
  }

  const maximum = await harness.app.inject({
    method: "GET",
    url: "/employees?limit=100",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(maximum.statusCode, 200);
  assert.equal(maximum.json().pageInfo.limit, 100);
});

async function createHarness(
  t: TestContext,
  count: number,
  actors: Record<string, P2ListActorContext> = {
    authorized: authorizedActor,
  },
): Promise<
  | {
      app: Awaited<ReturnType<typeof buildApp>>;
      auditEvents: P2ListEmployeeAuditEvent[];
    }
  | undefined
> {
  let db: OnboardingTransactionRequestDatabase & { close(): void };
  try {
    db = await openLocalSyntheticWritebackDatabase(":memory:");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return undefined;
    }
    throw error;
  }
  const rows = createP2ListEmployeeFixtureRows(count);
  seedEmployeeRows(db, rows);
  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      { datasetReference: "employee-api-fixture", employees: rows },
      manifestSecret,
    ),
    manifestSecret,
  );
  const auditEvents: P2ListEmployeeAuditEvent[] = [];
  let correlationSequence = 0;
  const runtime: P2ListEmployeeApiRuntime = {
    repository: new P2ListReadModelRepository(
      db,
      new P2ListCursorManager({
        secret: cursorSecret,
        now: () => acceptedAt,
      }),
    ),
    provenance,
    resolveActor(request) {
      const authorization = request.headers.authorization;
      const token = authorization?.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : undefined;
      return token ? actors[token] : undefined;
    },
    emitAuditEvent(event) {
      auditEvents.push(event);
    },
    now: () => acceptedAt,
    createCorrelationId: () => `employee-correlation-${++correlationSequence}`,
  };
  const app = await buildApp({ p2ListEmployeeApi: runtime });
  t.after(async () => {
    await app.close();
    db.close();
  });
  return { app, auditEvents };
}

function seedEmployeeRows(
  db: OnboardingTransactionRequestDatabase,
  rows: readonly P2ListEmployeeFixtureRow[],
): void {
  const person = db.prepare(
    "INSERT INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const employment = db.prepare(
    `
      INSERT INTO employment (
        id, person_id, employment_code, status_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, NULL)
    `,
  );
  const assignment = db.prepare(
    `
      INSERT INTO assignment (
        id, person_id, employment_id, assignment_code, organization_code,
        position_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `,
  );
  for (const row of rows) {
    person.run(row.personId, row.displayName, "2026-01-01T00:00:00.000Z");
    employment.run(
      row.employmentId,
      row.personId,
      row.employeeId,
      row.employmentStatus,
      row.hireDate,
    );
    assignment.run(
      row.assignmentId,
      row.personId,
      row.employmentId,
      row.assignmentCode,
      row.organizationCode,
      row.positionCode,
      row.hireDate,
    );
  }
}

function restoreEnvironment(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
