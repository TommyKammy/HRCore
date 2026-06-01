import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminationTransactionRequestFixture,
  parseTerminationPayload,
  parseTerminationTransactionRequestInput,
  saveTerminationTransactionRequest,
  TerminationTransactionRequestValidationError,
} from "./termination-transaction-request.js";
import {
  normalizeRow,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-C termination transaction request input is parsed into a typed bounded contract", () => {
  const parsed = parseTerminationTransactionRequestInput(
    createTerminationTransactionRequestFixture(),
  );

  assert.equal(parsed.requestType, "terminate");
  assert.equal(parsed.statusCode, "submitted");
  assert.equal(parsed.person.id, "person-termination-001");
  assert.equal(parsed.payload.effectiveDate, "2026-08-31");
  assert.equal(
    parsed.payload.currentEmployment.employmentId,
    "employment-termination-001",
  );
  assert.equal(
    parsed.payload.currentAssignment.assignmentId,
    "assignment-current-termination-001",
  );
  assert.equal(parsed.payload.terminationReason.reasonCode, "resignation");
});

test("MVP-C termination transaction request validation returns deterministic missing-field errors", () => {
  const fixture = createTerminationTransactionRequestFixture();

  assert.throws(
    () =>
      parseTerminationTransactionRequestInput({
        ...fixture,
        payload: {
          ...fixture.payload,
          currentEmployment: {
            ...fixture.payload.currentEmployment,
            employmentCode: "",
          },
        },
      }),
    (error) =>
      error instanceof TerminationTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.currentEmployment.employmentCode must be a non-empty string",
  );
});

test("MVP-C termination transaction request validation rejects invalid effective dates", () => {
  assert.throws(
    () =>
      parseTerminationTransactionRequestInput(
        createTerminationTransactionRequestFixture({
          payload: {
            effectiveDate: "2026-02-30",
          },
        }),
      ),
    (error) =>
      error instanceof TerminationTransactionRequestValidationError &&
      error instanceof Error &&
      error.message === "payload.effectiveDate must be an ISO date",
  );
});

test("MVP-C termination transaction request validation rejects unsupported later-wave and regulated fields", () => {
  for (const unsupportedPayload of [
    { hardDelete: true },
    { anonymization: { enabled: true } },
    { retentionJob: { jobId: "retention-job-001" } },
    { deletionJob: { jobId: "deletion-job-001" } },
    { legalHold: { holdId: "legal-hold-001" } },
    { payrollOffboarding: { provider: "payroll" } },
    { benefitOffboarding: { provider: "benefits" } },
    { assetReturn: { required: true } },
    { regulatedData: { sensitivePersonalInformation: true } },
    { rawPayload: { provider: "live" } },
    { csvExport: { enabled: true } },
    { liveProviderPayload: { providerSubjectId: "00u-live" } },
    { realEmployeeData: { employeeNumber: "employee-live-001" } },
  ] as const) {
    assert.throws(
      () =>
        parseTerminationTransactionRequestInput(
          createTerminationTransactionRequestFixture({
            payload: unsupportedPayload,
          }),
        ),
      /payload contains unsupported fields:/,
    );
  }
});

test("MVP-C termination payload parser remains bounded to repo-owned synthetic tenant environment", () => {
  const fixture = createTerminationTransactionRequestFixture();

  assert.throws(
    () =>
      parseTerminationPayload({
        ...fixture.payload,
        tenantEnvironmentId: "production",
      }),
    (error) =>
      error instanceof TerminationTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.tenantEnvironmentId must be repo_owned_synthetic_mvp_c_termination",
  );
});

test("MVP-C termination transaction request persistence stores only draft or submitted termination payloads", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const result = saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );

    assert.deepEqual(result, {
      personId: "person-termination-001",
      transactionRequestId: "transaction-request-termination-001",
      statusCode: "submitted",
      correlationId: "correlation-termination-001",
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                person.id AS person_id,
                transaction_request.id AS transaction_request_id,
                transaction_request.request_type,
                transaction_request.status_code,
                transaction_request.payload_version,
                transaction_request.payload_json
              FROM transaction_request
              JOIN person ON person.id = transaction_request.person_id
              WHERE transaction_request.id = 'transaction-request-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        person_id: "person-termination-001",
        transaction_request_id: "transaction-request-termination-001",
        request_type: "terminate",
        status_code: "submitted",
        payload_version: "mvp_c_termination_v1",
        payload_json: JSON.stringify({
          tenantEnvironmentId: "repo_owned_synthetic_mvp_c_termination",
          effectiveDate: "2026-08-31",
          currentEmployment: {
            employmentId: "employment-termination-001",
            employmentCode: "EMP-TERMINATION-001",
          },
          currentAssignment: {
            assignmentId: "assignment-current-termination-001",
            assignmentCode: "ASN-CURRENT-TERMINATION-001",
          },
          terminationReason: {
            reasonCode: "resignation",
            note: "Synthetic bounded MVP-C termination request",
          },
        }),
      },
    );
  } finally {
    db.close();
  }
});
