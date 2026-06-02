import assert from "node:assert/strict";
import test from "node:test";

import {
  applyApprovedTerminationTransactionRequestWithOktaProjection,
  applyDueTerminationTransactionRequests,
  createTerminationTransactionRequestFixture,
  decideTerminationTransactionRequest,
  MvpCTerminationCorrelationTraceError,
  saveTerminationTransactionRequest,
  verifyMvpCTerminationCorrelationTrace,
} from "./termination-transaction-request.js";
import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyJobAttemptId,
  buildOnboardingApplyLifecycleEventIdForRequest,
  buildOnboardingDecisionAuditEventId,
} from "./onboarding-transaction-request-ids.js";
import { openSchemaBackedDatabase } from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-C termination evidence is traceable from one root correlation id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rootCorrelationId = "correlation-termination-trace-001";
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture({
        correlationId: rootCorrelationId,
        payload: { effectiveDate: "2026-08-15" },
      }),
    );
    seedOpenTerminationEmployment(db);
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-01T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: rootCorrelationId,
    });
    const workerCorrelationId = `${rootCorrelationId}:future-date-worker`;
    const applyAttemptCorrelationId = workerAttemptCorrelationId(
      workerCorrelationId,
      "transaction-request-termination-001",
    );
    const workerResult = applyDueTerminationTransactionRequests(db, {
      now: "2026-08-14T23:30:00-02:00",
      workerId: "worker-termination-future-apply-001",
      correlationId: workerCorrelationId,
      batchLimit: 1,
    });
    const oktaProjection =
      await applyApprovedTerminationTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-termination-001",
        appliedAt: "2026-08-14T23:30:00-02:00",
        appliedBy: "worker-termination-future-apply-001",
        correlationId: applyAttemptCorrelationId,
        oktaAdapter: buildOktaMasteringAdapter({
          mode: "mock",
          initialUsers: [
            createSyntheticOktaUserFixture({
              externalId: "synthetic-okta-user-person-termination-001",
              employeeNumber: "EMP-TERMINATION-001",
              email: "mvp-c-termination-one@example.invalid",
              displayName: "MVP-C Termination One",
              givenName: "MVP-C",
              familyName: "Termination One",
              status: "active",
              departmentCode: "department-people-ops",
              managerExternalId: "manager-people-ops-001",
              effectiveAt: "2026-08-01T00:00:00Z",
            }),
          ],
        }),
      });

    const trace = verifyMvpCTerminationCorrelationTrace(db, {
      correlationId: rootCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireApplyJobAttempt: true,
      requireOktaProjection: true,
      oktaProjection: oktaProjection.oktaProjection,
    });

    assert.equal(workerResult.applied, 1);
    assert.deepEqual(trace.transactionRequest, {
      id: "transaction-request-termination-001",
      personId: "person-termination-001",
      requestType: "terminate",
      statusCode: "completed",
      correlationId: rootCorrelationId,
    });
    assert.deepEqual(
      trace.auditEvents.map((event) => event.action),
      ["mvp_c.termination.approve", "mvp_c.termination.apply"],
    );
    assert.deepEqual(trace.lifecycleEvent, {
      id: "lifecycle-event-transaction-request-termination-001-apply",
      transactionRequestId: "transaction-request-termination-001",
      personId: "person-termination-001",
      eventType: "termination",
      effectiveDate: "2026-08-15",
      occurredAt: "2026-08-14T23:30:00-02:00",
    });
    assert.equal(trace.endedEmployment?.statusCode, "terminated");
    assert.equal(trace.endedEmployment?.endDate, "2026-08-15");
    assert.equal(trace.endedAssignment?.endDate, "2026-08-15");
    assert.equal(trace.applyJobAttempts.length, 1);
    assert.ok(
      trace.oktaProjection?.profile.status === "projected" ||
        trace.oktaProjection?.profile.status === "already_projected",
    );
    assert.ok(
      trace.oktaProjection?.groups.status === "projected" ||
        trace.oktaProjection?.groups.status === "already_projected",
    );
    assert.deepEqual(trace.remainingProductionReadinessGates, [
      "#11 owner-acknowledged defer / production-like blocked",
      "#12 owner-acknowledged defer / production-like blocked",
      "#14 owner-acknowledged defer / production-like blocked",
      "Production audit immutability, WORM archive custody, raw/export access, backup/restore readiness, ops/DLQ replay, legal/privacy review, two-key approval, real-data readiness, and live Okta tenant readiness remain blocked.",
    ]);
    db.prepare(
      `
	        UPDATE transaction_request
	        SET status_code = ?
	        WHERE id = ?
	      `,
    ).run("submitted", "transaction-request-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: false,
        }),
      /MVP-C termination trace approval evidence requires approved or completed termination request state/,
    );
    db.prepare(
      `
		        UPDATE transaction_request
		        SET status_code = ?
		        WHERE id = ?
		      `,
    ).run("completed", "transaction-request-termination-001");
    const canonicalApprovalAuditEventId = buildOnboardingDecisionAuditEventId({
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-01T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: rootCorrelationId,
    });
    db.prepare(
      `
		        UPDATE audit_event
		        SET id = ?
		        WHERE id = ?
		      `,
    ).run(
      "audit-event-termination-trace-approval-noncanonical",
      canonicalApprovalAuditEventId,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: false,
        }),
      /MVP-C termination trace approval audit evidence must use the canonical approval audit id/,
    );
    db.prepare(
      `
		        UPDATE audit_event
		        SET id = ?
		        WHERE id = ?
		      `,
    ).run(
      canonicalApprovalAuditEventId,
      "audit-event-termination-trace-approval-noncanonical",
    );
    const canonicalLifecycleEventId =
      buildOnboardingApplyLifecycleEventIdForRequest(
        "transaction-request-termination-001",
      );
    const canonicalApplyAuditEventId = buildOnboardingApplyAuditEventId(
      canonicalLifecycleEventId,
    );
    const nonCanonicalLifecycleEventId =
      "lifecycle-event-termination-trace-noncanonical";
    db.prepare(
      `
	        UPDATE lifecycle_event
	        SET id = ?
	        WHERE id = ?
	      `,
    ).run(nonCanonicalLifecycleEventId, canonicalLifecycleEventId);
    db.prepare(
      `
	        UPDATE audit_event
	        SET subject_id = ?
	        WHERE id = ?
	      `,
    ).run(nonCanonicalLifecycleEventId, canonicalApplyAuditEventId);
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-C termination trace lifecycle evidence must use the canonical apply lifecycle id/,
    );
    db.prepare(
      `
	        UPDATE audit_event
	        SET subject_id = ?
	        WHERE id = ?
	      `,
    ).run(canonicalLifecycleEventId, canonicalApplyAuditEventId);
    db.prepare(
      `
	        UPDATE lifecycle_event
	        SET id = ?
	        WHERE id = ?
	      `,
    ).run(canonicalLifecycleEventId, nonCanonicalLifecycleEventId);
    db.prepare(
      `
	        UPDATE audit_event
	        SET id = ?
	        WHERE id = ?
	      `,
    ).run(
      "audit-event-termination-trace-noncanonical",
      canonicalApplyAuditEventId,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
        }),
      /MVP-C termination trace apply audit evidence must use the canonical apply audit id/,
    );
    db.prepare(
      `
	        UPDATE audit_event
	        SET id = ?
	        WHERE id = ?
	      `,
    ).run(
      canonicalApplyAuditEventId,
      "audit-event-termination-trace-noncanonical",
    );

    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            transactionRequestId: "transaction-request-termination-unrelated",
          },
        }),
      /MVP-C termination trace requires mock Okta disable projection evidence linked to the termination transaction and apply evidence/,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            profile: {
              ...oktaProjection.oktaProjection.profile,
              status: "retryable_failure",
            },
            groups: {
              status: "skipped",
              skippedReason: "profile_projection_not_successful",
            },
          },
        }),
      /MVP-C termination trace requires successful mock Okta disable projection evidence before closeout/,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            profile: {
              ...oktaProjection.oktaProjection.profile,
              status: "failed",
            },
            groups: {
              status: "skipped",
              skippedReason: "profile_projection_not_successful",
            },
          },
        }),
      /MVP-C termination trace requires successful mock Okta disable projection evidence before closeout/,
    );
    const oktaGroupsResult = oktaProjection.oktaProjection.groups.result;
    assert.ok(oktaGroupsResult);
    const oktaProfileResult = oktaProjection.oktaProjection.profile.result;
    if (oktaProfileResult.outcome !== "success") {
      throw new Error(
        "Expected successful mock Okta profile projection fixture",
      );
    }
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            profile: {
              ...oktaProjection.oktaProjection.profile,
              result: {
                ...oktaProfileResult,
                employeeNumber: "EMP-TERMINATION-UNRELATED",
              },
            },
          },
        }),
      /MVP-C termination trace requires mock Okta disable projection identity details linked to ended employment and apply evidence/,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            profile: {
              ...oktaProjection.oktaProjection.profile,
              result: {
                ...oktaProfileResult,
                operation: "update",
              },
            },
          },
        }),
      /MVP-C termination trace requires mock Okta disable projection identity details linked to ended employment and apply evidence/,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            groups: {
              ...oktaProjection.oktaProjection.groups,
              result: {
                ...oktaGroupsResult,
                groupKeys: ["DEPT-unrelated"],
              },
            },
          },
        }),
      /MVP-C termination trace requires mock Okta disable projection identity details linked to ended employment and apply evidence/,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: {
            ...oktaProjection.oktaProjection,
            groups: {
              ...oktaProjection.oktaProjection.groups,
              result: {
                ...oktaGroupsResult,
                effectiveAt: "2026-08-16T00:00:00Z",
              },
            },
          },
        }),
      /MVP-C termination trace requires mock Okta disable projection identity details linked to ended employment and apply evidence/,
    );
    db.prepare(
      `
        UPDATE audit_event
        SET occurred_at = ?
        WHERE action = 'mvp_c.termination.approve'
      `,
    ).run("2026-08-14T23:45:00-02:00");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace approval audit timing must not postdate apply evidence/,
    );
    db.prepare(
      `
        UPDATE audit_event
        SET occurred_at = ?
        WHERE action = 'mvp_c.termination.approve'
      `,
    ).run("2026-08-16T00:00:00Z");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace approval audit timing must not postdate apply evidence/,
    );
    db.prepare(
      `
        UPDATE audit_event
        SET occurred_at = ?
        WHERE action = 'mvp_c.termination.approve'
      `,
    ).run("2026-08-01T01:00:00Z");
    for (const invalidApprovalOccurredAt of [
      "2026-08-01",
      "2026-02-30T00:00:00Z",
    ]) {
      db.prepare(
        `
          UPDATE audit_event
          SET occurred_at = ?
          WHERE action = 'mvp_c.termination.approve'
        `,
      ).run(invalidApprovalOccurredAt);
      assertTerminationTraceThrows(
        () =>
          verifyMvpCTerminationCorrelationTrace(db, {
            correlationId: rootCorrelationId,
            requireApproval: true,
            requireApply: true,
            requireApplyJobAttempt: true,
            requireOktaProjection: true,
            oktaProjection: oktaProjection.oktaProjection,
          }),
        /MVP-C termination trace timing evidence must include a valid ISO timestamp/,
      );
    }
    db.prepare(
      `
        UPDATE audit_event
        SET occurred_at = ?
        WHERE action = 'mvp_c.termination.approve'
      `,
    ).run("2026-08-01T01:00:00Z");
    db.prepare(
      `
        UPDATE employment
        SET start_date = ?
        WHERE id = ?
      `,
    ).run("2026-09-01", "employment-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace ended employment evidence must not start after the termination effective date/,
    );
    db.prepare(
      `
        UPDATE employment
        SET start_date = ?
        WHERE id = ?
      `,
    ).run("2026-08-01", "employment-termination-001");
    db.prepare(
      `
        UPDATE assignment
        SET start_date = ?
        WHERE id = ?
      `,
    ).run("2026-09-01", "assignment-current-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace ended assignment evidence must not start after the termination effective date/,
    );
    db.prepare(
      `
        UPDATE assignment
        SET start_date = ?
        WHERE id = ?
      `,
    ).run("2026-08-01", "assignment-current-termination-001");
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "assignment-surviving-termination-001",
      "person-termination-001",
      "employment-termination-001",
      "ASN-SURVIVING-TERMINATION-001",
      "department-people-ops",
      "position-surviving-001",
      "2026-08-01",
      null,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace requires no sibling assignment extending beyond the termination effective date/,
    );
    db.prepare(
      `
        UPDATE assignment
        SET end_date = ?
        WHERE id = ?
      `,
    ).run("2026-08-16", "assignment-surviving-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace requires no sibling assignment extending beyond the termination effective date/,
    );
    db.prepare(
      `
        DELETE FROM assignment
        WHERE id = ?
      `,
    ).run("assignment-surviving-termination-001");
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET attempted_at = ?
        WHERE transaction_request_id = ?
      `,
    ).run("2026-08-15", "transaction-request-termination-001");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace timing evidence must include a valid ISO timestamp/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET attempted_at = ?
        WHERE transaction_request_id = ?
      `,
    ).run("2026-08-14T23:30:00-02:00", "transaction-request-termination-001");
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET worker_id = ?
        WHERE transaction_request_id = ?
      `,
    ).run(
      "worker-unrelated-termination-trace-001",
      "transaction-request-termination-001",
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace applied job attempt actor must match the apply audit evidence/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET worker_id = ?
        WHERE transaction_request_id = ?
      `,
    ).run(
      "worker-termination-future-apply-001",
      "transaction-request-termination-001",
    );
    const canonicalApplyJobAttemptId = buildOnboardingApplyJobAttemptId(
      "transaction-request-termination-001",
      applyAttemptCorrelationId,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET id = ?
        WHERE id = ?
      `,
    ).run(
      "onboarding-apply-job-attempt-noncanonical-termination-trace-001",
      canonicalApplyJobAttemptId,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace applied job attempt evidence must use the canonical applied job attempt id/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET id = ?
        WHERE id = ?
      `,
    ).run(
      canonicalApplyJobAttemptId,
      "onboarding-apply-job-attempt-noncanonical-termination-trace-001",
    );
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET retryable = ?, error_message = ?
        WHERE id = ?
      `,
    ).run(
      1,
      "retryable failure after applied status",
      canonicalApplyJobAttemptId,
    );
    db.exec("PRAGMA ignore_check_constraints = OFF");
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace applied job attempt success evidence must not carry retryable or error details/,
    );
    db.prepare(
      `
        UPDATE onboarding_apply_job_attempt
        SET retryable = ?, error_message = ?
        WHERE id = ?
      `,
    ).run(0, null, canonicalApplyJobAttemptId);
    db.prepare(
      `
        DELETE FROM onboarding_apply_job_attempt
        WHERE transaction_request_id = ?
      `,
    ).run("transaction-request-termination-001");
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
      "onboarding-apply-job-attempt-unrelated-termination-trace-001",
      "transaction-request-termination-001",
      "person-termination-001",
      "applied",
      "2026-08-15T00:01:00Z",
      "worker-unrelated-termination-trace-001",
      workerAttemptCorrelationId(
        "correlation-unrelated-termination-worker-retry",
        "transaction-request-termination-001",
      ),
      0,
      null,
    );
    assertTerminationTraceThrows(
      () =>
        verifyMvpCTerminationCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireApplyJobAttempt: true,
          requireOktaProjection: true,
          oktaProjection: oktaProjection.oktaProjection,
        }),
      /MVP-C termination trace requires an applied job attempt rooted in the termination correlation and linked to the apply audit evidence/,
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
