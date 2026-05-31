import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  type OktaMasteringProjection,
  type OktaMasteringProjectionResult,
} from "./okta-mastering-adapter.js";
import { ingestSyntheticWorkEmailWriteback } from "./writeback-ingest.js";

import {
  applyApprovedOnboardingTransactionRequest,
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  applyDueOnboardingTransactionRequests,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveEditableOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import {
  createOnboardingTransactionRequestFixture as createOnboardingTransactionRequestFixtureFromContract,
  parseOnboardingTransactionRequestInput as parseOnboardingTransactionRequestInputFromContract,
} from "./onboarding-transaction-request-contract.js";
import { saveOnboardingTransactionRequest as saveOnboardingTransactionRequestFromPersistence } from "./onboarding-transaction-request-persistence.js";
import { decideOnboardingTransactionRequest as decideOnboardingTransactionRequestFromApproval } from "./onboarding-transaction-request-approval.js";
import { applyApprovedOnboardingTransactionRequest as applyApprovedOnboardingTransactionRequestFromApply } from "./onboarding-transaction-request-apply.js";
import { applyDueOnboardingTransactionRequests as applyDueOnboardingTransactionRequestsFromWorker } from "./onboarding-transaction-request-worker.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
  readRepoFile,
} from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-A onboarding future-date apply worker skips future hires and applies due approved hires", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [suffix, effectiveDate] of [
      ["future", "2026-06-02"],
      ["due", "2026-06-01"],
    ] as const) {
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: `transaction-request-onboarding-${suffix}`,
          person: { id: `person-onboarding-${suffix}` },
          correlationId: `correlation-onboarding-${suffix}`,
          payload: {
            effectiveDate,
            employment: {
              id: `employment-onboarding-${suffix}`,
              employmentCode: `EMP-ONBOARDING-${suffix.toUpperCase()}`,
              startDate: effectiveDate,
            },
            assignment: {
              id: `assignment-onboarding-${suffix}`,
              assignmentCode: `ASN-ONBOARDING-${suffix.toUpperCase()}`,
              departmentReference: "department-people-ops",
              legalEntityReference: "legal-entity-jp-001",
              managerReference: "manager-001",
              positionCode: "position-engineer-001",
            },
          },
        }),
      );
      decideOnboardingTransactionRequest(db, {
        transactionRequestId: `transaction-request-onboarding-${suffix}`,
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-approval-${suffix}`,
      });
    }

    const result = applyDueOnboardingTransactionRequests(db, {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId: "correlation-onboarding-future-apply-worker-001",
      batchLimit: 10,
    });

    assert.deepEqual(result, {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 1,
      correlationId: "correlation-onboarding-future-apply-worker-001",
      results: [
        {
          transactionRequestId: "transaction-request-onboarding-due",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-due-apply",
        },
      ],
    });
    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:00:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-001",
        batchLimit: 10,
      }),
      {
        attempted: 1,
        applied: 1,
        failed: 0,
        skipped: 1,
        correlationId: "correlation-onboarding-future-apply-worker-001",
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-due",
            status: "applied",
            lifecycleEventId:
              "lifecycle-event-transaction-request-onboarding-due-apply",
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
          id: "transaction-request-onboarding-due",
          status_code: "completed",
        },
        {
          id: "transaction-request-onboarding-future",
          status_code: "approved",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT actor_id, action, correlation_id
              FROM audit_event
              WHERE action = 'mvp_a.onboarding.apply'
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          actor_id: "worker-onboarding-future-apply-001",
          action: "mvp_a.onboarding.apply",
          correlation_id: workerAttemptCorrelationId(
            "correlation-onboarding-future-apply-worker-001",
            "transaction-request-onboarding-due",
          ),
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT transaction_request_id, person_id, status_code, attempted_at, worker_id, correlation_id, retryable, error_message
              FROM onboarding_apply_job_attempt
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          transaction_request_id: "transaction-request-onboarding-due",
          person_id: "person-onboarding-due",
          status_code: "applied",
          attempted_at: "2026-06-01T00:00:00Z",
          worker_id: "worker-onboarding-future-apply-001",
          correlation_id: workerAttemptCorrelationId(
            "correlation-onboarding-future-apply-worker-001",
            "transaction-request-onboarding-due",
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

test("MVP-A onboarding future-date apply worker normalizes offset timestamps before due checks", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:30:00+02:00",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-offset-001",
      }),
      {
        attempted: 0,
        applied: 0,
        failed: 0,
        skipped: 1,
        correlationId: "correlation-onboarding-future-apply-worker-offset-001",
        results: [],
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "approved" },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker rejects semantically invalid timestamps", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const now of ["2026-13-40T00:00:00Z", "9999-12-31T23:59:59-23:59"]) {
      assert.throws(
        () =>
          applyDueOnboardingTransactionRequests(db, {
            now,
            workerId: "worker-onboarding-future-apply-001",
            correlationId: "correlation-onboarding-future-apply-worker-bad-now",
          }),
        OnboardingTransactionRequestValidationError,
      );
    }
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker prioritizes due hires before enforcing the candidate batch limit", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [suffix, effectiveDate, requestedAt] of [
      ["future-a", "2026-06-02", "2026-05-20T00:00:00Z"],
      ["future-b", "2026-06-03", "2026-05-20T00:01:00Z"],
      ["due", "2026-06-01", "2026-05-20T00:02:00Z"],
    ] as const) {
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: `transaction-request-onboarding-${suffix}`,
          person: { id: `person-onboarding-${suffix}` },
          requestedAt,
          correlationId: `correlation-onboarding-${suffix}`,
          payload: {
            effectiveDate,
            employment: {
              id: `employment-onboarding-${suffix}`,
              employmentCode: `EMP-ONBOARDING-${suffix.toUpperCase()}`,
              startDate: effectiveDate,
            },
            assignment: {
              id: `assignment-onboarding-${suffix}`,
              assignmentCode: `ASN-ONBOARDING-${suffix.toUpperCase()}`,
              departmentReference: "department-people-ops",
              legalEntityReference: "legal-entity-jp-001",
              managerReference: "manager-001",
              positionCode: "position-engineer-001",
            },
          },
        }),
      );
      decideOnboardingTransactionRequest(db, {
        transactionRequestId: `transaction-request-onboarding-${suffix}`,
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-approval-${suffix}`,
      });
    }

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:00:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-batch-001",
        batchLimit: 2,
      }),
      {
        attempted: 1,
        applied: 1,
        failed: 0,
        skipped: 1,
        correlationId: "correlation-onboarding-future-apply-worker-batch-001",
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-due",
            status: "applied",
            lifecycleEventId:
              "lifecycle-event-transaction-request-onboarding-due-apply",
          },
        ],
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-due'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "completed" },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker prioritizes due hires before malformed approved candidates", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [suffix, requestedAt] of [
      ["invalid-date", "2026-05-20T00:00:00Z"],
      ["malformed", "2026-05-20T00:01:00Z"],
      ["due", "2026-05-20T00:02:00Z"],
    ] as const) {
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: `transaction-request-onboarding-${suffix}`,
          person: { id: `person-onboarding-${suffix}` },
          requestedAt,
          correlationId: `correlation-onboarding-${suffix}`,
          payload: {
            employment: {
              id: `employment-onboarding-${suffix}`,
              employmentCode: `EMP-ONBOARDING-${suffix.toUpperCase()}`,
              startDate: "2026-06-01",
            },
            assignment: {
              id: `assignment-onboarding-${suffix}`,
              assignmentCode: `ASN-ONBOARDING-${suffix.toUpperCase()}`,
              departmentReference: "department-people-ops",
              legalEntityReference: "legal-entity-jp-001",
              managerReference: "manager-001",
              positionCode: "position-engineer-001",
            },
          },
        }),
      );
      decideOnboardingTransactionRequest(db, {
        transactionRequestId: `transaction-request-onboarding-${suffix}`,
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-approval-${suffix}`,
      });
    }
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = '{'
        WHERE id = 'transaction-request-onboarding-malformed'
      `,
    ).run();
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = json_set(payload_json, '$.effectiveDate', '1999-99-99')
        WHERE id = 'transaction-request-onboarding-invalid-date'
      `,
    ).run();

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:00:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId:
          "correlation-onboarding-future-apply-worker-malformed-order-001",
        batchLimit: 1,
      }),
      {
        attempted: 1,
        applied: 1,
        failed: 0,
        skipped: 0,
        correlationId:
          "correlation-onboarding-future-apply-worker-malformed-order-001",
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-due",
            status: "applied",
            lifecycleEventId:
              "lifecycle-event-transaction-request-onboarding-due-apply",
          },
        ],
      },
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT transaction_request_id, status_code
              FROM onboarding_apply_job_attempt
              ORDER BY transaction_request_id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          transaction_request_id: "transaction-request-onboarding-due",
          status_code: "applied",
        },
      ],
      "malformed and invalid-date rows must not consume the candidate limit ahead of due hires",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker encodes ambiguous correlation parts distinctly", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [transactionRequestId, workerCorrelationId, requestedAt] of [
      ["c", "a:b", "2026-05-20T00:00:00Z"],
      ["b:c", "a", "2026-05-20T00:01:00Z"],
    ] as const) {
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: transactionRequestId,
          person: { id: `person-onboarding-${transactionRequestId}` },
          requestedAt,
          correlationId: `correlation-onboarding-${transactionRequestId}`,
          payload: {
            employment: {
              id: `employment-onboarding-${transactionRequestId}`,
              employmentCode: `EMP-ONBOARDING-${transactionRequestId.toUpperCase()}`,
              startDate: "2026-06-01",
            },
            assignment: {
              id: `assignment-onboarding-${transactionRequestId}`,
              assignmentCode: `ASN-ONBOARDING-${transactionRequestId.toUpperCase()}`,
              departmentReference: "department-people-ops",
              legalEntityReference: "legal-entity-jp-001",
              managerReference: "manager-001",
              positionCode: "position-engineer-001",
            },
          },
        }),
      );
      decideOnboardingTransactionRequest(db, {
        transactionRequestId,
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-approval-${transactionRequestId}`,
      });
      assert.equal(
        applyDueOnboardingTransactionRequests(db, {
          now: "2026-06-01T00:00:00Z",
          workerId: "worker-onboarding-future-apply-001",
          correlationId: workerCorrelationId,
          batchLimit: 1,
        }).applied,
        1,
      );
    }

    const correlationIds = normalizeRows(
      db
        .prepare(
          `
            SELECT correlation_id
            FROM onboarding_apply_job_attempt
            ORDER BY attempted_at, transaction_request_id
          `,
        )
        .all() as Record<string, unknown>[],
    );
    assert.deepEqual(correlationIds, [
      { correlation_id: workerAttemptCorrelationId("a", "b:c") },
      { correlation_id: workerAttemptCorrelationId("a:b", "c") },
    ]);
    assert.notEqual(
      workerAttemptCorrelationId("a:b", "c"),
      workerAttemptCorrelationId("a", "b:c"),
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker returns persisted success on same-correlation replay", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    const input = {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId:
        "correlation-onboarding-future-apply-worker-success-replay-001",
    };
    assert.equal(applyDueOnboardingTransactionRequests(db, input).applied, 1);

    let usedCorrelationRangeRead = false;
    const replayDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          all(...values) {
            if (
              sql.includes("FROM onboarding_apply_job_attempt") &&
              sql.includes("ORDER BY attempted_at, transaction_request_id")
            ) {
              usedCorrelationRangeRead = true;
              assert.match(sql, /WHERE correlation_id >= \?/);
              assert.match(sql, /AND correlation_id < \?/);
              assert.equal(values.length, 2);
              assert.equal(typeof values[0], "string");
              assert.equal(values[1], `${values[0]}\uffff`);
            }

            return statement.all(...values) as Record<string, unknown>[];
          },
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            return statement.run(...values);
          },
        };
      },
    };

    assert.deepEqual(applyDueOnboardingTransactionRequests(replayDb, input), {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-success-replay-001",
      results: [
        {
          transactionRequestId: "transaction-request-onboarding-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-001-apply",
        },
      ],
    });
    assert.equal(usedCorrelationRangeRead, true);
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM onboarding_apply_job_attempt
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker does not apply new candidates on same-correlation replay", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const suffix of ["001", "002"] as const) {
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: `transaction-request-onboarding-run-replay-${suffix}`,
          person: { id: `person-onboarding-run-replay-${suffix}` },
          requestedAt: `2026-05-20T00:0${suffix === "001" ? "1" : "2"}:00Z`,
          correlationId: `correlation-onboarding-run-replay-${suffix}`,
          payload: {
            effectiveDate: "2026-06-01",
            employment: {
              id: `employment-onboarding-run-replay-${suffix}`,
              employmentCode: `EMP-ONBOARDING-RUN-REPLAY-${suffix}`,
              startDate: "2026-06-01",
            },
            assignment: {
              id: `assignment-onboarding-run-replay-${suffix}`,
              assignmentCode: `ASN-ONBOARDING-RUN-REPLAY-${suffix}`,
              departmentReference: "department-people-ops",
              legalEntityReference: "legal-entity-jp-001",
              managerReference: "manager-001",
              positionCode: "position-engineer-001",
            },
            workEmailExpectation: {
              contactPointId: `contact-point-onboarding-run-replay-${suffix}`,
              value: `onboarding.run-replay.${suffix}@example.invalid`,
            },
          },
        }),
      );
      decideOnboardingTransactionRequest(db, {
        transactionRequestId: `transaction-request-onboarding-run-replay-${suffix}`,
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-run-replay-approval-${suffix}`,
      });
    }

    const input = {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId:
        "correlation-onboarding-future-apply-worker-run-replay-001",
      batchLimit: 1,
    };

    assert.deepEqual(applyDueOnboardingTransactionRequests(db, input), {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-run-replay-001",
      results: [
        {
          transactionRequestId: "transaction-request-onboarding-run-replay-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-run-replay-001-apply",
        },
      ],
    });

    assert.deepEqual(applyDueOnboardingTransactionRequests(db, input), {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-run-replay-001",
      results: [
        {
          transactionRequestId: "transaction-request-onboarding-run-replay-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-run-replay-001-apply",
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
              WHERE id IN (
                'transaction-request-onboarding-run-replay-001',
                'transaction-request-onboarding-run-replay-002'
              )
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "transaction-request-onboarding-run-replay-001",
          status_code: "completed",
        },
        {
          id: "transaction-request-onboarding-run-replay-002",
          status_code: "approved",
        },
      ],
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM onboarding_apply_job_attempt
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker continues when attempts lack run marker", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const suffix of ["001", "002"] as const) {
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: `transaction-request-onboarding-orphan-attempt-${suffix}`,
          person: { id: `person-onboarding-orphan-attempt-${suffix}` },
          requestedAt: `2026-05-20T00:0${suffix === "001" ? "1" : "2"}:00Z`,
          correlationId: `correlation-onboarding-orphan-attempt-${suffix}`,
          payload: {
            effectiveDate: "2026-06-01",
            employment: {
              id: `employment-onboarding-orphan-attempt-${suffix}`,
              employmentCode: `EMP-ONBOARDING-ORPHAN-ATTEMPT-${suffix}`,
              startDate: "2026-06-01",
            },
            assignment: {
              id: `assignment-onboarding-orphan-attempt-${suffix}`,
              assignmentCode: `ASN-ONBOARDING-ORPHAN-ATTEMPT-${suffix}`,
              departmentReference: "department-people-ops",
              legalEntityReference: "legal-entity-jp-001",
              managerReference: "manager-001",
              positionCode: "position-engineer-001",
            },
            workEmailExpectation: {
              contactPointId: `contact-point-onboarding-orphan-attempt-${suffix}`,
              value: `onboarding.orphan-attempt.${suffix}@example.invalid`,
            },
          },
        }),
      );
      decideOnboardingTransactionRequest(db, {
        transactionRequestId: `transaction-request-onboarding-orphan-attempt-${suffix}`,
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-orphan-attempt-approval-${suffix}`,
      });
    }

    const input = {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId:
        "correlation-onboarding-future-apply-worker-orphan-attempt-001",
      batchLimit: 1,
    };

    assert.deepEqual(applyDueOnboardingTransactionRequests(db, input), {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-orphan-attempt-001",
      results: [
        {
          transactionRequestId:
            "transaction-request-onboarding-orphan-attempt-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-orphan-attempt-001-apply",
        },
      ],
    });
    db.prepare(
      `
        DELETE FROM onboarding_apply_job_run
        WHERE correlation_id = ?
      `,
    ).run(input.correlationId);

    assert.deepEqual(applyDueOnboardingTransactionRequests(db, input), {
      attempted: 2,
      applied: 2,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-orphan-attempt-001",
      results: [
        {
          transactionRequestId:
            "transaction-request-onboarding-orphan-attempt-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-orphan-attempt-001-apply",
        },
        {
          transactionRequestId:
            "transaction-request-onboarding-orphan-attempt-002",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-orphan-attempt-002-apply",
        },
      ],
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT attempted, applied, failed, skipped
              FROM onboarding_apply_job_run
              WHERE correlation_id = ?
            `,
          )
          .get(input.correlationId) as Record<string, unknown> | undefined,
      ),
      {
        attempted: 2,
        applied: 2,
        failed: 0,
        skipped: 0,
      },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker persists zero-attempt replay markers", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const input = {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId:
        "correlation-onboarding-future-apply-worker-empty-replay-001",
      batchLimit: 10,
    };

    assert.deepEqual(applyDueOnboardingTransactionRequests(db, input), {
      attempted: 0,
      applied: 0,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-empty-replay-001",
      results: [],
    });

    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        id: "transaction-request-onboarding-empty-replay",
        person: { id: "person-onboarding-empty-replay" },
        correlationId: "correlation-onboarding-empty-replay",
        payload: {
          effectiveDate: "2026-06-01",
          employment: {
            id: "employment-onboarding-empty-replay",
            employmentCode: "EMP-ONBOARDING-EMPTY-REPLAY",
            startDate: "2026-06-01",
          },
          assignment: {
            id: "assignment-onboarding-empty-replay",
            assignmentCode: "ASN-ONBOARDING-EMPTY-REPLAY",
            departmentReference: "department-people-ops",
            legalEntityReference: "legal-entity-jp-001",
            managerReference: "manager-001",
            positionCode: "position-engineer-001",
          },
        },
      }),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-empty-replay",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-empty-replay-approval",
    });

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        ...input,
        now: "2026-06-02T00:00:00Z",
      }),
      {
        attempted: 0,
        applied: 0,
        failed: 0,
        skipped: 0,
        correlationId:
          "correlation-onboarding-future-apply-worker-empty-replay-001",
        results: [],
      },
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT correlation_id, worker_id, started_at, effective_date, attempted, applied, failed, skipped
              FROM onboarding_apply_job_run
              WHERE correlation_id = 'correlation-onboarding-future-apply-worker-empty-replay-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        correlation_id:
          "correlation-onboarding-future-apply-worker-empty-replay-001",
        worker_id: "worker-onboarding-future-apply-001",
        started_at: "2026-06-01T00:00:00Z",
        effective_date: "2026-06-01",
        attempted: 0,
        applied: 0,
        failed: 0,
        skipped: 0,
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-empty-replay'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "approved" },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM onboarding_apply_job_attempt
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker replays non-ASCII worker correlations", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    const input = {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId:
        "correlation-onboarding-future-apply-worker-success-replay-\u00ff",
    };
    assert.equal(applyDueOnboardingTransactionRequests(db, input).applied, 1);

    assert.deepEqual(applyDueOnboardingTransactionRequests(db, input), {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId:
        "correlation-onboarding-future-apply-worker-success-replay-\u00ff",
      results: [
        {
          transactionRequestId: "transaction-request-onboarding-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-001-apply",
        },
      ],
    });
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker preserves success when attempt insert finds same-correlation failure", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    const workerCorrelationId =
      "correlation-onboarding-future-apply-worker-success-conflict-001";
    const attemptCorrelationId = workerAttemptCorrelationId(
      workerCorrelationId,
      "transaction-request-onboarding-001",
    );
    let conflictInserted = false;
    const conflictDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          all(...values) {
            return statement.all(...values) as Record<string, unknown>[];
          },
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            if (
              !conflictInserted &&
              sql.includes("INSERT INTO onboarding_apply_job_attempt") &&
              values[3] === "applied"
            ) {
              conflictInserted = true;
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
                "onboarding-apply-job-attempt-conflicting-retryable-001",
                "transaction-request-onboarding-001",
                "person-onboarding-001",
                "retryable_failure",
                "2026-06-01T00:00:01Z",
                "worker-onboarding-conflict-other-001",
                attemptCorrelationId,
                1,
                "synthetic concurrent retryable failure",
              );
            }

            return statement.run(...values);
          },
        };
      },
    };

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(conflictDb, {
        now: "2026-06-01T00:00:02Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: workerCorrelationId,
      }),
      {
        attempted: 1,
        applied: 1,
        failed: 0,
        skipped: 0,
        correlationId: workerCorrelationId,
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-001",
            status: "applied",
            lifecycleEventId:
              "lifecycle-event-transaction-request-onboarding-001-apply",
          },
        ],
      },
    );
    assert.equal(conflictInserted, true);
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code, attempted_at, worker_id, retryable, error_message
              FROM onboarding_apply_job_attempt
              WHERE correlation_id = ?
            `,
          )
          .get(attemptCorrelationId) as Record<string, unknown> | undefined,
      ),
      {
        status_code: "applied",
        attempted_at: "2026-06-01T00:00:02Z",
        worker_id: "worker-onboarding-future-apply-001",
        retryable: 0,
        error_message: null,
      },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker ignores already applied hires", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    applyApprovedOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-06-01T00:00:00Z",
      appliedBy: "worker-onboarding-future-apply-001",
      correlationId: workerAttemptCorrelationId(
        "correlation-onboarding-future-apply-worker-001",
        "transaction-request-onboarding-001",
      ),
    });

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:05:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-retry-001",
      }),
      {
        attempted: 0,
        applied: 0,
        failed: 0,
        skipped: 0,
        correlationId: "correlation-onboarding-future-apply-worker-retry-001",
        results: [],
      },
    );
    for (const tableName of ["employment", "assignment", "lifecycle_event"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get() as
            | Record<string, unknown>
            | undefined,
        ),
        { count: 1 },
      );
    }
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker records completed-state races as non-retryable", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    let completedAfterCandidateRead = false;
    const raceDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          all(...values) {
            const rows = statement.all(...values) as Record<string, unknown>[];
            if (
              !completedAfterCandidateRead &&
              sql.includes("FROM transaction_request") &&
              sql.includes("JOIN person")
            ) {
              completedAfterCandidateRead = true;
              applyApprovedOnboardingTransactionRequest(db, {
                transactionRequestId: "transaction-request-onboarding-001",
                appliedAt: "2026-06-01T00:00:00Z",
                appliedBy: "worker-onboarding-race-other-001",
                correlationId: "correlation-onboarding-race-other-apply-001",
              });
            }

            return rows;
          },
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            return statement.run(...values);
          },
        };
      },
    };

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(raceDb, {
        now: "2026-06-01T00:00:05Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-race-002",
      }),
      {
        attempted: 1,
        applied: 0,
        failed: 1,
        skipped: 0,
        correlationId: "correlation-onboarding-future-apply-worker-race-002",
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-001",
            status: "non_retryable_failure",
            errorMessage:
              "approved onboarding apply retry conflicts with the completed request",
          },
        ],
      },
    );
    assert.equal(completedAfterCandidateRead, true);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT status_code, retryable, error_message
              FROM onboarding_apply_job_attempt
              ORDER BY attempted_at
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          status_code: "non_retryable_failure",
          retryable: 0,
          error_message:
            "approved onboarding apply retry conflicts with the completed request",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker records retryable failure evidence and can retry", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    const auditFailureDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          all(...values) {
            return statement.all(...values) as Record<string, unknown>[];
          },
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            if (
              sql.includes("INSERT INTO audit_event") &&
              sql.includes("'mvp_a.onboarding.apply'")
            ) {
              throw new Error("synthetic retryable audit write failure");
            }

            return statement.run(...values);
          },
        };
      },
    };

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(auditFailureDb, {
        now: "2026-06-01T00:00:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-fail-001",
      }),
      {
        attempted: 1,
        applied: 0,
        failed: 1,
        skipped: 0,
        correlationId: "correlation-onboarding-future-apply-worker-fail-001",
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-001",
            status: "retryable_failure",
            errorMessage: "synthetic retryable audit write failure",
          },
        ],
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "approved" },
      "retryable worker failure must leave the request eligible for retry",
    );
    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:00:30Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-fail-001",
      }),
      {
        attempted: 1,
        applied: 0,
        failed: 1,
        skipped: 0,
        correlationId: "correlation-onboarding-future-apply-worker-fail-001",
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-001",
            status: "retryable_failure",
            errorMessage: "synthetic retryable audit write failure",
          },
        ],
      },
      "same-correlation retry must return the recorded attempt without a duplicate insert",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM onboarding_apply_job_attempt
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );

    assert.equal(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:01:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: "correlation-onboarding-future-apply-worker-retry-002",
      }).applied,
      1,
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT status_code, retryable
              FROM onboarding_apply_job_attempt
              ORDER BY attempted_at
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        { status_code: "retryable_failure", retryable: 1 },
        { status_code: "applied", retryable: 0 },
      ],
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker returns persisted evidence after a same-correlation insert conflict", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    const workerCorrelationId =
      "correlation-onboarding-future-apply-worker-race-001";
    const attemptCorrelationId = workerAttemptCorrelationId(
      workerCorrelationId,
      "transaction-request-onboarding-001",
    );
    let injectedAttemptConflict = false;
    const conflictDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          all(...values) {
            return statement.all(...values) as Record<string, unknown>[];
          },
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            if (
              !injectedAttemptConflict &&
              sql.includes("INSERT INTO onboarding_apply_job_attempt")
            ) {
              injectedAttemptConflict = true;
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
                "job-attempt-onboarding-race-001",
                "transaction-request-onboarding-001",
                "person-onboarding-001",
                "applied",
                "2026-06-01T00:00:00Z",
                "worker-onboarding-future-apply-001",
                attemptCorrelationId,
                0,
                null,
              );
            }

            return statement.run(...values);
          },
        };
      },
    };

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(conflictDb, {
        now: "2026-06-01T00:00:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId: workerCorrelationId,
      }),
      {
        attempted: 1,
        applied: 1,
        failed: 0,
        skipped: 0,
        correlationId: workerCorrelationId,
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-001",
            status: "applied",
            lifecycleEventId:
              "lifecycle-event-transaction-request-onboarding-001-apply",
          },
        ],
      },
    );
    assert.equal(injectedAttemptConflict, true);
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT id, correlation_id
              FROM onboarding_apply_job_attempt
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        id: "job-attempt-onboarding-race-001",
        correlation_id: attemptCorrelationId,
      },
      "worker result must come from the persisted attempt after a duplicate insert",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding future-date apply worker records non-retryable persisted payload failures", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = '{'
        WHERE id = 'transaction-request-onboarding-001'
      `,
    ).run();

    const result = applyDueOnboardingTransactionRequests(db, {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-onboarding-future-apply-001",
      correlationId:
        "correlation-onboarding-future-apply-worker-bad-payload-001",
    });

    assert.equal(result.failed, 1);
    assert.deepEqual(result.results, [
      {
        transactionRequestId: "transaction-request-onboarding-001",
        status: "non_retryable_failure",
        errorMessage: "persisted onboarding apply payload is malformed",
      },
    ]);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT status_code, retryable, error_message
              FROM onboarding_apply_job_attempt
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          status_code: "non_retryable_failure",
          retryable: 0,
          error_message: "persisted onboarding apply payload is malformed",
        },
      ],
    );
    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:05:00Z",
        workerId: "worker-onboarding-future-apply-001",
        correlationId:
          "correlation-onboarding-future-apply-worker-bad-payload-002",
      }),
      {
        attempted: 0,
        applied: 0,
        failed: 0,
        skipped: 0,
        correlationId:
          "correlation-onboarding-future-apply-worker-bad-payload-002",
        results: [],
      },
      "non-retryable payload failures must not be selected on later runs",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM onboarding_apply_job_attempt
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});
