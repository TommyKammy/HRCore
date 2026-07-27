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
import { createServerP2ListEmployeeRuntime } from "./p2list-employee-runtime.js";
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
const authorizedDetailActor: P2ListActorContext = {
  ...authorizedActor,
  permissions: [
    p2ListPermissions.employeeListRead,
    p2ListPermissions.employeeDetailRead,
  ],
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

  const empty = await harness.app.inject({
    method: "GET",
    url: "/employees?cursor=",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(empty.statusCode, 400);
  assert.equal(empty.json().code, "cursor_invalid");

  const repeated = await harness.app.inject({
    method: "GET",
    url: "/employees?cursor=first&cursor=second",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(repeated.statusCode, 400);
  assert.equal(repeated.json().code, "cursor_invalid");
  assert.deepEqual(
    harness.auditEvents.map((event) => event.eventType),
    ["employee_list.viewed", "employee_list.page_requested"],
  );
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
    "empty-actor-id": {
      ...authorizedActor,
      actorId: "",
    },
    "padded-actor-id": {
      ...authorizedActor,
      actorId: " actor-with-padding",
    },
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
    { token: "empty-actor-id", status: 401, code: "actor_context_required" },
    { token: "padded-actor-id", status: 401, code: "actor_context_required" },
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
  assert.equal(
    harness.auditEvents.filter(
      (event) => event.eventType === "authorization.denied",
    ).length,
    7,
  );
  assert.equal(
    harness.auditEvents.some(
      (event) =>
        event.actorId === "" ||
        (event.actorId !== undefined && event.actorId.trim() !== event.actorId),
    ),
    false,
  );

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

test("GET /employees uses one canonical audit ID for equivalent data scopes", async (t) => {
  const harness = await createHarness(t, 2, {
    "scope-order-a": {
      ...authorizedActor,
      actorId: "actor-scope-order-a",
      dataScope: {
        personIds: ["p2list-person-002", "p2list-person-001"],
      },
    },
    "scope-order-b": {
      ...authorizedActor,
      actorId: "actor-scope-order-b",
      dataScope: {
        organizationCodes: [],
        personIds: ["p2list-person-001", "p2list-person-002"],
      },
    },
  });
  if (!harness) return;

  for (const token of ["scope-order-a", "scope-order-b"]) {
    const response: { statusCode: number } = await harness.app.inject({
      method: "GET",
      url: "/employees",
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
  }

  assert.equal(harness.auditEvents.length, 2);
  assert.equal(
    harness.auditEvents[0]?.dataScopeId,
    harness.auditEvents[1]?.dataScopeId,
  );
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
    headers: { authorization: `bEaReR  ${token}` },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    response
      .json()
      .items.map((item: { employeeId: string }) => item.employeeId),
    ["EMP-001"],
  );

  const deniedResponse = await app.inject({
    method: "GET",
    url: "/employees",
    headers: {
      authorization: `Bearer ${"unknown-p2list-token-".padEnd(32, "x")}`,
    },
  });
  assert.equal(deniedResponse.statusCode, 401);

  const auditDb: OnboardingTransactionRequestDatabase & { close(): void } =
    await openLocalSyntheticWritebackDatabase(`file:${databasePath}`);
  try {
    const auditRows = auditDb
      .prepare(
        `
          SELECT
            event_type,
            event_version,
            actor_id,
            evaluated_permission,
            data_scope_id,
            filter_fingerprint,
            sort,
            page_size,
            row_count,
            resource_type,
            correlation_id,
            policy_decision,
            reason_code,
            poc_marker
          FROM p2list_audit_event
          ORDER BY rowid
        `,
      )
      .all?.();
    assert.equal(auditRows?.length, 2);
    assert.deepEqual(
      {
        event_type: auditRows?.[0]?.event_type,
        event_version: auditRows?.[0]?.event_version,
        actor_id: auditRows?.[0]?.actor_id,
        evaluated_permission: auditRows?.[0]?.evaluated_permission,
        sort: auditRows?.[0]?.sort,
        page_size: auditRows?.[0]?.page_size,
        row_count: auditRows?.[0]?.row_count,
        resource_type: auditRows?.[0]?.resource_type,
        policy_decision: auditRows?.[0]?.policy_decision,
        reason_code: auditRows?.[0]?.reason_code,
        poc_marker: auditRows?.[0]?.poc_marker,
      },
      {
        event_type: "employee_list.search_applied",
        event_version: "p2list_audit_v1",
        actor_id: "actor-person-scoped-operator",
        evaluated_permission: p2ListPermissions.employeeListRead,
        sort: "employeeId:asc",
        page_size: 25,
        row_count: 1,
        resource_type: "employee",
        policy_decision: "allow",
        reason_code: null,
        poc_marker: "synthetic_poc",
      },
    );
    assert.equal(typeof auditRows?.[0]?.data_scope_id, "string");
    assert.equal(typeof auditRows?.[0]?.filter_fingerprint, "string");
    assert.equal(typeof auditRows?.[0]?.correlation_id, "string");
    assert.deepEqual(
      {
        event_type: auditRows?.[1]?.event_type,
        actor_id: auditRows?.[1]?.actor_id,
        policy_decision: auditRows?.[1]?.policy_decision,
        reason_code: auditRows?.[1]?.reason_code,
      },
      {
        event_type: "authorization.denied",
        actor_id: null,
        policy_decision: "deny",
        reason_code: "actor_context_required",
      },
    );
  } finally {
    auditDb.close();
  }
});

test("server runtime rejects whitespace-padded actor registry strings at startup", async (t) => {
  let db: OnboardingTransactionRequestDatabase & { close(): void };
  try {
    db = await openLocalSyntheticWritebackDatabase(":memory:");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return;
    }
    throw error;
  }
  t.after(() => {
    db.close();
  });

  const token = "local-p2list-whitespace-test-token-at-least-32-bytes";
  const actors = [
    {
      actorId: " actor-hr-operator",
      tenantId: "tenant-repo-owned-synthetic",
      permissions: [p2ListPermissions.employeeListRead],
      dataScope: { organizationCodes: ["ORG-SYNTHETIC"] },
    },
    {
      actorId: "actor-hr-operator",
      tenantId: "tenant-repo-owned-synthetic ",
      permissions: [p2ListPermissions.employeeListRead],
      dataScope: { organizationCodes: ["ORG-SYNTHETIC"] },
    },
    {
      actorId: "actor-hr-operator",
      tenantId: "tenant-repo-owned-synthetic",
      permissions: [`${p2ListPermissions.employeeListRead} `],
      dataScope: { organizationCodes: ["ORG-SYNTHETIC"] },
    },
    {
      actorId: "actor-hr-operator",
      tenantId: "tenant-repo-owned-synthetic",
      permissions: [p2ListPermissions.employeeListRead],
      dataScope: { organizationCodes: [" ORG-SYNTHETIC"] },
    },
  ];

  for (const actor of actors) {
    await assert.rejects(
      createServerP2ListEmployeeRuntime(db, {
        P2LIST_EMPLOYEE_ACTORS_JSON: JSON.stringify([{ token, actor }]),
      }),
      /must contain valid server-owned actor profiles/u,
    );
  }
});

test("GET /employees fails closed when an injected runtime omits its audit sink", async (t) => {
  const harness = await createHarness(t, 1);
  if (!harness) return;

  (
    harness.runtime as {
      emitAuditEvent?: P2ListEmployeeApiRuntime["emitAuditEvent"];
    }
  ).emitAuditEvent = undefined;

  const response = await harness.app.inject({
    method: "GET",
    url: "/employees",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(response.statusCode, 500);
  assert.equal(harness.auditEvents.length, 0);
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
  assert.equal(
    harness.auditEvents.some(
      (event) => event.eventType === "authorization.denied",
    ),
    false,
  );
});

test("GET /employees/:employeeId authorizes detail and emits detail-open evidence", async (t) => {
  const harness = await createHarness(t, 1, {
    authorized: authorizedDetailActor,
  });
  if (!harness) return;

  const response = await harness.app.inject({
    method: "GET",
    url: "/employees/EMP-001?asOf=2026-01-01",
    headers: { authorization: "Bearer authorized" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().item.employeeId, "EMP-001");
  assert.equal(response.json().asOf, "2026-01-01");
  assert.equal(harness.auditEvents.length, 1);
  assert.equal(
    harness.auditEvents[0]?.eventType,
    "employee_detail.opened_from_list",
  );
  assert.equal(harness.auditEvents[0]?.rowCount, 1);
  assert.equal(
    harness.auditEvents[0]?.evaluatedPermission,
    p2ListPermissions.employeeDetailRead,
  );
  assert.doesNotMatch(JSON.stringify(harness.auditEvents), /EMP-001/u);
});

test("GET /employees/:employeeId rejects an explicitly empty asOf", async (t) => {
  const harness = await createHarness(t, 1, {
    authorized: authorizedDetailActor,
  });
  if (!harness) return;

  const response = await harness.app.inject({
    method: "GET",
    url: "/employees/EMP-001?asOf=",
    headers: { authorization: "Bearer authorized" },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().code, "invalid_filter");
  assert.equal(harness.auditEvents.length, 0);
});

test("GET /employees/:employeeId denies list-only actors", async (t) => {
  const harness = await createHarness(t, 1);
  if (!harness) return;

  const response = await harness.app.inject({
    method: "GET",
    url: "/employees/EMP-001",
    headers: { authorization: "Bearer authorized" },
  });

  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "permission_denied");
  assert.equal(harness.auditEvents.length, 1);
  assert.equal(harness.auditEvents[0]?.eventType, "authorization.denied");
  assert.equal(
    harness.auditEvents[0]?.evaluatedPermission,
    p2ListPermissions.employeeDetailRead,
  );
});

test("GET /employees/:employeeId does not expose out-of-scope records", async (t) => {
  const harness = await createHarness(t, 1, {
    restricted: {
      ...authorizedDetailActor,
      actorId: "actor-restricted",
      dataScope: { organizationCodes: ["ORG-OTHER"] },
    },
  });
  if (!harness) return;

  const response = await harness.app.inject({
    method: "GET",
    url: "/employees/EMP-001",
    headers: { authorization: "Bearer restricted" },
  });

  assert.equal(response.statusCode, 404);
  assert.equal(harness.auditEvents.length, 1);
  assert.equal(harness.auditEvents[0]?.eventType, "authorization.denied");
  assert.equal(harness.auditEvents[0]?.reasonCode, "data_scope_denied");
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
      runtime: P2ListEmployeeApiRuntime;
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
  return { app, auditEvents, runtime };
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
