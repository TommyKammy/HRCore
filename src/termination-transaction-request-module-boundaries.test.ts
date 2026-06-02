import assert from "node:assert/strict";
import test from "node:test";

import { terminationPayloadFields } from "./termination-transaction-request-fields.js";
import {
  createTerminationTransactionRequestFixture,
  parseTerminationPayload,
  TerminationTransactionRequestValidationError,
} from "./termination-transaction-request.js";
import { buildTerminationApplyLifecycleEventId } from "./termination-transaction-request-ids.js";
import {
  matchesTerminationRetry,
  type ExistingTerminationTransactionRequestRow,
} from "./termination-transaction-request-persistence-helpers.js";

test("MVP-C termination focused modules own contract field, id, and persistence helpers", () => {
  assert.deepEqual(terminationPayloadFields, [
    "tenantEnvironmentId",
    "effectiveDate",
    "currentEmployment",
    "currentAssignment",
    "terminationReason",
  ]);

  assert.throws(
    () =>
      parseTerminationPayload({
        ...createTerminationTransactionRequestFixture().payload,
        tenantEnvironmentId: "production",
      }),
    (error) =>
      error instanceof TerminationTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.tenantEnvironmentId must be repo_owned_synthetic_mvp_c_termination",
  );

  assert.equal(
    buildTerminationApplyLifecycleEventId({
      transactionRequestId: "transaction-request-termination-001",
      appliedAt: "2026-08-31T00:00:00Z",
      appliedBy: "operator-people-ops-termination-apply-001",
      correlationId: "correlation-termination-apply-001",
    }),
    "lifecycle-event-transaction-request-termination-001-apply",
  );

  const fixture = createTerminationTransactionRequestFixture();
  const payloadJson = JSON.stringify({
    tenantEnvironmentId: fixture.payload.tenantEnvironmentId,
    effectiveDate: fixture.payload.effectiveDate,
    currentEmployment: fixture.payload.currentEmployment,
    currentAssignment: fixture.payload.currentAssignment,
    terminationReason: fixture.payload.terminationReason,
  });
  const existing: ExistingTerminationTransactionRequestRow = {
    person_id: fixture.person.id,
    transaction_request_id: fixture.id,
    display_name: fixture.person.displayName,
    created_at: fixture.person.createdAt,
    request_type: fixture.requestType,
    status_code: fixture.statusCode,
    requested_at: fixture.requestedAt,
    correlation_id: fixture.correlationId,
    payload_version: fixture.payloadVersion,
    payload_json: payloadJson,
  };

  assert.equal(matchesTerminationRetry(existing, fixture, payloadJson), true);
});
