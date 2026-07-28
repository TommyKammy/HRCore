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
const exportCorrelationId = "p2list-ui-323e4567-e89b-42d3-a456-426614174000";
const employeeDetailCorrelationId =
  "p2list-ui-423e4567-e89b-42d3-a456-426614174000";
const lifecycleDetailCorrelationId =
  "p2list-ui-523e4567-e89b-42d3-a456-426614174000";
const employeeDetailAsOfCorrelationId =
  "p2list-ui-623e4567-e89b-42d3-a456-426614174000";
const employeeListDenialCorrelationId =
  "p2list-ui-723e4567-e89b-42d3-a456-426614174000";
const lifecycleListDenialCorrelationId =
  "p2list-ui-823e4567-e89b-42d3-a456-426614174000";
const employeeExportDenialCorrelationId =
  "p2list-ui-923e4567-e89b-42d3-a456-426614174000";
const lifecycleExportDenialCorrelationId =
  "p2list-ui-a23e4567-e89b-42d3-a456-426614174000";
const employeeListUnauthenticatedCorrelationId =
  "p2list-ui-b23e4567-e89b-42d3-a456-426614174000";
const lifecycleListUnauthenticatedCorrelationId =
  "p2list-ui-c23e4567-e89b-42d3-a456-426614174000";
const employeeDetailUnauthenticatedCorrelationId =
  "p2list-ui-d23e4567-e89b-42d3-a456-426614174000";
const lifecycleDetailUnauthenticatedCorrelationId =
  "p2list-ui-e23e4567-e89b-42d3-a456-426614174000";
const malformedEmployeeExportCorrelationId =
  "p2list-ui-f23e4567-e89b-42d3-a456-426614174000";
const malformedEmployeeListCorrelationId =
  "p2list-ui-013e4567-e89b-42d3-a456-426614174000";
const malformedLifecycleListCorrelationId =
  "p2list-ui-023e4567-e89b-42d3-a456-426614174000";
const malformedEmployeeDetailCorrelationId =
  "p2list-ui-033e4567-e89b-42d3-a456-426614174000";
const malformedLifecycleDetailCorrelationId =
  "p2list-ui-043e4567-e89b-42d3-a456-426614174000";
const operatorToken = "p2list-observability-operator-token-0001";
const otherTenantOperatorToken =
  "p2list-observability-other-tenant-operator-token-0001";
const deniedOperatorToken = "p2list-observability-denied-token-00001";
const supportToken = "p2list-observability-support-token-00001";

