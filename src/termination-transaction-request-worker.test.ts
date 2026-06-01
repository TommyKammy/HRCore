import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDueTerminationTransactionRequests,
  createTerminationTransactionRequestFixture,
  decideTerminationTransactionRequest,
  saveTerminationTransactionRequest,
} from "./termination-transaction-request.js";
import {
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-C termination future-date apply worker skips future terminations and applies due approved terminations", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [suffix, effectiveDate] of [
      ["future", "2026-08-02"],
      ["due", "2026-08-01"],
    ] as const) {
      saveTerminationTransactionRequest(
        db,
        createTerminationTransactionRequestFixture({
          id: `transaction-request-termination-${suffix}`,
          person: { id: `person-termination-${suffix}` },
          correlationId: `correlation-termination-${suffix}`,
          payload: {
            effectiveDate,
            currentEmployment: {
              employmentId: `employment-termination-${suffix}`,
              employmentCode: `EMP-TERMINATION-${suffix.toUpperCase()}`,
            },
            currentAssignment: {
              assignmentId: `assignment-current-termination-${suffix}`,
              assignmentCode: `ASN-CURRENT-TERMINATION-${suffix.toUpperCase()}`,
            },
          },
        }),
      );
      seedOpenTerminationEmployment(db, suffix);
      decideTerminationTransactionRequest(db, {
        transactionRequestId: `transaction-request-termination-${suffix}`,
        decision: "approve",
        decidedAt: "2026-07-15T01:00:00Z",
        decidedBy: "operator-people-ops-termination-001",
        correlationId: `correlation-termination-approval-${suffix}`,
      });
    }

    const input = {
      now: "2026-08-01T00:00:00Z",
      workerId: "worker-termination-future-apply-001",
      correlationId: "correlation-termination-future-apply-worker-001",
      batchLimit: 10,
    };
    const result = applyDueTerminationTransactionRequests(db, input);

    assert.deepEqual(result, {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 1,
      correlationId: "correlation-termination-future-apply-worker-001",
      results: [
        {
          transactionRequestId: "transaction-request-termination-due",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-termination-due-apply",
        },
      ],
    });
    assert.deepEqual(
      applyDueTerminationTransactionRequests(db, input),
      result,
      "same-correlation termination worker retry must replay persisted evidence",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, status_code
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "transaction-request-termination-due",
          status_code: "completed",
        },
        {
          id: "transaction-request-termination-future",
          status_code: "approved",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, correlation_id
              FROM audit_event
              WHERE action = 'mvp_c.termination.apply'
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          action: "mvp_c.termination.apply",
          correlation_id: workerAttemptCorrelationId(
            "correlation-termination-future-apply-worker-001",
            "transaction-request-termination-due",
          ),
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT transaction_request_id, person_id, status_code, worker_id, correlation_id, retryable, error_message
              FROM onboarding_apply_job_attempt
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          transaction_request_id: "transaction-request-termination-due",
          person_id: "person-termination-due",
          status_code: "applied",
          worker_id: "worker-termination-future-apply-001",
          correlation_id: workerAttemptCorrelationId(
            "correlation-termination-future-apply-worker-001",
            "transaction-request-termination-due",
          ),
          retryable: 0,
          error_message: null,
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination future-date apply worker records retryable failures and preserves same-correlation evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture({
        payload: { effectiveDate: "2026-08-01" },
      }),
    );
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-07-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    const failedInput = {
      now: "2026-08-01T00:00:00Z",
      workerId: "worker-termination-future-apply-001",
      correlationId:
        "correlation-termination-future-apply-worker-retryable-001",
      batchLimit: 1,
    };
    const failedResult = applyDueTerminationTransactionRequests(
      db,
      failedInput,
    );

    assert.deepEqual(failedResult, {
      attempted: 1,
      applied: 0,
      failed: 1,
      skipped: 0,
      correlationId:
        "correlation-termination-future-apply-worker-retryable-001",
      results: [
        {
          transactionRequestId: "transaction-request-termination-001",
          status: "retryable_failure",
          errorMessage:
            "approved termination apply requires the explicit current employment",
        },
      ],
    });

    seedOpenTerminationEmployment(db, "001");

    assert.deepEqual(
      applyDueTerminationTransactionRequests(db, failedInput),
      failedResult,
      "same-correlation retry must replay persisted termination failure evidence",
    );
    assert.equal(
      applyDueTerminationTransactionRequests(db, {
        ...failedInput,
        correlationId:
          "correlation-termination-future-apply-worker-retryable-recovered-001",
      }).applied,
      1,
      "new worker correlation can retry termination after the missing prerequisite is fixed",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT status_code, retryable, error_message
              FROM onboarding_apply_job_attempt
              ORDER BY retryable DESC, status_code
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          status_code: "retryable_failure",
          retryable: 1,
          error_message:
            "approved termination apply requires the explicit current employment",
        },
        {
          status_code: "applied",
          retryable: 0,
          error_message: null,
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination future-date apply worker fails closed on malformed or unsupported persisted payloads", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const suffix of ["malformed", "unsupported"] as const) {
      saveTerminationTransactionRequest(
        db,
        createTerminationTransactionRequestFixture({
          id: `transaction-request-termination-${suffix}`,
          person: { id: `person-termination-${suffix}` },
          correlationId: `correlation-termination-${suffix}`,
          payload: {
            effectiveDate: "2026-08-01",
            currentEmployment: {
              employmentId: `employment-termination-${suffix}`,
              employmentCode: `EMP-TERMINATION-${suffix.toUpperCase()}`,
            },
            currentAssignment: {
              assignmentId: `assignment-current-termination-${suffix}`,
              assignmentCode: `ASN-CURRENT-TERMINATION-${suffix.toUpperCase()}`,
            },
          },
        }),
      );
      seedOpenTerminationEmployment(db, suffix);
      decideTerminationTransactionRequest(db, {
        transactionRequestId: `transaction-request-termination-${suffix}`,
        decision: "approve",
        decidedAt: "2026-07-15T01:00:00Z",
        decidedBy: "operator-people-ops-termination-001",
        correlationId: `correlation-termination-approval-${suffix}`,
      });
    }
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = '{'
        WHERE id = 'transaction-request-termination-malformed'
      `,
    ).run();
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_version = 'mvp_a_onboarding_v1'
        WHERE id = 'transaction-request-termination-unsupported'
      `,
    ).run();

    assert.deepEqual(
      applyDueTerminationTransactionRequests(db, {
        now: "2026-08-01T00:00:00Z",
        workerId: "worker-termination-future-apply-001",
        correlationId: "correlation-termination-future-apply-worker-fail-001",
        batchLimit: 10,
      }),
      {
        attempted: 2,
        applied: 0,
        failed: 2,
        skipped: 0,
        correlationId: "correlation-termination-future-apply-worker-fail-001",
        results: [
          {
            transactionRequestId: "transaction-request-termination-malformed",
            status: "non_retryable_failure",
            errorMessage:
              "persisted termination apply payload is malformed JSON",
          },
          {
            transactionRequestId: "transaction-request-termination-unsupported",
            status: "non_retryable_failure",
            errorMessage:
              "persisted termination apply payload version is unsupported",
          },
        ],
      },
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, status_code
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "transaction-request-termination-malformed",
          status_code: "approved",
        },
        {
          id: "transaction-request-termination-unsupported",
          status_code: "approved",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT status_code, retryable, error_message
              FROM onboarding_apply_job_attempt
              ORDER BY transaction_request_id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          status_code: "non_retryable_failure",
          retryable: 0,
          error_message:
            "persisted termination apply payload is malformed JSON",
        },
        {
          status_code: "non_retryable_failure",
          retryable: 0,
          error_message:
            "persisted termination apply payload version is unsupported",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT status_code, end_date
              FROM employment
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          status_code: "active",
          end_date: null,
        },
        {
          status_code: "active",
          end_date: null,
        },
      ],
      "failed termination worker attempts must not mutate employment state",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'mvp_c.termination.apply'
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [{ count: 0 }],
      "failed termination worker attempts must not leave apply audit evidence",
    );
  } finally {
    db.close();
  }
});

function seedOpenTerminationEmployment(
  db: Awaited<ReturnType<typeof openSchemaBackedDatabase>>,
  suffix: string,
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
      VALUES (?, ?, ?, 'active', '2026-06-01', NULL)
    `,
  ).run(
    `employment-termination-${suffix}`,
    `person-termination-${suffix}`,
    `EMP-TERMINATION-${suffix.toUpperCase()}`,
  );
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
      VALUES (?, ?, ?, ?, 'department-people-ops', 'position-engineer-001', '2026-06-01', NULL)
    `,
  ).run(
    `assignment-current-termination-${suffix}`,
    `person-termination-${suffix}`,
    `employment-termination-${suffix}`,
    `ASN-CURRENT-TERMINATION-${suffix.toUpperCase()}`,
  );
}
