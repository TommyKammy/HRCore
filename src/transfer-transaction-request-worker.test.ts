import assert from "node:assert/strict";
import test from "node:test";

import {
  applyDueTransferTransactionRequests,
  createTransferTransactionRequestFixture,
  decideTransferTransactionRequest,
  saveTransferTransactionRequest,
} from "./transfer-transaction-request.js";
import {
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-B transfer future-date apply worker skips future transfers and applies due approved transfers", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [suffix, effectiveDate] of [
      ["future", "2026-07-02"],
      ["due", "2026-07-01"],
    ] as const) {
      saveTransferTransactionRequest(
        db,
        createTransferTransactionRequestFixture({
          id: `transaction-request-transfer-${suffix}`,
          person: { id: `person-transfer-${suffix}` },
          correlationId: `correlation-transfer-${suffix}`,
          payload: {
            effectiveDate,
            currentAssignment: {
              assignmentId: `assignment-current-transfer-${suffix}`,
              assignmentCode: `ASN-CURRENT-TRANSFER-${suffix.toUpperCase()}`,
            },
          },
        }),
      );
      seedOpenTransferAssignment(db, suffix);
      decideTransferTransactionRequest(db, {
        transactionRequestId: `transaction-request-transfer-${suffix}`,
        decision: "approve",
        decidedAt: "2026-06-15T01:00:00Z",
        decidedBy: "operator-people-ops-transfer-001",
        correlationId: `correlation-transfer-approval-${suffix}`,
      });
    }

    const result = applyDueTransferTransactionRequests(db, {
      now: "2026-07-01T00:00:00Z",
      workerId: "worker-transfer-future-apply-001",
      correlationId: "correlation-transfer-future-apply-worker-001",
      batchLimit: 10,
    });

    assert.deepEqual(result, {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 1,
      correlationId: "correlation-transfer-future-apply-worker-001",
      results: [
        {
          transactionRequestId: "transaction-request-transfer-due",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-transfer-due-apply",
        },
      ],
    });
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
          id: "transaction-request-transfer-due",
          status_code: "completed",
        },
        {
          id: "transaction-request-transfer-future",
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
              WHERE action = 'mvp_b.transfer.apply'
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          action: "mvp_b.transfer.apply",
          correlation_id: workerAttemptCorrelationId(
            "correlation-transfer-future-apply-worker-001",
            "transaction-request-transfer-due",
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
          transaction_request_id: "transaction-request-transfer-due",
          person_id: "person-transfer-due",
          status_code: "applied",
          worker_id: "worker-transfer-future-apply-001",
          correlation_id: workerAttemptCorrelationId(
            "correlation-transfer-future-apply-worker-001",
            "transaction-request-transfer-due",
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

test("MVP-B transfer future-date apply worker replays persisted correlation evidence idempotently", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture({
        payload: { effectiveDate: "2026-07-01" },
      }),
    );
    seedOpenTransferAssignment(db, "001");
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    const input = {
      now: "2026-07-01T00:00:00Z",
      workerId: "worker-transfer-future-apply-001",
      correlationId: "correlation-transfer-future-apply-worker-replay-001",
      batchLimit: 1,
    };
    const firstResult = applyDueTransferTransactionRequests(db, input);
    const replayResult = applyDueTransferTransactionRequests(db, input);

    assert.deepEqual(replayResult, firstResult);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM onboarding_apply_job_attempt
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [{ count: 1 }],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'mvp_b.transfer.apply'
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [{ count: 1 }],
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer future-date apply worker records retryable failures and preserves same-correlation evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture({
        payload: { effectiveDate: "2026-07-01" },
      }),
    );
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    const failedInput = {
      now: "2026-07-01T00:00:00Z",
      workerId: "worker-transfer-future-apply-001",
      correlationId: "correlation-transfer-future-apply-worker-retryable-001",
      batchLimit: 1,
    };
    const failedResult = applyDueTransferTransactionRequests(db, failedInput);

    assert.deepEqual(failedResult, {
      attempted: 1,
      applied: 0,
      failed: 1,
      skipped: 0,
      correlationId: "correlation-transfer-future-apply-worker-retryable-001",
      results: [
        {
          transactionRequestId: "transaction-request-transfer-001",
          status: "retryable_failure",
          errorMessage:
            "approved transfer apply requires the explicit current assignment",
        },
      ],
    });

    seedOpenTransferAssignment(db, "001");

    assert.deepEqual(
      applyDueTransferTransactionRequests(db, failedInput),
      failedResult,
      "same-correlation retry must replay persisted failure evidence",
    );
    assert.equal(
      applyDueTransferTransactionRequests(db, {
        ...failedInput,
        correlationId:
          "correlation-transfer-future-apply-worker-retryable-recovered-001",
      }).applied,
      1,
      "new worker correlation can retry after the missing prerequisite is fixed",
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
            "approved transfer apply requires the explicit current assignment",
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

test("MVP-B transfer future-date apply worker fails closed on malformed or unsupported persisted payloads", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const suffix of ["malformed", "unsupported"] as const) {
      saveTransferTransactionRequest(
        db,
        createTransferTransactionRequestFixture({
          id: `transaction-request-transfer-${suffix}`,
          person: { id: `person-transfer-${suffix}` },
          correlationId: `correlation-transfer-${suffix}`,
          payload: {
            effectiveDate: "2026-07-01",
            currentAssignment: {
              assignmentId: `assignment-current-transfer-${suffix}`,
              assignmentCode: `ASN-CURRENT-TRANSFER-${suffix.toUpperCase()}`,
            },
          },
        }),
      );
      seedOpenTransferAssignment(db, suffix);
      decideTransferTransactionRequest(db, {
        transactionRequestId: `transaction-request-transfer-${suffix}`,
        decision: "approve",
        decidedAt: "2026-06-15T01:00:00Z",
        decidedBy: "operator-people-ops-transfer-001",
        correlationId: `correlation-transfer-approval-${suffix}`,
      });
    }
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = '{'
        WHERE id = 'transaction-request-transfer-malformed'
      `,
    ).run();
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_version = 'mvp_a_onboarding_v1'
        WHERE id = 'transaction-request-transfer-unsupported'
      `,
    ).run();

    assert.deepEqual(
      applyDueTransferTransactionRequests(db, {
        now: "2026-07-01T00:00:00Z",
        workerId: "worker-transfer-future-apply-001",
        correlationId: "correlation-transfer-future-apply-worker-fail-001",
        batchLimit: 10,
      }),
      {
        attempted: 2,
        applied: 0,
        failed: 2,
        skipped: 0,
        correlationId: "correlation-transfer-future-apply-worker-fail-001",
        results: [
          {
            transactionRequestId: "transaction-request-transfer-malformed",
            status: "non_retryable_failure",
            errorMessage: "persisted transfer apply payload is malformed JSON",
          },
          {
            transactionRequestId: "transaction-request-transfer-unsupported",
            status: "non_retryable_failure",
            errorMessage:
              "persisted transfer apply payload version is unsupported",
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
          id: "transaction-request-transfer-malformed",
          status_code: "approved",
        },
        {
          id: "transaction-request-transfer-unsupported",
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
          error_message: "persisted transfer apply payload is malformed JSON",
        },
        {
          status_code: "non_retryable_failure",
          retryable: 0,
          error_message:
            "persisted transfer apply payload version is unsupported",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'mvp_b.transfer.apply'
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [{ count: 0 }],
      "failed transfer worker attempts must not leave apply audit evidence",
    );
  } finally {
    db.close();
  }
});

function seedOpenTransferAssignment(
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
    suffix === "001"
      ? "employment-transfer-001"
      : `employment-transfer-${suffix}`,
    suffix === "001" ? "person-transfer-001" : `person-transfer-${suffix}`,
    suffix === "001"
      ? "EMP-TRANSFER-001"
      : `EMP-TRANSFER-${suffix.toUpperCase()}`,
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
      VALUES (?, ?, ?, ?, 'department-platform', 'position-engineer-001', '2026-06-01', NULL)
    `,
  ).run(
    suffix === "001"
      ? "assignment-current-transfer-001"
      : `assignment-current-transfer-${suffix}`,
    suffix === "001" ? "person-transfer-001" : `person-transfer-${suffix}`,
    suffix === "001"
      ? "employment-transfer-001"
      : `employment-transfer-${suffix}`,
    suffix === "001"
      ? "ASN-CURRENT-TRANSFER-001"
      : `ASN-CURRENT-TRANSFER-${suffix.toUpperCase()}`,
  );
}