test("P2LIST WebUI correlation is idempotently traceable through policy and bounded support evidence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "hrcore-p2list-observe-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  const database = await openLocalSyntheticWritebackDatabase(
    `file:${join(directory, "hrcore.sqlite")}`,
  );
  const auditTransactionStatements: string[] = [];
  const runtimeDatabase = new Proxy(database, {
    get(target, property) {
      if (property === "exec") {
        return (sql: string) => {
          const statement = sql.trim();
          if (
            statement === "BEGIN IMMEDIATE" ||
            statement === "COMMIT" ||
            statement === "ROLLBACK"
          ) {
            auditTransactionStatements.push(statement);
          }
          return target.exec(sql);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const runtimes = await createServerP2ListRuntimes(runtimeDatabase, {
    P2LIST_EMPLOYEE_ACTORS_JSON: JSON.stringify([
      {
        token: operatorToken,
        actor: {
          actorId: "actor-observability-operator",
          actorRole: "hr_operator",
          tenantId: "tenant-repo-owned-synthetic",
          permissions: [
            p2ListPermissions.employeeListRead,
            p2ListPermissions.employeeDetailRead,
            p2ListPermissions.employeeListExport,
            p2ListPermissions.lifecycleRequestListRead,
            p2ListPermissions.lifecycleRequestDetailRead,
            p2ListPermissions.csvDownload,
          ],
          dataScope: { organizationCodes: ["ORG-NONE"] },
        },
      },
      {
        token: otherTenantOperatorToken,
        actor: {
          actorId: "actor-observability-operator",
          actorRole: "hr_operator",
          tenantId: "tenant-repo-owned-synthetic-other",
          permissions: [
            p2ListPermissions.employeeListRead,
            p2ListPermissions.employeeDetailRead,
            p2ListPermissions.employeeListExport,
            p2ListPermissions.lifecycleRequestListRead,
            p2ListPermissions.lifecycleRequestDetailRead,
            p2ListPermissions.csvDownload,
          ],
          dataScope: { organizationCodes: ["ORG-NONE"] },
        },
      },
      {
        token: deniedOperatorToken,
        actor: {
          actorId: "actor-observability-denied",
          actorRole: "hr_operator",
          tenantId: "tenant-repo-owned-synthetic",
          permissions: [],
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
          dataScope: {
            correlationIds: [interactionCorrelationId, exportCorrelationId],
          },
        },
      },
    ]),
  });
  const app = await buildApp({
    p2ListAuditEvidenceApi: runtimes.auditEvidence,
    p2ListEmployeeApi: runtimes.employee,
    p2ListExportApi: runtimes.export,
    p2ListLifecycleApi: runtimes.lifecycle,
  });
  t.after(async () => {
    await app.close();
    database.close();
  });

  let employeeObservedAt = "2026-07-28T23:59:59.000Z";
  runtimes.employee.now = () => new Date(employeeObservedAt);
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
    employeeObservedAt = "2026-07-29T00:00:01.000Z";
  }
  const conflictingTenantRetry = await app.inject({
    method: "GET",
    url: "/employees",
    headers: {
      authorization: `Bearer ${otherTenantOperatorToken}`,
      "x-hrcore-correlation-id": interactionCorrelationId,
    },
  });
  assert.equal(conflictingTenantRetry.statusCode, 400);
  assert.equal(
    conflictingTenantRetry.json().code,
    "correlation_reuse_conflict",
  );
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
  for (const fixture of [
    {
      correlationId: malformedEmployeeListCorrelationId,
      initialUrl: "/employees?limit=0",
      conflictingUrl: "/employees?sort=privateSalary",
      code: "limit_out_of_range",
    },
    {
      correlationId: malformedLifecycleListCorrelationId,
      initialUrl: "/lifecycle/transaction-requests?limit=0",
      conflictingUrl: "/lifecycle/transaction-requests?sort=privateSalary",
      code: "limit_out_of_range",
    },
    {
      correlationId: malformedEmployeeDetailCorrelationId,
      initialUrl: "/employees/EMP-INVALID?asOf=",
      conflictingUrl: "/employees/EMP-INVALID?unsupported=value",
      code: "invalid_filter",
    },
    {
      correlationId: malformedLifecycleDetailCorrelationId,
      initialUrl:
        "/lifecycle/transaction-requests/request-invalid?unsupported=value",
      conflictingUrl:
        "/lifecycle/transaction-requests/request-invalid?different=value",
      code: "unsupported_filter",
    },
  ]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const malformedRequest = await app.inject({
        method: "GET",
        url: fixture.initialUrl,
        headers: {
          authorization: `Bearer ${operatorToken}`,
          "x-hrcore-correlation-id": fixture.correlationId,
        },
      });
      assert.equal(malformedRequest.statusCode, 400);
      assert.equal(malformedRequest.json().code, fixture.code);
    }
    const conflictingMalformedRequest = await app.inject({
      method: "GET",
      url: fixture.conflictingUrl,
      headers: {
        authorization: `Bearer ${operatorToken}`,
        "x-hrcore-correlation-id": fixture.correlationId,
      },
    });
    assert.equal(conflictingMalformedRequest.statusCode, 400);
    assert.equal(
      conflictingMalformedRequest.json().code,
      "correlation_reuse_conflict",
    );
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const unauthenticatedEmployeeList = await app.inject({
      method: "GET",
      url: "/employees?q=Unauthenticated-One",
      headers: {
        "x-hrcore-correlation-id": employeeListUnauthenticatedCorrelationId,
      },
    });
    assert.equal(unauthenticatedEmployeeList.statusCode, 401);
  }
  const conflictingUnauthenticatedEmployeeList = await app.inject({
    method: "GET",
    url: "/employees?q=Unauthenticated-Two",
    headers: {
      "x-hrcore-correlation-id": employeeListUnauthenticatedCorrelationId,
    },
  });
  assert.equal(conflictingUnauthenticatedEmployeeList.statusCode, 400);
  assert.equal(
    conflictingUnauthenticatedEmployeeList.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const unauthenticatedLifecycleList = await app.inject({
      method: "GET",
      url: "/lifecycle/transaction-requests?q=Unauthenticated-One",
      headers: {
        "x-hrcore-correlation-id": lifecycleListUnauthenticatedCorrelationId,
      },
    });
    assert.equal(unauthenticatedLifecycleList.statusCode, 401);
  }
  const conflictingUnauthenticatedLifecycleList = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?q=Unauthenticated-Two",
    headers: {
      "x-hrcore-correlation-id": lifecycleListUnauthenticatedCorrelationId,
    },
  });
  assert.equal(conflictingUnauthenticatedLifecycleList.statusCode, 400);
  assert.equal(
    conflictingUnauthenticatedLifecycleList.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const unauthenticatedEmployeeDetail = await app.inject({
      method: "GET",
      url: "/employees/EMP-UNAUTHENTICATED-ONE",
      headers: {
        "x-hrcore-correlation-id": employeeDetailUnauthenticatedCorrelationId,
      },
    });
    assert.equal(unauthenticatedEmployeeDetail.statusCode, 401);
  }
  const conflictingUnauthenticatedEmployeeDetail = await app.inject({
    method: "GET",
    url: "/employees/EMP-UNAUTHENTICATED-TWO",
    headers: {
      "x-hrcore-correlation-id": employeeDetailUnauthenticatedCorrelationId,
    },
  });
  assert.equal(conflictingUnauthenticatedEmployeeDetail.statusCode, 400);
  assert.equal(
    conflictingUnauthenticatedEmployeeDetail.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const unauthenticatedLifecycleDetail = await app.inject({
      method: "GET",
      url: "/lifecycle/transaction-requests/request-unauthenticated-one",
      headers: {
        "x-hrcore-correlation-id": lifecycleDetailUnauthenticatedCorrelationId,
      },
    });
    assert.equal(unauthenticatedLifecycleDetail.statusCode, 401);
  }
  const conflictingUnauthenticatedLifecycleDetail = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests/request-unauthenticated-two",
    headers: {
      "x-hrcore-correlation-id": lifecycleDetailUnauthenticatedCorrelationId,
    },
  });
  assert.equal(conflictingUnauthenticatedLifecycleDetail.statusCode, 400);
  assert.equal(
    conflictingUnauthenticatedLifecycleDetail.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deniedEmployeeList = await app.inject({
      method: "GET",
      url: "/employees?q=Alpha&sort=displayName&limit=50",
      headers: {
        authorization: `Bearer ${deniedOperatorToken}`,
        "x-hrcore-correlation-id": employeeListDenialCorrelationId,
      },
    });
    assert.equal(deniedEmployeeList.statusCode, 403);
  }
  const conflictingEmployeeListDenial = await app.inject({
    method: "GET",
    url: "/employees?q=Beta&sort=displayName&limit=50",
    headers: {
      authorization: `Bearer ${deniedOperatorToken}`,
      "x-hrcore-correlation-id": employeeListDenialCorrelationId,
    },
  });
  assert.equal(conflictingEmployeeListDenial.statusCode, 400);
  assert.equal(
    conflictingEmployeeListDenial.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deniedLifecycleList = await app.inject({
      method: "GET",
      url: "/lifecycle/transaction-requests?q=Alpha&sort=effectiveDate&limit=50",
      headers: {
        authorization: `Bearer ${deniedOperatorToken}`,
        "x-hrcore-correlation-id": lifecycleListDenialCorrelationId,
      },
    });
    assert.equal(deniedLifecycleList.statusCode, 403);
  }
  const conflictingLifecycleListDenial = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests?q=Beta&sort=effectiveDate&limit=50",
    headers: {
      authorization: `Bearer ${deniedOperatorToken}`,
      "x-hrcore-correlation-id": lifecycleListDenialCorrelationId,
    },
  });
  assert.equal(conflictingLifecycleListDenial.statusCode, 400);
  assert.equal(
    conflictingLifecycleListDenial.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deniedEmployeeExport = await app.inject({
      method: "POST",
      url: "/exports/employee-list",
      headers: {
        authorization: `Bearer ${deniedOperatorToken}`,
        "x-hrcore-correlation-id": employeeExportDenialCorrelationId,
      },
      payload: {
        filters: { organizationCode: "ORG-EXPORT-ONE" },
        reasonCode: "uat_reconciliation",
      },
    });
    assert.equal(deniedEmployeeExport.statusCode, 403);
  }
  const conflictingEmployeeExportDenial = await app.inject({
    method: "POST",
    url: "/exports/employee-list",
    headers: {
      authorization: `Bearer ${deniedOperatorToken}`,
      "x-hrcore-correlation-id": employeeExportDenialCorrelationId,
    },
    payload: {
      filters: { organizationCode: "ORG-EXPORT-TWO" },
      reasonCode: "operational_reconciliation",
    },
  });
  assert.equal(conflictingEmployeeExportDenial.statusCode, 400);
  assert.equal(
    conflictingEmployeeExportDenial.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const deniedLifecycleExport = await app.inject({
      method: "POST",
      url: "/exports/lifecycle-request-list",
      headers: {
        authorization: `Bearer ${deniedOperatorToken}`,
        "x-hrcore-correlation-id": lifecycleExportDenialCorrelationId,
      },
      payload: {
        filters: { organizationCode: "ORG-EXPORT-ONE" },
        reasonCode: "uat_reconciliation",
      },
    });
    assert.equal(deniedLifecycleExport.statusCode, 403);
  }
  const conflictingLifecycleExportDenial = await app.inject({
    method: "POST",
    url: "/exports/lifecycle-request-list",
    headers: {
      authorization: `Bearer ${deniedOperatorToken}`,
      "x-hrcore-correlation-id": lifecycleExportDenialCorrelationId,
    },
    payload: {
      filters: { organizationCode: "ORG-EXPORT-TWO" },
      reasonCode: "operational_reconciliation",
    },
  });
  assert.equal(conflictingLifecycleExportDenial.statusCode, 400);
  assert.equal(
    conflictingLifecycleExportDenial.json().code,
    "correlation_reuse_conflict",
  );
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const malformedEmployeeExport = await app.inject({
      method: "POST",
      url: "/exports/employee-list",
      headers: {
        authorization: `Bearer ${operatorToken}`,
        "content-type": "application/json",
        "x-hrcore-correlation-id": malformedEmployeeExportCorrelationId,
      },
      payload: '{"filters":',
    });
    assert.equal(malformedEmployeeExport.statusCode, 400);
    assert.equal(malformedEmployeeExport.json().code, "invalid_filter");
  }
  const conflictingMalformedEmployeeExport = await app.inject({
    method: "POST",
    url: "/exports/employee-list",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "content-type": "application/json",
      "x-hrcore-correlation-id": malformedEmployeeExportCorrelationId,
    },
    payload: '{"reasonCode":',
  });
  assert.equal(conflictingMalformedEmployeeExport.statusCode, 400);
  assert.equal(
    conflictingMalformedEmployeeExport.json().code,
    "correlation_reuse_conflict",
  );
  employeeObservedAt = "2026-07-29T23:59:59.000Z";
  const deniedEmployeeDetail = await app.inject({
    method: "GET",
    url: "/employees/EMP-MISSING-ONE",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": employeeDetailCorrelationId,
    },
  });
  assert.equal(deniedEmployeeDetail.statusCode, 404);
  employeeObservedAt = "2026-07-30T00:00:01.000Z";
  const deniedEmployeeDetailRetry = await app.inject({
    method: "GET",
    url: "/employees/EMP-MISSING-ONE",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": employeeDetailCorrelationId,
    },
  });
  assert.equal(deniedEmployeeDetailRetry.statusCode, 404);
  const conflictingEmployeeDetail = await app.inject({
    method: "GET",
    url: "/employees/EMP-MISSING-TWO",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": employeeDetailCorrelationId,
    },
  });
  assert.equal(conflictingEmployeeDetail.statusCode, 400);
  assert.equal(
    conflictingEmployeeDetail.json().code,
    "correlation_reuse_conflict",
  );
  const deniedEmployeeDetailAsOf = await app.inject({
    method: "GET",
    url: "/employees/EMP-MISSING-AS-OF?asOf=2026-07-27",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": employeeDetailAsOfCorrelationId,
    },
  });
  assert.equal(deniedEmployeeDetailAsOf.statusCode, 404);
  const conflictingEmployeeDetailAsOf = await app.inject({
    method: "GET",
    url: "/employees/EMP-MISSING-AS-OF?asOf=2026-07-28",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": employeeDetailAsOfCorrelationId,
    },
  });
  assert.equal(conflictingEmployeeDetailAsOf.statusCode, 400);
  assert.equal(
    conflictingEmployeeDetailAsOf.json().code,
    "correlation_reuse_conflict",
  );
  const deniedLifecycleDetail = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests/request-missing-one",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": lifecycleDetailCorrelationId,
    },
  });
  assert.equal(deniedLifecycleDetail.statusCode, 404);
  const deniedLifecycleDetailRetry = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests/request-missing-one",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": lifecycleDetailCorrelationId,
    },
  });
  assert.equal(deniedLifecycleDetailRetry.statusCode, 404);
  const conflictingLifecycleDetail = await app.inject({
    method: "GET",
    url: "/lifecycle/transaction-requests/request-missing-two",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": lifecycleDetailCorrelationId,
    },
  });
  assert.equal(conflictingLifecycleDetail.statusCode, 400);
  assert.equal(
    conflictingLifecycleDetail.json().code,
    "correlation_reuse_conflict",
  );
  const exportAcceptedAt = "2026-07-28T23:59:59.000Z";
  let exportObservedAt = exportAcceptedAt;
  runtimes.export.now = () => new Date(exportObservedAt);
  const exportResponse = await app.inject({
    method: "POST",
    url: "/exports/employee-list",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": exportCorrelationId,
    },
    payload: {
      filters: { organizationCode: "ORG-NONE" },
      reasonCode: "uat_reconciliation",
    },
  });
  assert.equal(exportResponse.statusCode, 200);
  exportObservedAt = "2026-07-29T00:00:01.000Z";
  const exportRetry = await app.inject({
    method: "POST",
    url: "/exports/employee-list",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": exportCorrelationId,
    },
    payload: {
      filters: { organizationCode: "ORG-NONE" },
      reasonCode: "uat_reconciliation",
    },
  });
  assert.equal(exportRetry.statusCode, 200);
  assert.equal(exportRetry.body, exportResponse.body);

  const conflictingExport = await app.inject({
    method: "POST",
    url: "/exports/employee-list",
    headers: {
      authorization: `Bearer ${operatorToken}`,
      "x-hrcore-correlation-id": exportCorrelationId,
    },
    payload: {
      filters: { organizationCode: "ORG-NONE" },
      reasonCode: "operational_reconciliation",
    },
  });
  assert.equal(conflictingExport.statusCode, 400);
  assert.equal(conflictingExport.json().code, "correlation_reuse_conflict");
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
  const exportEvidenceResponse = await app.inject({
    method: "GET",
    url: `/support/p2list/audit-evidence/${exportCorrelationId}`,
    headers: {
      authorization: `Bearer ${supportToken}`,
      "x-hrcore-correlation-id": responseCorrelationId,
    },
  });
  assert.equal(exportEvidenceResponse.statusCode, 200);
  assert.deepEqual(
    exportEvidenceResponse
      .json()
      .events.map((event: { eventType: string }) => event.eventType),
    ["bounded_export.requested", "bounded_export.completed"],
  );
  assert.deepEqual(
    exportEvidenceResponse
      .json()
      .events.map((event: { occurredAt: string }) => event.occurredAt),
    [exportAcceptedAt, exportAcceptedAt],
  );
  assert.ok(
    exportEvidenceResponse
      .json()
      .events.every(
        (event: { exportSchemaVersion: string }) =>
          event.exportSchemaVersion === p2ListExportSchemaVersion,
      ),
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
  let transactionOpen = false;
  for (const statement of auditTransactionStatements) {
    if (statement === "BEGIN IMMEDIATE") {
      assert.equal(transactionOpen, false);
      transactionOpen = true;
    } else {
      assert.equal(transactionOpen, true);
      transactionOpen = false;
    }
  }
  assert.equal(transactionOpen, false);
  assert.ok(auditTransactionStatements.includes("COMMIT"));
  assert.ok(auditTransactionStatements.includes("ROLLBACK"));
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
