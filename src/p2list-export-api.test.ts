import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test, { type TestContext } from "node:test";

import Fastify from "fastify";

import { buildApp } from "./app.js";
import {
  p2ListPermissions,
  type P2ListExportReasonCode,
} from "./p2list-contract.js";
import { P2ListReadModelRepository } from "./p2list-read-model-repository.js";
import type {
  P2ListActorContext,
  P2ListVerifiedSyntheticDataset,
} from "./p2list-read-model-types.js";
import type {
  P2ListExportApiRuntime,
  P2ListExportAuditEvent,
} from "./routes/p2list-exports.js";
import { registerP2ListExportRoutes } from "./routes/p2list-exports.js";

const occurredAt = new Date("2026-07-27T00:00:00.000Z");
const fullEmployeeActor: P2ListActorContext = {
  actorId: "actor-employee-export",
  actorRole: "hr_operator",
  tenantId: "tenant-repo-owned-synthetic",
  permissions: [
    p2ListPermissions.employeeListRead,
    p2ListPermissions.employeeListExport,
    p2ListPermissions.csvDownload,
  ],
  dataScope: { organizationCodes: ["ORG-SYNTHETIC"] },
};
const fullLifecycleActor: P2ListActorContext = {
  actorId: "actor-lifecycle-export",
  actorRole: "hr_operator",
  tenantId: "tenant-repo-owned-synthetic",
  permissions: [
    p2ListPermissions.lifecycleRequestListRead,
    p2ListPermissions.lifecycleRequestListExport,
    p2ListPermissions.csvDownload,
  ],
  dataScope: { organizationCodes: ["ORG-LIFECYCLE"] },
};

test("bounded export routes suppress request fields and CSV-adjacent values from logs", async (t) => {
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
  registerP2ListExportRoutes(app, {});
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/exports/employee-list",
    payload: {
      filters: {
        organizationCode: "PRIVATE-ORG-FOR-LOG-TEST",
      },
      reasonCode: "free form private reason",
      columns: ["rawPayload", "private_note"],
    },
  });

  assert.equal(response.statusCode, 401);
  assert.doesNotMatch(
    logs,
    /PRIVATE-ORG-FOR-LOG-TEST|free form private reason|rawPayload|private_note/u,
  );
});

