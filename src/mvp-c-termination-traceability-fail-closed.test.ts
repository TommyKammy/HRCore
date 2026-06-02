import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDueTerminationTransactionRequests,
  createTerminationTransactionRequestFixture,
  decideTerminationTransactionRequest,
  MvpCTerminationCorrelationTraceError,
  saveTerminationTransactionRequest,
  verifyMvpCTerminationCorrelationTrace,
} from "./termination-transaction-request.js";
import { openSchemaBackedDatabase } from "./test-helpers/database.js";

test("MVP-C termination traceability fails closed for missing required evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rootCorrelationId = "correlation-termination-trace-missing-001";

    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-C termination trace requires exactly one transaction_request for the supplied correlation id/,
    );

    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture({
        correlationId: rootCorrelationId,
        payload: { effectiveDate: "2026-08-15" },
      }),
    );
    seedOpenTerminationEmployment(db);

    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: false,
        }),
      /MVP-C termination trace requires approval audit evidence for the root correlation id/,
    );

    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-01T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: rootCorrelationId,
    });

    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-C termination trace requires completed termination request state for apply evidence/,
    );

    const workerResult = applyDueTerminationTransactionRequests(db, {
      now: "2026-08-14T23:30:00-02:00",
      workerId: "worker-termination-future-apply-001",
      correlationId: `${rootCorrelationId}:future-date-worker`,
      batchLimit: 1,
    });
    assert.equal(workerResult.applied, 1);

    db.prepare(
      `
        UPDATE employment
        SET status_code = ?, end_date = ?
        WHERE id = ?
      `,
    ).run("active", null, "employment-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-C termination trace requires ended employment evidence linked to the termination payload/,
    );

    db.prepare(
      `
        UPDATE employment
        SET status_code = ?, end_date = ?
        WHERE id = ?
      `,
    ).run("terminated", "2026-08-15", "employment-termination-001");
    db.prepare(
      `
        UPDATE assignment
        SET end_date = ?
        WHERE id = ?
      `,
    ).run(null, "assignment-current-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-C termination trace requires ended assignment evidence linked to the termination payload/,
    );

    db.prepare(
      `
        UPDATE assignment
        SET end_date = ?
        WHERE id = ?
      `,
    ).run("2026-08-15", "assignment-current-termination-001");
    db.prepare(
      `
        DELETE FROM onboarding_apply_job_attempt
        WHERE transaction_request_id = ?
      `,
    ).run("transaction-request-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
        }),
      /MVP-C termination trace requires an applied job attempt rooted in the termination correlation and linked to the apply audit evidence/,
    );

    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireOktaProjection: true,
        }),
      /MVP-C termination trace requires mock Okta disable projection evidence linked to the termination apply evidence/,
    );
  } finally {
    db.close();
  }
});

function seedOpenTerminationEmployment(
  db: Awaited<ReturnType<typeof openSchemaBackedDatabase>>,
): void {
  if (!db) return;

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
      VALUES ('employment-termination-001', 'person-termination-001', 'EMP-TERMINATION-001', 'active', '2026-08-01', NULL)
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
        'assignment-current-termination-001',
        'person-termination-001',
        'employment-termination-001',
        'ASN-CURRENT-TERMINATION-001',
        'department-people-ops',
        'position-engineer-001',
        '2026-08-01',
        NULL
      )
    `,
  ).run();
}

function assertTerminationTraceThrows(
  fn: () => unknown,
  expected: RegExp,
): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof MvpCTerminationCorrelationTraceError);
    assert.match(error.message, expected);
    return true;
  });
}
