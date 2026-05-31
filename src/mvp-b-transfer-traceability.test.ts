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
    assert.equal(trace.oktaProjection?.profile.status, "projected");
    assert.equal(trace.oktaProjection?.groups.status, "projected");
    assert.equal(trace.remainingProductionReadinessGates.length, 4);
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
