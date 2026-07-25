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
import { p2ListPermissions } from "./p2list-contract.js";
import { P2ListCursorManager } from "./p2list-cursor.js";
import { createServerP2ListLifecycleRuntime } from "./p2list-employee-runtime.js";
import {
  createP2ListFixtureManifest,
  createP2ListLifecycleFixtureRows,
  type P2ListLifecycleFixtureRow,
} from "./p2list-read-model-fixtures.js";
import { P2ListReadModelRepository } from "./p2list-read-model-repository.js";
import {
  verifyP2ListSyntheticDatasetManifest,
  type P2ListActorContext,
} from "./p2list-read-model-types.js";
import {
  registerP2ListLifecycleRoutes,
  type P2ListLifecycleApiRuntime,
  type P2ListLifecycleAuditEvent,
} from "./routes/p2list-lifecycle-requests.js";

const manifestSecret =
  "p2list-lifecycle-api-manifest-fixture-secret-at-least-32-bytes";
const cursorSecret =
  "p2list-lifecycle-api-cursor-fixture-secret-at-least-32-bytes";
const acceptedAt = new Date("2026-07-25T08:00:00.000Z");
const authorizedActor: P2ListActorContext = {
  actorId: "actor-lifecycle-operator",
  tenantId: "tenant-repo-owned-synthetic",
  permissions: [p2ListPermissions.lifecycleRequestListRead],
  dataScope: { organizationCodes: ["ORG-LIFECYCLE-SYNTHETIC"] },
};

test("GET /lifecycle/transaction-requests suppresses raw query values from logs", async (t) => {
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
  registerP2ListLifecycleRoutes(app, {});
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?q=PrivateName&correlationId=PRIVATE-CORRELATION",
  });
  assert.equal(response.statusCode, 401);
  assert.doesNotMatch(logs, /PrivateName|PRIVATE-CORRELATION|rawQuery/u);
});

test("GET /lifecycle/transaction-requests returns a bounded page and safe audit handoff", async (t) => {
  const harness = await createHarness(t, 26);
  if (!harness) return;

  const response = await harness.app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?requestType=onboarding&status=submitted&q=Synthetic&requestedFrom=2026-07-01T00%3A00%3A00.000Z&requestedTo=2026-07-01T01%3A00%3A00.000Z&effectiveFrom=2026-08-01&effectiveTo=2026-08-01&sort=effectiveDate&direction=asc",
    headers: { authorization: "Bearer authorized" },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["x-correlation-id"], "lifecycle-correlation-1");
  const body = response.json();
  assert.equal(body.items.length, 25);
  assert.deepEqual(Object.keys(body.items[0]).sort(), [
    "decidedBy",
    "effectiveDate",
    "organizationCode",
    "requestType",
    "requestedAt",
    "status",
    "subjectDisplayName",
    "subjectEmployeeId",
    "subjectPersonId",
    "transactionRequestId",
  ]);
  assert.equal(body.items[0].requestType, "onboarding");
  assert.equal(body.items[0].subjectEmployeeId, null);
  assert.equal(body.pageInfo.hasNextPage, true);
  assert.equal(typeof body.pageInfo.nextCursor, "string");
  assert.deepEqual(body.authorization, {
    dataScope: "bounded",
    maskedFields: [],
    readiness: "bounded_synthetic_only_not_production_ready",
  });
  assert.deepEqual(body.appliedFilters, {
    requestType: ["onboarding"],
    status: ["submitted"],
    q: "Synthetic",
    requestedFrom: "2026-07-01T00:00:00.000Z",
    requestedTo: "2026-07-01T01:00:00.000Z",
    effectiveFrom: "2026-08-01",
    effectiveTo: "2026-08-01",
  });
  assert.equal(body.correlationId, "lifecycle-correlation-1");

  assert.equal(harness.auditEvents.length, 1);
  assert.deepEqual(
    {
      eventType: harness.auditEvents[0]?.eventType,
      evaluatedPermission: harness.auditEvents[0]?.evaluatedPermission,
      sort: harness.auditEvents[0]?.sort,
      pageSize: harness.auditEvents[0]?.pageSize,
      rowCount: harness.auditEvents[0]?.rowCount,
      resourceType: harness.auditEvents[0]?.resourceType,
      policyDecision: harness.auditEvents[0]?.policyDecision,
    },
    {
      eventType: "lifecycle_request_list.search_applied",
      evaluatedPermission: p2ListPermissions.lifecycleRequestListRead,
      sort: "effectiveDate:asc",
      pageSize: 25,
      rowCount: 25,
      resourceType: "lifecycleRequest",
      policyDecision: "allow",
    },
  );
  const serializedAudit = JSON.stringify(harness.auditEvents);
  assert.doesNotMatch(serializedAudit, /Synthetic Lifecycle Subject/u);
  assert.doesNotMatch(serializedAudit, /"q"|rawQuery|rawCursor/u);
});

