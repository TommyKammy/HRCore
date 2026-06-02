import assert from "node:assert/strict";
import test from "node:test";

import { terminationPayloadFields } from "./termination-transaction-request-fields.js";
import {
  createTerminationTransactionRequestFixture,
  parseTerminationPayload,
  TerminationTransactionRequestValidationError,
} from "./termination-transaction-request.js";
import { buildTerminationApplyLifecycleEventId } from "./termination-transaction-request-ids.js";
import { parsePersistedTerminationApplyPayload } from "./termination-transaction-request-apply-reads.js";
import { buildCompletedTerminationApplyRetryResult } from "./termination-transaction-request-apply-retry.js";
import type { ExistingCompletedTerminationApplyRow } from "./termination-transaction-request-apply-types.js";
import { buildTerminationOktaProjectionEvidence } from "./termination-okta-projection-helpers.js";
import {
  buildTerminationApplyWorkerContext,
  classifyTerminationApplyWorkerFailure,
  shouldSkipFutureTerminationApplyCandidate,
} from "./termination-transaction-request-worker-boundaries.js";
import {
  matchesTerminationRetry,
  type ExistingTerminationTransactionRequestRow,
} from "./termination-transaction-request-persistence-helpers.js";

test("MVP-C termination focused modules own contract, retry, and helper boundaries", () => {
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
  assert.deepEqual(parsePersistedTerminationApplyPayload(existing), {
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
  });

  const completedApplyRow: ExistingCompletedTerminationApplyRow = {
    transaction_status_code: "completed",
    request_type: "terminate",
    person_id: fixture.person.id,
    payload_version: fixture.payloadVersion,
    payload_json: payloadJson,
    lifecycle_event_id:
      "lifecycle-event-transaction-request-termination-001-apply",
    lifecycle_event_type: "termination",
    lifecycle_effective_date: "2026-08-31",
    lifecycle_occurred_at: "2026-08-31T00:00:00Z",
    employment_id: "employment-termination-001",
    employment_code: "EMP-TERMINATION-001",
    employment_status_code: "terminated",
    employment_start_date: "2026-08-01",
    employment_end_date: "2026-08-31",
    assignment_id: "assignment-current-termination-001",
    assignment_employment_id: "employment-termination-001",
    assignment_code: "ASN-CURRENT-TERMINATION-001",
    assignment_start_date: "2026-08-01",
    assignment_end_date: "2026-08-31",
    audit_event_id:
      "audit-event-lifecycle-event-transaction-request-termination-001-apply-applied",
    audit_actor_id: "operator-people-ops-termination-apply-001",
    audit_action: "mvp_c.termination.apply",
    audit_subject_table: "lifecycle_event",
    audit_subject_id:
      "lifecycle-event-transaction-request-termination-001-apply",
    audit_occurred_at: "2026-08-31T00:00:00Z",
    audit_correlation_id: "correlation-termination-apply-001",
  };

  assert.deepEqual(
    buildCompletedTerminationApplyRetryResult(
      completedApplyRow,
      fixture.payload,
      {
        transactionRequestId: "transaction-request-termination-001",
        appliedAt: "2026-08-31T00:00:00Z",
        appliedBy: "operator-people-ops-termination-apply-001",
        correlationId: "correlation-termination-apply-001",
      },
      "lifecycle-event-transaction-request-termination-001-apply",
    ),
    {
      personId: "person-termination-001",
      employmentId: "employment-termination-001",
      assignmentId: "assignment-current-termination-001",
      transactionRequestId: "transaction-request-termination-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-termination-001-apply",
      statusCode: "completed",
      correlationId: "correlation-termination-apply-001",
    },
  );

  assert.deepEqual(
    buildTerminationApplyWorkerContext({
      now: "2026-08-31T23:59:59Z",
      workerId: "worker-termination-001",
      correlationId: "correlation-termination-worker-001",
    }),
    {
      worker: {
        now: "2026-08-31T23:59:59Z",
        workerId: "worker-termination-001",
        correlationId: "correlation-termination-worker-001",
        batchLimit: 100,
      },
      batchLimit: 100,
      effectiveDate: "2026-08-31",
    },
  );
  assert.equal(
    shouldSkipFutureTerminationApplyCandidate("2026-09-01", "2026-08-31"),
    true,
  );
  assert.deepEqual(
    classifyTerminationApplyWorkerFailure(
      new Error(
        "approved termination apply requires an open current assignment",
      ),
    ),
    {
      retryable: true,
      errorMessage:
        "approved termination apply requires an open current assignment",
    },
  );
  assert.deepEqual(
    buildTerminationOktaProjectionEvidence({
      transactionRequestId: "transaction-request-termination-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-termination-001-apply",
      applyCorrelationId: "correlation-termination-apply-001",
      profile: {
        status: "retryable_failure",
        result: {
          outcome: "retryable_failure",
          operation: "disable",
          employeeNumber: "EMP-TERMINATION-001",
          effectiveAt: "2026-08-31T00:00:00Z",
          errorCode: "mock_retryable_disable_timeout",
          message: "Synthetic retryable Okta disable timeout.",
          metadata: {
            provider: "okta",
            adapterMode: "mock",
            projectionKey:
              "okta:mock:disable:EMP-TERMINATION-001:2026-08-31T00%3A00%3A00Z",
            synthetic: true,
          },
        },
      },
      groups: {
        status: "skipped",
        skippedReason: "profile_projection_not_successful",
      },
    }),
    {
      provider: "okta",
      adapterMode: "mock",
      synthetic: true,
      authoritativeForRbac: false,
      transactionRequestId: "transaction-request-termination-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-termination-001-apply",
      applyCorrelationId: "correlation-termination-apply-001",
      profile: {
        status: "retryable_failure",
        result: {
          outcome: "retryable_failure",
          operation: "disable",
          employeeNumber: "EMP-TERMINATION-001",
          effectiveAt: "2026-08-31T00:00:00Z",
          errorCode: "mock_retryable_disable_timeout",
          message: "Synthetic retryable Okta disable timeout.",
          metadata: {
            provider: "okta",
            adapterMode: "mock",
            projectionKey:
              "okta:mock:disable:EMP-TERMINATION-001:2026-08-31T00%3A00%3A00Z",
            synthetic: true,
          },
        },
      },
      groups: {
        status: "skipped",
        skippedReason: "profile_projection_not_successful",
      },
    },
  );
});
