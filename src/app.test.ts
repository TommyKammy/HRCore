import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildApp } from "./app.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import { createOnboardingTransactionRequestFixture } from "./onboarding-transaction-request.js";
import { loadOpenApiContract } from "./openapi.js";
import { buildServerApp, resolvePort } from "./server.js";
import { createSyntheticWorkEmailWritebackFixture } from "./writeback-ingest.js";

const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

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
  assert.ok(contract.paths["/onboarding/new-hire"]);
  assert.ok(contract.paths["/onboarding/new-hire/transaction-requests"]);
  assert.ok(
    contract.paths[
      "/onboarding/new-hire/transaction-requests/{transactionRequestId}/decisions"
    ],
  );
  assert.ok(
    contract.paths["/onboarding/new-hire/transaction-requests/validate"],
  );
  assert.ok(contract.paths["/writeback-events/work-email"]);

  assert.equal(
    contract.paths["/onboarding/new-hire"].get.responses["200"].content[
      "text/html"
    ].schema.type,
    "string",
  );
  assert.equal(
    contract.paths["/onboarding/new-hire/transaction-requests"].post.requestBody
      .content["application/json"].schema.$ref,
    "#/components/schemas/OnboardingTransactionRequestInput",
  );
  const onboardingSaveOperation =
    contract.paths["/onboarding/new-hire/transaction-requests"].post;
  assert.equal(
    onboardingSaveOperation.responses["400"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ValidationErrorResponse",
  );
  assert.equal(
    onboardingSaveOperation.responses["409"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  assert.equal(
    onboardingSaveOperation.responses["503"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  const onboardingDecisionOperation =
    contract.paths[
      "/onboarding/new-hire/transaction-requests/{transactionRequestId}/decisions"
    ].post;
  assert.equal(
    onboardingDecisionOperation.requestBody.content["application/json"].schema
      .$ref,
    "#/components/schemas/OnboardingApprovalDecisionInput",
  );
  assert.equal(
    onboardingDecisionOperation.responses["200"].content["application/json"]
      .schema.$ref,
    "#/components/schemas/OnboardingApprovalDecisionResult",
  );
  assert.deepEqual(
    contract.components.schemas.OnboardingApprovalDecisionInput.properties
      .decision.enum,
    ["approve", "return", "reject", "cancel"],
  );
  assert.deepEqual(
    contract.components.schemas.OnboardingApprovalDecisionResult.properties
      .statusCode.enum,
    ["returned", "rejected", "cancelled", "approved"],
  );
  const onboardingRequestInput =
    contract.components.schemas.OnboardingTransactionRequestInput;
  assert.equal(onboardingRequestInput.properties.id.minLength, 1);
  assert.equal(
    onboardingRequestInput.properties.requestedAt.pattern,
    "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$",
  );
  assert.equal(onboardingRequestInput.properties.correlationId.minLength, 1);

  const onboardingPersonInput =
    contract.components.schemas.OnboardingPersonInput;
  assert.equal(onboardingPersonInput.properties.id.minLength, 1);
  assert.equal(onboardingPersonInput.properties.displayName.minLength, 1);
  assert.equal(
    onboardingPersonInput.properties.createdAt.pattern,
    "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$",
  );

  const onboardingPayload = contract.components.schemas.OnboardingPayload;
  assert.equal(
    onboardingPayload.properties.effectiveDate.pattern,
    "^\\d{4}-\\d{2}-\\d{2}$",
  );

  const onboardingEmploymentPayload =
    contract.components.schemas.OnboardingEmploymentPayload;
  assert.equal(onboardingEmploymentPayload.properties.id.minLength, 1);
  assert.equal(
    onboardingEmploymentPayload.properties.employmentCode.minLength,
    1,
  );
  assert.equal(
    onboardingEmploymentPayload.properties.startDate.pattern,
    "^\\d{4}-\\d{2}-\\d{2}$",
  );

  const onboardingAssignmentPayload =
    contract.components.schemas.OnboardingAssignmentPayload;
  assert.equal(onboardingAssignmentPayload.properties.id.minLength, 1);
  assert.equal(
    onboardingAssignmentPayload.properties.assignmentCode.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.departmentReference.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.legalEntityReference.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.managerReference.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.positionCode.minLength,
    1,
  );

  const onboardingWorkEmailExpectation =
    contract.components.schemas.OnboardingWorkEmailExpectation;
  assert.equal(
    onboardingWorkEmailExpectation.properties.contactPointId.minLength,
    1,
  );
  assert.equal(onboardingWorkEmailExpectation.properties.value.minLength, 1);
  assert.equal(
    onboardingWorkEmailExpectation.properties.value.pattern,
    "^[^@]+@.+$",
  );

  const writebackOperation =
    contract.paths["/writeback-events/work-email"].post;
  assert.equal(
    writebackOperation.responses["201"].description,
    "Synthetic writeback event was persisted and either applied or recorded as PoC conflict evidence.",
  );
  assert.equal(
    writebackOperation.responses["201"].content["application/json"].schema.$ref,
    "#/components/schemas/SyntheticWorkEmailWritebackResult",
  );
  assert.equal(
    writebackOperation.responses["400"].description,
    "Synthetic writeback input was malformed or violated local synthetic constraints.",
  );
  assert.equal(
    writebackOperation.responses["400"].content["application/json"].schema.$ref,
    "#/components/schemas/ErrorResponse",
  );

  const writebackResult =
    contract.components.schemas.SyntheticWorkEmailWritebackResult;
  assert.equal(writebackResult.properties.applied.type, "boolean");
  assert.equal(writebackResult.properties.applied.const, undefined);
  assert.equal(
    writebackResult.properties.conflict.$ref,
    "#/components/schemas/SyntheticWorkEmailConflictEvidence",
  );
  assert.deepEqual(
    contract.components.schemas.SyntheticWorkEmailConflictEvidence.required,
    [
      "conflictId",
      "conflictType",
      "currentContactValue",
      "attemptedProviderValue",
      "correlationId",
    ],
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

test("GET /onboarding/new-hire renders the MVP-A onboarding wizard surface", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/onboarding/new-hire",
  });

  assert.equal(response.statusCode, 200);
  assert.match(
    response.headers["content-type"] ?? "",
    /^text\/html; charset=utf-8/u,
  );
  assert.match(response.body, /id="mvp-a-onboarding-wizard"/u);
  assert.match(response.body, /name="person.displayName"/u);
  assert.match(response.body, /name="payload.effectiveDate"/u);
  assert.match(response.body, /name="payload.workEmailExpectation.value"/u);
  assert.doesNotMatch(response.body, /myNumber|transfer|termination|CSV/u);
});

test("POST /onboarding/new-hire/transaction-requests validates MVP-A request payloads through the shared contract", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const fixture = createOnboardingTransactionRequestFixture();
  const response = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/validate",
    payload: {
      ...fixture,
      payload: {
        ...fixture.payload,
        assignment: {
          ...fixture.payload.assignment,
          managerReference: "",
        },
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "payload.assignment.managerReference must be a non-empty string",
    validationErrors: [
      {
        message:
          "payload.assignment.managerReference must be a non-empty string",
      },
    ],
  });
});

test("POST /onboarding/new-hire/transaction-requests returns save-path validation details", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const fixture = createOnboardingTransactionRequestFixture();
  const response = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: {
      ...fixture,
      payload: {
        ...fixture.payload,
        effectiveDate: "2026-06-02",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "payload.employment.startDate must match payload.effectiveDate",
    validationErrors: [
      {
        message:
          "payload.employment.startDate must match payload.effectiveDate",
      },
    ],
  });
});

test("POST /onboarding/new-hire/transaction-requests reports unavailable and conflict states with error bodies", async (t) => {
  const unavailableApp = await buildApp();
  t.after(async () => {
    await unavailableApp.close();
  });

  const unavailableResponse = await unavailableApp.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture(),
  });

  assert.equal(unavailableResponse.statusCode, 503);
  assert.deepEqual(unavailableResponse.json(), {
    error: "onboarding transaction request database is not configured",
  });

  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture({
      statusCode: "draft",
    }),
  });
  assert.equal(firstResponse.statusCode, 201);

  const conflictResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture({
      id: "transaction-request-onboarding-conflict",
      correlationId: "correlation-onboarding-conflict",
      statusCode: "draft",
    }),
  });

  assert.equal(conflictResponse.statusCode, 409);
  assert.deepEqual(conflictResponse.json(), {
    error:
      "onboarding transaction request conflicts with existing local synthetic state",
  });
});