test("GET /lifecycle/transaction-requests binds cursor to filters and actor context", async (t) => {
  const harness = await createHarness(t, 26, {
    authorized: authorizedActor,
    "other-actor": {
      ...authorizedActor,
      actorId: "actor-other-lifecycle-operator",
    },
  });
  if (!harness) return;

  const first = await harness.app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?limit=25",
    headers: { authorization: "Bearer authorized" },
  });
  const cursor = first.json().pageInfo.nextCursor as string;

  const next = await harness.app.inject({
    method: "GET",
    url: `/lifecycle/transaction-requests?limit=25&cursor=${encodeURIComponent(cursor)}`,
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(next.statusCode, 200);
  assert.equal(next.json().items.length, 1);
  assert.equal(
    harness.auditEvents.at(-1)?.eventType,
    "lifecycle_request_list.page_requested",
  );

  for (const fixture of [
    {
      url: `/lifecycle/transaction-requests?limit=25&status=approved&cursor=${encodeURIComponent(cursor)}`,
      token: "authorized",
      code: "cursor_filter_mismatch",
      status: 400,
    },
    {
      url: `/lifecycle/transaction-requests?cursor=${encodeURIComponent(`${cursor.slice(0, -1)}${cursor.endsWith("A") ? "B" : "A"}`)}`,
      token: "authorized",
      code: "cursor_invalid",
      status: 400,
    },
    {
      url: `/lifecycle/transaction-requests?cursor=${encodeURIComponent(cursor)}`,
      token: "other-actor",
      code: "permission_denied",
      status: 403,
    },
    {
      url: "/lifecycle/transaction-requests?cursor=",
      token: "authorized",
      code: "cursor_invalid",
      status: 400,
    },
  ]) {
    const response: {
      statusCode: number;
      json(): Record<string, unknown>;
    } = await harness.app.inject({
      method: "GET",
      url: fixture.url,
      headers: { authorization: `Bearer ${fixture.token}` },
    });
    assert.equal(response.statusCode, fixture.status);
    assert.equal(response.json().code, fixture.code);
  }
});