test("POST /exports/employee-list returns a server-owned bounded CSV and safe audit handoff", async (t) => {
  let repositoryInput: unknown;
  const completedAt = new Date("2026-07-27T00:00:01.000Z");
  let nowCalls = 0;
  const harness = await createHarness(t, {
    actors: { employee: fullEmployeeActor },
    now: () => (nowCalls++ === 0 ? occurredAt : completedAt),
    listEmployees(input) {
      repositoryInput = input;
      return employeePage(false);
    },
  });

  const response = await harness.app.inject({
    method: "POST",
    url: "/exports/employee-list",
    headers: { authorization: "Bearer employee" },
    payload: {
      filters: {
        organizationCode: "ORG-SYNTHETIC",
        employmentStatus: "active",
      },
      reasonCode: "operational_reconciliation",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "text/csv; charset=utf-8");
  assert.equal(
    response.headers["x-hrcore-correlation-id"],
    "export-correlation-1",
  );
  assert.equal(
    response.headers["x-hrcore-export-schema-version"],
    "p2list_export_v1",
  );
  assert.match(
    String(response.headers["content-disposition"]),
    /hrcore-bounded-employees-p2list_export_v1\.csv/u,
  );
  assert.match(response.body, /employee_id,display_name,employment_status/u);
  assert.match(response.body, /'=Synthetic Employee/u);
  assert.doesNotMatch(response.body, /rawPayload|private_note/u);
  assert.deepEqual(
    {
      filters: (
        repositoryInput as {
          filters: unknown;
        }
      ).filters,
      sort: (repositoryInput as { sort: unknown }).sort,
      direction: (repositoryInput as { direction: unknown }).direction,
      limit: (repositoryInput as { limit: unknown }).limit,
    },
    {
      filters: {
        organizationCode: "ORG-SYNTHETIC",
        employmentStatus: "active",
      },
      sort: "employeeId",
      direction: "asc",
      limit: 100,
    },
  );
  assert.deepEqual(
    harness.auditEvents.map((event) => event.eventType),
    ["bounded_export.requested", "bounded_export.completed"],
  );
  assert.deepEqual(
    harness.auditEvents.map((event) => event.occurredAt),
    [occurredAt.toISOString(), completedAt.toISOString()],
  );
  assert.ok(
    harness.auditEvents.every(
      (event) =>
        event.exportSchemaVersion === "p2list_export_v1" &&
        event.reasonCode === "operational_reconciliation" &&
        event.rowCount === 1,
    ),
  );
  const auditJson = JSON.stringify(harness.auditEvents);
  assert.doesNotMatch(
    auditJson,
    /Synthetic Employee|ORG-SYNTHETIC|csv|rawPayload/u,
  );
});

test("POST /exports/lifecycle-request-list returns canonical lifecycle columns", async (t) => {
  const completedAt = new Date("2026-07-27T00:00:02.000Z");
  let nowCalls = 0;
  const harness = await createHarness(t, {
    actors: { lifecycle: fullLifecycleActor },
    now: () => (nowCalls++ === 0 ? occurredAt : completedAt),
    listLifecycleRequests() {
      return lifecyclePage(false);
    },
  });

  const response = await harness.app.inject({
    method: "POST",
    url: "/exports/lifecycle-request-list",
    headers: { authorization: "Bearer lifecycle" },
    payload: {
      filters: {
        organizationCode: "ORG-LIFECYCLE",
        status: ["submitted"],
      },
      reasonCode: "uat_reconciliation",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["x-hrcore-correlation-id"],
    "export-correlation-1",
  );
  assert.match(
    response.body,
    /transaction_request_id,request_type,status,subject_employee_id/u,
  );
  assert.match(response.body, /2026-07-01T00:00:00\.000Z/u);
  assert.deepEqual(
    harness.auditEvents.map((event) => event.resourceType),
    ["lifecycleRequest", "lifecycleRequest"],
  );
  assert.deepEqual(
    harness.auditEvents.map((event) => event.occurredAt),
    [occurredAt.toISOString(), completedAt.toISOString()],
  );
});

test("malformed JSON exports use the bounded 400 contract and denial audit", async (t) => {
  const harness = await createHarness(t, {
    actors: {
      employee: fullEmployeeActor,
      lifecycle: fullLifecycleActor,
    },
  });
  const cases = [
    {
      url: "/exports/employee-list",
      token: "employee",
      resourceType: "employee",
    },
    {
      url: "/exports/lifecycle-request-list",
      token: "lifecycle",
      resourceType: "lifecycleRequest",
    },
  ] as const;

  for (const [index, scenario] of cases.entries()) {
    const response = await harness.app.inject({
      method: "POST",
      url: scenario.url,
      headers: {
        authorization: `Bearer ${scenario.token}`,
        "content-type": "application/json",
      },
      payload: '{"filters":',
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.json().code, "invalid_filter");
    assert.equal(
      response.headers["x-hrcore-correlation-id"],
      `export-correlation-${index + 1}`,
    );
    assert.equal(
      response.json().correlationId,
      `export-correlation-${index + 1}`,
    );
  }

  assert.deepEqual(
    harness.auditEvents.map((event) => ({
      eventType: event.eventType,
      resourceType: event.resourceType,
      reasonCode: event.reasonCode,
      correlationId: event.correlationId,
    })),
    cases.map((scenario, index) => ({
      eventType: "bounded_export.denied",
      resourceType: scenario.resourceType,
      reasonCode: "invalid_filter",
      correlationId: `export-correlation-${index + 1}`,
    })),
  );
});

test("bounded exports fail closed for authorization, policy, column, and row-cap violations", async (t) => {
  const noExportActor: P2ListActorContext = {
    ...fullEmployeeActor,
    permissions: [
      p2ListPermissions.employeeListRead,
      p2ListPermissions.csvDownload,
    ],
  };
  const noDownloadActor: P2ListActorContext = {
    ...fullEmployeeActor,
    permissions: [
      p2ListPermissions.employeeListRead,
      p2ListPermissions.employeeListExport,
    ],
  };
  const harness = await createHarness(t, {
    actors: {
      employee: fullEmployeeActor,
      "no-export": noExportActor,
      "no-download": noDownloadActor,
    },
    listEmployees(input) {
      return employeePage(
        (input.filters as { organizationCode?: string }).organizationCode ===
          "ORG-TOO-MANY",
      );
    },
  });
  const cases: Array<{
    name: string;
    token?: string;
    payload: Record<string, unknown>;
    status: number;
    code: string;
  }> = [
    {
      name: "missing actor",
      payload: exportPayload("ORG-SYNTHETIC"),
      status: 401,
      code: "actor_context_required",
    },
    {
      name: "missing export permission",
      token: "no-export",
      payload: exportPayload("ORG-SYNTHETIC"),
      status: 403,
      code: "permission_denied",
    },
    {
      name: "missing download permission",
      token: "no-download",
      payload: exportPayload("ORG-SYNTHETIC"),
      status: 403,
      code: "permission_denied",
    },
    {
      name: "empty anchor filter",
      token: "employee",
      payload: {
        filters: { employmentStatus: "active" },
        reasonCode: "uat_reconciliation",
      },
      status: 422,
      code: "export_filter_required",
    },
    {
      name: "missing reason",
      token: "employee",
      payload: { filters: { organizationCode: "ORG-SYNTHETIC" } },
      status: 400,
      code: "export_reason_code_required",
    },
    {
      name: "non-string reason",
      token: "employee",
      payload: {
        filters: { organizationCode: "ORG-SYNTHETIC" },
        reasonCode: 42,
      },
      status: 400,
      code: "export_reason_code_unsupported",
    },
    {
      name: "unsupported reason",
      token: "employee",
      payload: {
        filters: { organizationCode: "ORG-SYNTHETIC" },
        reasonCode: "free form private reason",
      },
      status: 400,
      code: "export_reason_code_unsupported",
    },
    {
      name: "client-selected fields",
      token: "employee",
      payload: {
        ...exportPayload("ORG-SYNTHETIC"),
        fields: ["rawPayload"],
      },
      status: 422,
      code: "export_field_denied",
    },
    {
      name: "client-provided rows",
      token: "employee",
      payload: {
        ...exportPayload("ORG-SYNTHETIC"),
        rows: [{ rawPayload: "private" }],
      },
      status: 400,
      code: "unsupported_filter",
    },
    {
      name: "over 100 rows",
      token: "employee",
      payload: exportPayload("ORG-TOO-MANY"),
      status: 422,
      code: "export_row_limit_exceeded",
    },
  ];

  for (const scenario of cases) {
    const response = await harness.app.inject({
      method: "POST",
      url: "/exports/employee-list",
      headers: scenario.token
        ? { authorization: `Bearer ${scenario.token}` }
        : {},
      payload: scenario.payload,
    });
    assert.equal(response.statusCode, scenario.status, scenario.name);
    assert.equal(response.json().code, scenario.code, scenario.name);
    assert.doesNotMatch(
      response.body,
      /ORG-SYNTHETIC|ORG-TOO-MANY|free form private reason|rawPayload/u,
      scenario.name,
    );
  }

  const deniedEvents = harness.auditEvents.filter(
    (event) => event.eventType === "bounded_export.denied",
  );
  assert.equal(deniedEvents.length, cases.length);
  assert.ok(
    deniedEvents.every(
      (event) =>
        event.policyDecision === "deny" &&
        event.exportSchemaVersion === "p2list_export_v1",
    ),
  );
  assert.doesNotMatch(
    JSON.stringify(deniedEvents),
    /ORG-SYNTHETIC|ORG-TOO-MANY|free form private reason|rawPayload/u,
  );
});

test("lifecycle export requires a contract-approved anchor filter", async (t) => {
  const harness = await createHarness(t, {
    actors: { lifecycle: fullLifecycleActor },
    listLifecycleRequests() {
      return lifecyclePage(false);
    },
  });

  const response = await harness.app.inject({
    method: "POST",
    url: "/exports/lifecycle-request-list",
    headers: { authorization: "Bearer lifecycle" },
    payload: {
      filters: { q: "Synthetic", status: ["submitted"] },
      reasonCode: "authorized_case_support",
    },
  });

  assert.equal(response.statusCode, 422);
  assert.equal(
    response.headers["x-hrcore-correlation-id"],
    "export-correlation-1",
  );
  assert.equal(response.json().code, "export_filter_required");
});

async function createHarness(
  t: TestContext,
  options: {
    actors: Record<string, P2ListActorContext>;
    now?: () => Date;
    listEmployees?: (
      input: Parameters<P2ListReadModelRepository["listEmployeesForExport"]>[0],
    ) => ReturnType<P2ListReadModelRepository["listEmployeesForExport"]>;
    listLifecycleRequests?: (
      input: Parameters<
        P2ListReadModelRepository["listLifecycleRequestsForExport"]
      >[0],
    ) => ReturnType<
      P2ListReadModelRepository["listLifecycleRequestsForExport"]
    >;
  },
) {
  const auditEvents: P2ListExportAuditEvent[] = [];
  let correlationSequence = 0;
  const repository = {
    listEmployeesForExport:
      options.listEmployees ??
      (() => {
        throw new Error("Unexpected employee export.");
      }),
    listLifecycleRequestsForExport:
      options.listLifecycleRequests ??
      (() => {
        throw new Error("Unexpected lifecycle export.");
      }),
  } as unknown as P2ListReadModelRepository;
  const runtime: P2ListExportApiRuntime = {
    repository,
    provenance: {} as P2ListVerifiedSyntheticDataset,
    resolveActor(request) {
      const token = request.headers.authorization?.replace(/^Bearer /u, "");
      return token ? options.actors[token] : undefined;
    },
    emitAuditEvent(event) {
      auditEvents.push(event);
    },
    now: options.now ?? (() => occurredAt),
    createCorrelationId: () => `export-correlation-${++correlationSequence}`,
  };
  const app = await buildApp({ p2ListExportApi: runtime });
  t.after(async () => app.close());
  return { app, auditEvents };
}

function exportPayload(
  organizationCode: string,
  reasonCode: P2ListExportReasonCode = "uat_reconciliation",
) {
  return {
    filters: { organizationCode },
    reasonCode,
  };
}

function employeePage(hasMore: boolean) {
  return {
    items: [
      {
        personId: "person-001",
        employeeId: "EMP-001",
        displayName: "=Synthetic Employee",
        employmentStatus: "active" as const,
        organizationCode: "ORG-SYNTHETIC",
        positionCode: null,
        hireDate: "2026-01-01",
        terminationDate: null,
      },
    ],
    hasMore,
    appliedFilters: {
      organizationCode: hasMore ? "ORG-TOO-MANY" : "ORG-SYNTHETIC",
      asOf: "2026-07-27",
    },
  };
}

function lifecyclePage(hasMore: boolean) {
  return {
    items: [
      {
        transactionRequestId: "request-001",
        requestType: "transfer" as const,
        status: "submitted" as const,
        subjectPersonId: "person-001",
        subjectEmployeeId: "EMP-001",
        subjectDisplayName: "Synthetic Lifecycle Subject",
        organizationCode: "ORG-LIFECYCLE",
        decidedBy: null,
        requestedAt: "2026-07-01T00:00:00.000Z",
        effectiveDate: "2026-08-01",
      },
    ],
    hasMore,
    appliedFilters: {
      organizationCode: "ORG-LIFECYCLE",
    },
  };
}
