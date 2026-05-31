import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import {
  applyDueTransferTransactionRequests,
  applyApprovedTransferTransactionRequestWithOktaProjection,
  createTransferTransactionRequestFixture,
  decideTransferTransactionRequest,
  saveTransferTransactionRequest,
  verifyMvpBTransferCorrelationTrace,
} from "./transfer-transaction-request.js";
import {
  normalizeRows,
  openSchemaBackedDatabase,
  readRepoFile,
} from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-B transfer evidence is traceable from one root correlation id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rootCorrelationId = "correlation-transfer-trace-001";
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture({
        correlationId: rootCorrelationId,
        payload: { effectiveDate: "2026-07-01" },
      }),
    );
    seedOpenTransferAssignment(db);
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: rootCorrelationId,
    });
    const workerCorrelationId = `${rootCorrelationId}:future-date-worker`;
    const workerResult = applyDueTransferTransactionRequests(db, {
      now: "2026-07-01T00:00:00Z",
      workerId: "worker-transfer-future-apply-001",
      correlationId: workerCorrelationId,
      batchLimit: 1,
    });
    const oktaProjection =
      await applyApprovedTransferTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-transfer-001",
        appliedAt: "2026-07-01T00:00:00Z",
        appliedBy: "worker-transfer-future-apply-001",
        correlationId: workerAttemptCorrelationId(
          workerCorrelationId,
          "transaction-request-transfer-001",
        ),
        oktaAdapter: buildOktaMasteringAdapter({
          mode: "mock",
          initialUsers: [
            createSyntheticOktaUserFixture({
              externalId: "synthetic-okta-user-person-transfer-001",
              employeeNumber: "EMP-TRANSFER-001",
              email: "mvp-b-transfer-one@example.invalid",
              displayName: "MVP-B Transfer One",
              givenName: "MVP-B",
              familyName: "Transfer One",
              status: "active",
              departmentCode: "department-platform",
              managerExternalId: "manager-platform-001",
              effectiveAt: "2026-06-01T00:00:00Z",
            }),
          ],
          initialGroups: [
            {
              externalId: "synthetic-okta-group-organization-engineering",
              groupKey: "ORG-organization-engineering",
              displayName: "Synthetic Organization Engineering",
              purpose: "poc_identity_lifecycle_membership",
              effectiveAt: "2026-06-01T00:00:00Z",
            },
            {
              externalId: "synthetic-okta-group-department-product",
              groupKey: "DEPT-department-product",
              displayName: "Synthetic Department Product",
              purpose: "poc_identity_lifecycle_membership",
              effectiveAt: "2026-06-01T00:00:00Z",
            },
          ],
        }),
      });

    const trace = verifyMvpBTransferCorrelationTrace(db, {
      correlationId: rootCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireApplyJobAttempt: true,
      requireOktaProjection: true,
      oktaProjection: oktaProjection.oktaProjection,
    });

    assert.equal(workerResult.applied, 1);
    assert.deepEqual(trace.transactionRequest, {
      id: "transaction-request-transfer-001",
      personId: "person-transfer-001",
      requestType: "transfer",
      statusCode: "completed",
      correlationId: rootCorrelationId,
    });
    assert.deepEqual(
      trace.auditEvents.map((event) => event.action),
      ["mvp_b.transfer.approve", "mvp_b.transfer.apply"],
    );
    assert.deepEqual(trace.lifecycleEvent, {
      id: "lifecycle-event-transaction-request-transfer-001-apply",
      transactionRequestId: "transaction-request-transfer-001",
      personId: "person-transfer-001",
      eventType: "assignment_change",
      effectiveDate: "2026-07-01",
      occurredAt: "2026-07-01T00:00:00Z",
    });
    assert.equal(trace.closedAssignment?.endDate, "2026-06-30");
    assert.equal(
      trace.targetAssignment?.id,
      "assignment-transaction-request-transfer-001-transfer-target",
    );
    assert.equal(trace.applyJobAttempts.length, 1);
    const applyJobAttempt = trace.applyJobAttempts[0];
    assert.ok(applyJobAttempt);
    assert.equal(trace.oktaProjection?.profile.status, "projected");
    assert.equal(trace.oktaProjection?.groups.status, "projected");
    assert.equal(trace.remainingProductionReadinessGates.length, 4);
    db.prepare(
      `
        INSERT INTO onboarding_apply_job_attempt (
          id,
          transaction_request_id,
          person_id,
          status_code,
          attempted_at,
          worker_id,
          correlation_id,
          retryable,
          error_message
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "onboarding-apply-job-attempt-unrelated-transfer-trace-001",
      "transaction-request-transfer-001",
      "person-transfer-001",
      "retryable_failure",
      "2026-07-01T00:01:00Z",
      "worker-unrelated-transfer-trace-001",
      workerAttemptCorrelationId(
        "correlation-unrelated-transfer-worker-retry",
        "transaction-request-transfer-001",
      ),
      1,
      "synthetic unrelated retry failure",
    );
    const mixedTrace = verifyMvpBTransferCorrelationTrace(db, {
      correlationId: rootCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireApplyJobAttempt: true,
      requireOktaProjection: true,
      oktaProjection: oktaProjection.oktaProjection,
    });
    assert.deepEqual(
      mixedTrace.applyJobAttempts.map((attempt) => attempt.id),
      [applyJobAttempt.id],
    );
    db.prepare(
      `
        UPDATE assignment
        SET end_date = ?
        WHERE id = ?
      `,
    ).run(
      "2026-08-31",
      "assignment-transaction-request-transfer-001-transfer-target",
    );
    const historicalTrace = verifyMvpBTransferCorrelationTrace(db, {
      correlationId: rootCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireApplyJobAttempt: true,
      requireOktaProjection: true,
      oktaProjection: oktaProjection.oktaProjection,
    });
    assert.equal(historicalTrace.targetAssignment?.endDate, "2026-08-31");
    db.prepare(
      `
        UPDATE assignment
        SET end_date = NULL
        WHERE id = ?
      `,
    ).run("assignment-transaction-request-transfer-001-transfer-target");
    db.prepare(
      `
        UPDATE transaction_request
        SET status_code = 'approved'
        WHERE id = ?
      `,
    ).run("transaction-request-transfer-001");
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace requires completed transfer request state for apply evidence/,
    );
    db.prepare(
      `
        UPDATE transaction_request
        SET status_code = 'completed'
        WHERE id = ?
      `,
    ).run("transaction-request-transfer-001");
    db.prepare(
      `
        UPDATE audit_event
        SET correlation_id = ?
        WHERE action = 'mvp_b.transfer.apply'
      `,
    ).run(
      workerAttemptCorrelationId(
        "correlation-unrelated-transfer-apply-audit",
        "transaction-request-transfer-001",
      ),
    );
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-B transfer trace apply audit evidence must be rooted in the transfer correlation/,
    );
    db.prepare(
      `
        UPDATE audit_event
        SET correlation_id = ?
        WHERE action = 'mvp_b.transfer.apply'
      `,
    ).run(applyJobAttempt.correlationId);
    db.prepare(
      `
        UPDATE lifecycle_event
        SET occurred_at = ?
        WHERE id = ?
      `,
    ).run(
      "2026-06-30T23:59:59Z",
      "lifecycle-event-transaction-request-transfer-001-apply",
    );
    db.prepare(
      `
        UPDATE audit_event
        SET occurred_at = ?
        WHERE action = 'mvp_b.transfer.apply'
      `,
    ).run("2026-06-30T23:59:59Z");
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET attempted_at = ?
        WHERE id = ?
      `,
    ).run("2026-07-01T00:01:00Z", applyJobAttempt.id);
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace apply timing must not predate the transfer effective date/,
    );
    db.prepare(
      `
        UPDATE lifecycle_event
        SET occurred_at = ?
        WHERE id = ?
      `,
    ).run(
      "2026-07-01T00:00:00Z",
      "lifecycle-event-transaction-request-transfer-001-apply",
    );
    db.prepare(
      `
        UPDATE audit_event
        SET occurred_at = ?
        WHERE action = 'mvp_b.transfer.apply'
      `,
    ).run("2026-07-01T00:00:00Z");
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET attempted_at = ?
        WHERE id = ?
      `,
    ).run("2026-06-30T23:59:59Z", applyJobAttempt.id);
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace applied job attempt timing must not predate the transfer effective date/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET attempted_at = ?
        WHERE id = ?
      `,
    ).run("2026-07-01T00:01:00Z", applyJobAttempt.id);
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace applied job attempt timing must match the apply audit evidence/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET attempted_at = ?
        WHERE id = ?
      `,
    ).run(applyJobAttempt.attemptedAt, applyJobAttempt.id);
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET correlation_id = ?
        WHERE id = ?
      `,
    ).run(
      workerAttemptCorrelationId(
        "correlation-unrelated-transfer-worker-tampered",
        "transaction-request-transfer-001",
      ),
      applyJobAttempt.id,
    );
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace requires an applied job attempt rooted in the transfer correlation and linked to the apply audit evidence/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET correlation_id = ?
        WHERE id = ?
      `,
    ).run(applyJobAttempt.correlationId, applyJobAttempt.id);
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
        }),
      /MVP-B transfer trace requires mock Okta projection evidence linked to the transfer apply evidence/,
    );

    db.prepare(
      `
        DELETE FROM audit_event
        WHERE action = 'mvp_b.transfer.apply'
      `,
    ).run();
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace requires apply audit evidence linked to the transfer lifecycle event/,
    );
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = ?
        WHERE id = ?
      `,
    ).run("{", "transaction-request-transfer-001");
    assert.throws(
      () =>
        verifyMvpBTransferCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-B transfer trace requires supported transfer payload evidence/,
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer trace closeout preserves production readiness defer wording", async () => {
  const closeout = await readRepoFile(
    "docs/mvp-b-transfer-traceability-closeout.md",
  );

  assert.match(closeout, /bounded non-production MVP-B transfer traceability/u);
  assert.match(closeout, /#11\/#12\/#14 remain owner-acknowledged defer/u);
  assert.doesNotMatch(closeout, /production-like-ready:\s*Go/u);
  assert.doesNotMatch(closeout, /production audit immutability is ready/u);
  assert.doesNotMatch(closeout, /live-provider ready/u);
});

function seedOpenTransferAssignment(
  db: NonNullable<Awaited<ReturnType<typeof openSchemaBackedDatabase>>>,
): void {
  db.prepare(
    `
      INSERT INTO employment (
        id,
        person_id,
        employment_code,
        status_code,
        start_date,
        end_date
      )
      VALUES (
        'employment-transfer-001',
        'person-transfer-001',
        'EMP-TRANSFER-001',
        'active',
        '2026-06-01',
        NULL
      )
    `,
  ).run();
  db.prepare(
    `
      INSERT INTO assignment (
        id,
        person_id,
        employment_id,
        assignment_code,
        organization_code,
        position_code,
        start_date,
        end_date
      )
      VALUES (
        'assignment-current-transfer-001',
        'person-transfer-001',
        'employment-transfer-001',
        'ASN-CURRENT-TRANSFER-001',
        'department-platform',
        'position-engineer-001',
        '2026-06-01',
        NULL
      )
    `,
  ).run();
}