test("GET /lifecycle/transaction-requests fails closed across actor, scope, and support permission", async (t) => {
  const harness = await createHarness(t, 1, {
    authorized: authorizedActor,
    "missing-permission": {
      ...authorizedActor,
      actorId: "actor-without-list-permission",
      permissions: [],
    },
    "missing-scope": {
      ...authorizedActor,
      actorId: "actor-without-scope",
      dataScope: {},
    },
    "support-reader": {
      ...authorizedActor,
      actorId: "actor-support-reader",
      permissions: [
        p2ListPermissions.lifecycleRequestListRead,
        p2ListPermissions.supportCorrelationRead,
      ],
      dataScope: {
        organizationCodes: ["ORG-LIFECYCLE-SYNTHETIC"],
        correlationIds: ["p2list-correlation-001"],
      },
    },
  });
  if (!harness) return;

  for (const fixture of [
    { token: undefined, status: 401, code: "actor_context_required" },
    { token: "unknown", status: 401, code: "actor_context_required" },
    { token: "missing-permission", status: 403, code: "permission_denied" },
    { token: "missing-scope", status: 403, code: "data_scope_denied" },
  ]) {
    const response: {
      statusCode: number;
      body: string;
      json(): Record<string, unknown>;
    } = await harness.app.inject({
      method: "GET",
      url: "/lifecycle/transaction-requests",
      headers: fixture.token
        ? { authorization: `Bearer ${fixture.token}` }
        : undefined,
    });
    assert.equal(response.statusCode, fixture.status);
    assert.equal(response.json().code, fixture.code);
    assert.doesNotMatch(
      response.body,
      /p2list-transaction-001|Synthetic Lifecycle Subject/u,
    );
  }

  const deniedCorrelation = await harness.app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?correlationId=p2list-correlation-001",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(deniedCorrelation.statusCode, 403);
  assert.equal(deniedCorrelation.json().code, "permission_denied");

  const allowedCorrelation = await harness.app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?correlationId=p2list-correlation-001",
    headers: { authorization: "Bearer support-reader" },
  });
  assert.equal(allowedCorrelation.statusCode, 200);
  assert.deepEqual(
    allowedCorrelation
      .json()
      .items.map(
        (item: { transactionRequestId: string }) => item.transactionRequestId,
      ),
    ["p2list-transaction-001"],
  );
  assert.equal(
    harness.auditEvents.filter(
      (event) => event.eventType === "authorization.denied",
    ).length,
    5,
  );
});

