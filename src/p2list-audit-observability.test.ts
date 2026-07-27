import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "./app.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import { createServerP2ListRuntimes } from "./p2list-employee-runtime.js";
import {
  p2ListAuditEventVersion,
  p2ListExportSchemaVersion,
  p2ListPermissions,
} from "./p2list-contract.js";

const interactionCorrelationId =
  "p2list-ui-123e4567-e89b-42d3-a456-426614174000";
const responseCorrelationId = "p2list-ui-223e4567-e89b-42d3-a456-426614174000";
const operatorToken = "p2list-observability-operator-token-0001";
const supportToken = "p2list-observability-support-token-00001";

test("P2LIST WebUI correlation is idempotently traceable through policy and bounded support evidence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hrcore-p2list-observe-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const database = await openLocalSyntheticWritebackDatabase(
    `file:${join(directory, "hrcore.sqlite")}`,
  );
  const runtimes = await createServerP2ListRuntimes(database, {
    P2LIST_EMPLOYEE_ACTORS_JSON: JSON.stringify([
      {
        token: operatorToken,
        actor: {
          actorId: "actor-observability-operator",
          actorRole: "hr_operator",
          tenantId: "tenant-repo-owned-synthetic",
          permissions: [p2ListPermissions.employeeListRead],
          dataScope: { organizationCodes: ["ORG-NONE"] },
        },
      },
      {
        token: supportToken,
        actor: {
          actorId: "actor-observability-support",
          actorRole: "hr_ops_support",
          tenantId: "tenant-repo-owned-synthetic",
          permissions: [p2ListPermissions.supportCorrelationRead],
          dataScope: { correlationIds: [interactionCorrelationId] },
        },
      },
    ]),
  });
  const app = await buildApp({
    p2ListAuditEvidenceApi: runtimes.auditEvidence,
    p2ListEmployeeApi: runtimes.employee,
  });
  t.after(async () => {
    await app.close();
    database.close();
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: "/employees",
      headers: {
        authorization: `Bearer ${operatorToken}`,
        "x-hrcore-correlation-id": interactionCorrelationId,
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers["x-hrcore-correlation-id"],
      interactionCorrelationId,
    );
    assert.equal(response.json().correlationId, interactionCorrelationId);
  }
  const conflictingRetry = await app.inject({
    method: "GET",
    url: "/employees?sort=displayName",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": interactionCorrelationId,
    },
  });
  assert.equal(conflictingRetry.statusCode, 400);
  assert.equal(conflictingRetry.json().code, "correlation_reuse_conflict");
  const conflictingEventTypeRetry = await app.inject({
    method: "GET",
    url: "/employees?q=Synthetic",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": interactionCorrelationId,
    },
  });
  assert.equal(conflictingEventTypeRetry.statusCode, 400);
  assert.equal(
    conflictingEventTypeRetry.json().code,
    "correlation_reuse_conflict",
  );
  const exportCorrelationId = "p2list-export-valid-pair-correlation";
  const exportAuditEvent = {
    eventVersion: p2ListAuditEventVersion,
    occurredAt: "2026-07-28T00:00:00.000Z",
    actorId: "actor-observability-operator",
    actorRole: "hr_operator",
    evaluatedPermission: p2ListPermissions.employeeListExport,
    dataScopeId: "bounded-export-data-scope",
    filterFingerprint: "bounded-export-filter",
    rowCount: 0,
    resourceType: "employee" as const,
    correlationId: exportCorrelationId,
    policyDecision: "allow" as const,
    reasonCode: "uat_reconciliation" as const,
    exportSchemaVersion: p2ListExportSchemaVersion,
    durationMs: 1,
  };
  runtimes.export.emitAuditEvent({
    ...exportAuditEvent,
    eventId: "p2list-export-requested-event",
    eventType: "bounded_export.requested",
  });
  runtimes.export.emitAuditEvent({
    ...exportAuditEvent,
    eventId: "p2list-export-completed-event",
    eventType: "bounded_export.completed",
    durationMs: 2,
  });
  assert.equal(
    database
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM p2list_audit_event
          WHERE correlation_id = ?
        `,
      )
      .get(exportCorrelationId)?.count,
    2,
  );

  const evidenceResponse = await app.inject({
    method: "GET",
    url: `/support/p2list/audit-evidence/${interactionCorrelationId}`,
    headers: {
      authorization: `Bearer ${supportToken}`,
      "x-hrcore-correlation-id": responseCorrelationId,
    },
  });
  assert.equal(evidenceResponse.statusCode, 200);
  assert.equal(
    evidenceResponse.headers["x-hrcore-correlation-id"],
    responseCorrelationId,
  );
  assert.deepEqual(evidenceResponse.json(), {
    correlationId: interactionCorrelationId,
    events: [
      {
        eventType: "employee_list.viewed",
        eventVersion: p2ListAuditEventVersion,
        occurredAt: evidenceResponse.json().events[0].occurredAt,
        actorId: "actor-observability-operator",
        actorRole: "hr_operator",
        evaluatedPermission: p2ListPermissions.employeeListRead,
        dataScopeId: evidenceResponse.json().events[0].dataScopeId,
        filterFingerprint: evidenceResponse.json().events[0].filterFingerprint,
        sort: "employeeId:asc",
        pageSize: 25,
        rowCount: 0,
        resourceType: "employee",
        correlationId: interactionCorrelationId,
        policyDecision: "allow",
        reasonCode: null,
        exportSchemaVersion: null,
        durationMs: evidenceResponse.json().events[0].durationMs,
      },
    ],
    metrics: {
      requestCount: 1,
      latencyMs: {
        count: 1,
        minimum: evidenceResponse.json().events[0].durationMs,
        maximum: evidenceResponse.json().events[0].durationMs,
        average: evidenceResponse.json().events[0].durationMs,
      },
      denialReasons: [],
      exportResults: { requested: 0, completed: 0, denied: 0 },
    },
    authorization: {
      dataScope: "correlation_exact",
      readiness: "bounded_synthetic_only_not_production_ready",
    },
  });

  const persistedCount = database
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM p2list_audit_event
        WHERE correlation_id = ?
          AND event_type = 'employee_list.viewed'
      `,
    )
    .get(interactionCorrelationId);
  assert.equal(persistedCount?.count, 1);
});

