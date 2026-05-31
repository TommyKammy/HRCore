import assert from "node:assert/strict";
import test from "node:test";

import {
  createTransferTransactionRequestFixture,
  parseTransferTransactionRequestInput,
  saveTransferTransactionRequest,
  TransferTransactionRequestValidationError,
} from "./transfer-transaction-request.js";
import {
  normalizeRow,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-B transfer transaction request input is parsed into a typed bounded contract", () => {
  const parsed = parseTransferTransactionRequestInput(
    createTransferTransactionRequestFixture(),
  );

  assert.equal(parsed.requestType, "transfer");
  assert.equal(parsed.statusCode, "submitted");
  assert.equal(parsed.person.id, "person-transfer-001");
  assert.equal(parsed.payload.effectiveDate, "2026-07-01");
  assert.equal(
    parsed.payload.currentAssignment.assignmentId,
    "assignment-current-transfer-001",
  );
  assert.equal(
    parsed.payload.targetAssignment.departmentReference,
    "department-product",
  );
  assert.equal(parsed.payload.transferReason.reasonCode, "team_change");
});

test("MVP-B transfer transaction request validation returns deterministic missing-field errors", () => {
  const fixture = createTransferTransactionRequestFixture();

  assert.throws(
    () =>
      parseTransferTransactionRequestInput({
        ...fixture,
        payload: {
          ...fixture.payload,
          targetAssignment: {
            ...fixture.payload.targetAssignment,
            managerReference: "",
          },
        },
      }),
    (error) =>
      error instanceof TransferTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.targetAssignment.managerReference must be a non-empty string",
  );
});

test("MVP-B transfer transaction request validation rejects invalid effective dates", () => {
  assert.throws(
    () =>
      parseTransferTransactionRequestInput(
        createTransferTransactionRequestFixture({
          payload: {
            effectiveDate: "2026-02-30",
          },
        }),
      ),
    (error) =>
      error instanceof TransferTransactionRequestValidationError &&
      error instanceof Error &&
      error.message === "payload.effectiveDate must be an ISO date",
  );
});

test("MVP-B transfer transaction request validation rejects unsupported later-wave and regulated fields", () => {
  for (const unsupportedPayload of [
    { concurrentAssignment: { assignmentId: "assignment-second" } },
    { secondment: { hostOrganizationReference: "org-host" } },
    { leaveArrangement: { leaveType: "childcare" } },
    { workArrangement: { reducedHours: true } },
    { employmentStatusExtension: { statusCode: "inactive" } },
    { regulatedData: { sensitivePersonalInformation: true } },
    { rawPayload: { provider: "live" } },
    { csvExport: { enabled: true } },
    { liveProviderPayload: { providerSubjectId: "00u-live" } },
  ] as const) {
    assert.throws(
      () =>
        parseTransferTransactionRequestInput(
          createTransferTransactionRequestFixture({
            payload: unsupportedPayload,
          }),
        ),
      /payload contains unsupported fields:/,
    );
  }
});

test("MVP-B transfer transaction request persistence stores only draft or submitted transfer payloads", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const result = saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );

    assert.deepEqual(result, {
      personId: "person-transfer-001",
      transactionRequestId: "transaction-request-transfer-001",
      statusCode: "submitted",
      correlationId: "correlation-transfer-001",
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
              WHERE transaction_request.id = 'transaction-request-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        person_id: "person-transfer-001",
        transaction_request_id: "transaction-request-transfer-001",
        request_type: "transfer",
        status_code: "submitted",
        payload_version: "mvp_b_transfer_v1",
        payload_json: JSON.stringify({
          tenantEnvironmentId: "repo_owned_synthetic_mvp_b_transfer",
          effectiveDate: "2026-07-01",
          currentAssignment: {
            assignmentId: "assignment-current-transfer-001",
            assignmentCode: "ASN-CURRENT-TRANSFER-001",
          },
          targetAssignment: {
            organizationReference: "organization-engineering",
            departmentReference: "department-product",
            managerReference: "manager-product-001",
            positionCode: "position-staff-engineer-001",
          },
          transferReason: {
            reasonCode: "team_change",
            note: "Synthetic bounded MVP-B transfer request",
          },
        }),
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM assignment").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 0 },
      "transfer request persistence must not apply assignment data early",
    );
  } finally {
    db.close();
  }
});