test("GET /lifecycle/transaction-requests validates bounded filters before repository access", async (t) => {
  const harness = await createHarness(t, 1);
  if (!harness) return;

  for (const fixture of [
    { query: "requestedBy=actor-private", code: "unsupported_filter" },
    { query: "requestType=onboarding,unknown", code: "invalid_filter" },
    { query: "status=submitted,submitted", code: "invalid_filter" },
    { query: "sort=privateSalary", code: "unsupported_sort" },
    { query: "direction=sideways", code: "invalid_sort" },
    { query: "limit=0", code: "limit_out_of_range" },
    { query: "limit=101", code: "limit_out_of_range" },
    {
      query: "requestType=onboarding&requestType=termination",
      code: "invalid_filter",
    },
    {
      query: "sort=requestedAt&sort=effectiveDate",
      code: "invalid_filter",
    },
    {
      query:
        "requestedFrom=2026-07-02T00%3A00%3A00.000Z&requestedTo=2026-07-01T00%3A00%3A00.000Z",
      code: "invalid_filter",
    },
    {
      query:
        "requestedFrom=2025-01-01T00%3A00%3A00.000Z&requestedTo=2026-07-01T00%3A00%3A00.000Z",
      code: "date_range_too_wide",
    },
    { query: "effectiveFrom=2026-08-01", code: "invalid_filter" },
  ]) {
    const response: {
      statusCode: number;
      json(): Record<string, unknown>;
    } = await harness.app.inject({
      method: "GET",
      url: `/lifecycle/transaction-requests?${fixture.query}`,
      headers: { authorization: "Bearer authorized" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, fixture.code);
    assert.equal(
      response.json().message,
      "The lifecycle request list request is invalid.",
    );
  }
  assert.equal(harness.auditEvents.length, 0);
});

test("server lifecycle runtime persists bounded allow and deny audit events", async (t) => {
  const tempDirectory = await mkdtemp(
    join(tmpdir(), "hrcore-p2list-lifecycle-runtime-"),
  );
  const manifestPath = join(tempDirectory, "lifecycle-manifest.json");
  let db: OnboardingTransactionRequestDatabase & { close(): void };
  try {
    db = await openLocalSyntheticWritebackDatabase(":memory:");
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
  const rows = createP2ListLifecycleFixtureRows(1);
  seedLifecycleRows(db, rows);
  await writeFile(
    manifestPath,
    JSON.stringify(
      createP2ListFixtureManifest(
        {
          datasetReference: "lifecycle-server-runtime-fixture",
          lifecycleRequests: rows,
        },
        manifestSecret,
      ),
    ),
    "utf8",
  );
  const token = "local-lifecycle-runtime-token-at-least-32-bytes";
  const runtime = await createServerP2ListLifecycleRuntime(db, {
    P2LIST_EMPLOYEE_MANIFEST_PATH: manifestPath,
    P2LIST_EMPLOYEE_MANIFEST_SECRET: manifestSecret,
    P2LIST_EMPLOYEE_CURSOR_SECRET: cursorSecret,
    P2LIST_EMPLOYEE_ACTORS_JSON: JSON.stringify([
      {
        token,
        actor: authorizedActor,
      },
    ]),
  });
  const app = await buildApp({ p2ListLifecycleApi: runtime });
  t.after(async () => {
    await app.close();
    db.close();
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const allowed = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(allowed.statusCode, 200);
  const denied = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests",
    headers: {
      authorization: `Bearer ${"unknown-lifecycle-token-".padEnd(32, "x")}`,
    },
  });
  assert.equal(denied.statusCode, 401);

  const auditRows = db
    .prepare(
      `
        SELECT
          event_type,
          actor_id,
          evaluated_permission,
          resource_type,
          policy_decision,
          reason_code,
          filter_fingerprint
        FROM p2list_audit_event
        ORDER BY rowid
      `,
    )
    .all?.();
  assert.deepEqual(
    auditRows?.map((row) => ({
      event_type: row.event_type,
      actor_id: row.actor_id,
      evaluated_permission: row.evaluated_permission,
      resource_type: row.resource_type,
      policy_decision: row.policy_decision,
      reason_code: row.reason_code,
      filter_fingerprint_type: typeof row.filter_fingerprint,
    })),
    [
      {
        event_type: "lifecycle_request_list.viewed",
        actor_id: authorizedActor.actorId,
        evaluated_permission: p2ListPermissions.lifecycleRequestListRead,
        resource_type: "lifecycleRequest",
        policy_decision: "allow",
        reason_code: null,
        filter_fingerprint_type: "string",
      },
      {
        event_type: "authorization.denied",
        actor_id: null,
        evaluated_permission: p2ListPermissions.lifecycleRequestListRead,
        resource_type: "lifecycleRequest",
        policy_decision: "deny",
        reason_code: "actor_context_required",
        filter_fingerprint_type: "object",
      },
    ],
  );
});

test("GET /lifecycle/transaction-requests requires its audit sink", async (t) => {
  const harness = await createHarness(t, 1);
  if (!harness) return;

  (
    harness.runtime as {
      emitAuditEvent?: P2ListLifecycleApiRuntime["emitAuditEvent"];
    }
  ).emitAuditEvent = undefined;

  const response = await harness.app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests",
    headers: { authorization: "Bearer authorized" },
  });
  assert.equal(response.statusCode, 500);
  assert.equal(harness.auditEvents.length, 0);
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
      auditEvents: P2ListLifecycleAuditEvent[];
      runtime: P2ListLifecycleApiRuntime;
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
  const rows = createP2ListLifecycleFixtureRows(count);
  seedLifecycleRows(db, rows);
  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "lifecycle-api-fixture",
        lifecycleRequests: rows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const auditEvents: P2ListLifecycleAuditEvent[] = [];
  let correlationSequence = 0;
  const runtime: P2ListLifecycleApiRuntime = {
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
    createCorrelationId: () => `lifecycle-correlation-${++correlationSequence}`,
  };
  const app = await buildApp({ p2ListLifecycleApi: runtime });
  t.after(async () => {
    await app.close();
    db.close();
  });
  return { app, auditEvents, runtime };
}

function seedLifecycleRows(
  db: OnboardingTransactionRequestDatabase,
  rows: readonly P2ListLifecycleFixtureRow[],
): void {
  const person = db.prepare(
    "INSERT INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const request = db.prepare(
    `
      INSERT INTO transaction_request (
        id, person_id, request_type, status_code, requested_at,
        correlation_id, payload_version, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  for (const row of rows) {
    person.run(row.personId, row.displayName, "2026-01-01T00:00:00.000Z");
    request.run(
      row.transactionRequestId,
      row.personId,
      row.requestType,
      row.status,
      row.requestedAt,
      row.correlationId,
      row.payloadVersion,
      row.payloadJson,
    );
  }
}