test("P2LIST support evidence hides absent and out-of-scope correlations identically", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hrcore-p2list-scope-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const database = await openLocalSyntheticWritebackDatabase(
    `file:${join(directory, "hrcore.sqlite")}`,
  );
  const supportActor = {
    actorId: "actor-bounded-support",
    actorRole: "hr_ops_support",
    tenantId: "tenant-repo-owned-synthetic",
    permissions: [p2ListPermissions.supportCorrelationRead],
    dataScope: { correlationIds: ["bounded-correlation"] },
  };
  const app = await buildApp({
    p2ListAuditEvidenceApi: {
      database,
      resolveActor: async () => supportActor,
    },
  });
  t.after(async () => {
    await app.close();
    database.close();
  });

  database
    .prepare(
      `
        INSERT INTO p2list_audit_event (
          event_id,
          event_type,
          event_version,
          occurred_at,
          actor_id,
          actor_role,
          evaluated_permission,
          resource_type,
          correlation_id,
          policy_decision,
          duration_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .run(
      "event-outside-support-scope",
      "authorization.denied",
      p2ListAuditEventVersion,
      "2026-07-28T00:00:00.000Z",
      "synthetic-denied-actor",
      "hr_operator",
      p2ListPermissions.employeeListRead,
      "employee",
      "outside-correlation",
      "deny",
      3,
    );

  const request = (correlationId: string) =>
    app.inject({
      method: "GET",
      url: `/support/p2list/audit-evidence/${correlationId}`,
      headers: { "x-hrcore-correlation-id": responseCorrelationId },
    });
  const [outside, absent] = await Promise.all([
    request("outside-correlation"),
    request("bounded-correlation"),
  ]);
  assert.equal(outside.statusCode, 404);
  assert.equal(absent.statusCode, 404);
  assert.deepEqual(outside.json(), absent.json());

  supportActor.permissions = [];
  const forbidden = await request("bounded-correlation");
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.json().code, "permission_denied");
});

test("P2LIST evidence metrics expose stable non-PII denial and export aggregates only", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hrcore-p2list-redact-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const database = await openLocalSyntheticWritebackDatabase(
    `file:${join(directory, "hrcore.sqlite")}`,
  );
  const correlationId = "bounded-export-correlation";
  for (const [index, eventType, decision, reasonCode, duration] of [
    [1, "bounded_export.requested", "allow", "uat_reconciliation", 4],
    [2, "bounded_export.completed", "allow", "uat_reconciliation", 7],
    [3, "bounded_export.denied", "deny", "permission_denied", 2],
  ] as const) {
    database
      .prepare(
        `
          INSERT INTO p2list_audit_event (
            event_id,
            event_type,
            event_version,
            occurred_at,
            actor_id,
            actor_role,
            evaluated_permission,
            data_scope_id,
            filter_fingerprint,
            resource_type,
            correlation_id,
            policy_decision,
            reason_code,
            export_schema_version,
            duration_ms
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run(
        `bounded-export-event-${index}`,
        eventType,
        p2ListAuditEventVersion,
        `2026-07-28T00:00:0${index}.000Z`,
        "synthetic-export-actor",
        "hr_operator",
        p2ListPermissions.employeeListExport,
        "sha256-scope-fingerprint",
        "sha256-filter-fingerprint",
        "employee",
        correlationId,
        decision,
        reasonCode,
        "p2list_export_v1",
        duration,
      );
  }
  const app = await buildApp({
    p2ListAuditEvidenceApi: {
      database,
      resolveActor: async () => ({
        actorId: "actor-bounded-support",
        actorRole: "hr_ops_support",
        tenantId: "tenant-repo-owned-synthetic",
        permissions: [p2ListPermissions.supportCorrelationRead],
        dataScope: { correlationIds: [correlationId] },
      }),
    },
  });
  t.after(async () => {
    await app.close();
    database.close();
  });

  const response = await app.inject({
    method: "GET",
    url: `/support/p2list/audit-evidence/${correlationId}`,
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().metrics, {
    requestCount: 1,
    latencyMs: { count: 1, minimum: 7, maximum: 7, average: 7 },
    denialReasons: [{ reasonCode: "permission_denied", count: 1 }],
    exportResults: { requested: 1, completed: 1, denied: 1 },
  });
  assert.doesNotMatch(
    response.body,
    /Private Person|PRIVATE_QUERY|raw_cursor|employee_id,display_name|rawPayload|private_note/u,
  );
});