test("POST /onboarding/new-hire/transaction-requests saves draft edits and submit through the shared contract", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const draft = createOnboardingTransactionRequestFixture({
    statusCode: "draft",
  });
  const createResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: draft,
  });

  assert.equal(createResponse.statusCode, 201);
  assert.deepEqual(createResponse.json(), {
    personId: "person-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    statusCode: "draft",
    correlationId: "correlation-onboarding-001",
  });

  const draftRetryResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: draft,
  });

  assert.equal(draftRetryResponse.statusCode, 200);
  assert.deepEqual(draftRetryResponse.json(), createResponse.json());

  const editedDraft = createOnboardingTransactionRequestFixture({
    statusCode: "draft",
    person: {
      displayName: "MVP-A Onboarding Edited Hire",
    },
    payload: {
      assignment: {
        ...draft.payload.assignment,
        managerReference: "manager-edited-001",
      },
    },
  });
  const editResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: editedDraft,
  });

  assert.equal(editResponse.statusCode, 200);

  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: {
      ...editedDraft,
      statusCode: "submitted",
    },
  });

  assert.equal(submitResponse.statusCode, 201);
  assert.deepEqual(submitResponse.json(), {
    personId: "person-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    statusCode: "submitted",
    correlationId: "correlation-onboarding-001",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
          SELECT
            person.display_name,
            transaction_request.status_code,
            transaction_request.payload_json
          FROM transaction_request
          JOIN person ON person.id = transaction_request.person_id
          WHERE transaction_request.id = ?
        `,
        )
        .get("transaction-request-onboarding-001"),
    ),
    {
      display_name: "MVP-A Onboarding Edited Hire",
      status_code: "submitted",
      payload_json: JSON.stringify({
        effectiveDate: "2026-06-01",
        employment: {
          id: "employment-onboarding-001",
          employmentCode: "EMP-ONBOARDING-001",
          startDate: "2026-06-01",
        },
        assignment: {
          id: "assignment-onboarding-001",
          assignmentCode: "ASN-ONBOARDING-001",
          departmentReference: "department-people-ops",
          legalEntityReference: "legal-entity-jp-001",
          managerReference: "manager-edited-001",
          positionCode: "position-engineer-001",
        },
        workEmailExpectation: {
          contactPointId: "contact-point-onboarding-001",
          value: "onboarding.hire.001@example.invalid",
        },
      }),
    },
  );
});

test("POST /onboarding/new-hire/transaction-requests/:id/decisions applies approval decisions", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture(),
  });
  assert.equal(submitResponse.statusCode, 201);

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    },
  });

  assert.equal(decisionResponse.statusCode, 200);
  assert.deepEqual(decisionResponse.json(), {
    personId: "person-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    statusCode: "approved",
    decision: "approve",
    auditEventId:
      "audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-approval-001",
    correlationId: "correlation-onboarding-approval-001",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT transaction_request.status_code, audit_event.action
            FROM transaction_request
            JOIN audit_event ON audit_event.subject_id = transaction_request.id
            WHERE transaction_request.id = ?
          `,
        )
        .get("transaction-request-onboarding-001"),
    ),
    {
      status_code: "approved",
      action: "mvp_a.onboarding.approve",
    },
  );
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
