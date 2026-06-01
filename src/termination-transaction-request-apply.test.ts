import assert from "node:assert/strict";
import test from "node:test";

import {
  applyApprovedTerminationTransactionRequest,
  createTerminationTransactionRequestFixture,
  decideTerminationTransactionRequest,
  saveTerminationTransactionRequest,
} from "./termination-transaction-request.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import type { SqlValue } from "./onboarding-transaction-request-types.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-C termination apply ends the referenced employment and assignment with deterministic evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    seedOpenTerminationEmploymentAndAssignment(db);
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    const applyInput = {
      transactionRequestId: "transaction-request-termination-001",
      appliedAt: "2026-08-15T02:00:00Z",
      appliedBy: "operator-people-ops-termination-apply-001",
      correlationId: "correlation-termination-apply-001",
    };
    const result = applyApprovedTerminationTransactionRequest(db, applyInput);
    const retryResult = applyApprovedTerminationTransactionRequest(
      db,
      applyInput,
    );

    assert.deepEqual(retryResult, result);
    assert.deepEqual(result, {
      personId: "person-termination-001",
      employmentId: "employment-termination-001",
      assignmentId: "assignment-current-termination-001",
      transactionRequestId: "transaction-request-termination-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-termination-001-apply",
      statusCode: "completed",
      correlationId: "correlation-termination-apply-001",
    });
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, status_code, start_date, end_date
              FROM employment
              WHERE person_id = 'person-termination-001'
              ORDER BY id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "employment-termination-001",
          status_code: "terminated",
          start_date: "2026-08-01",
          end_date: "2026-08-31",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, assignment_code, start_date, end_date
              FROM assignment
              WHERE person_id = 'person-termination-001'
              ORDER BY id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-current-termination-001",
          assignment_code: "ASN-CURRENT-TERMINATION-001",
          start_date: "2026-08-01",
          end_date: "2026-08-31",
        },
      ],
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                transaction_request.status_code,
                lifecycle_event.event_type,
                lifecycle_event.effective_date,
                audit_event.action,
                audit_event.subject_table,
                audit_event.subject_id,
                audit_event.correlation_id
              FROM transaction_request
              JOIN lifecycle_event
                ON lifecycle_event.transaction_request_id = transaction_request.id
              JOIN audit_event
                ON audit_event.subject_id = lifecycle_event.id
              WHERE transaction_request.id = 'transaction-request-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "completed",
        event_type: "termination",
        effective_date: "2026-08-31",
        action: "mvp_c.termination.apply",
        subject_table: "lifecycle_event",
        subject_id: "lifecycle-event-transaction-request-termination-001-apply",
        correlation_id: "correlation-termination-apply-001",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 2 },
      "idempotent termination apply must not duplicate decision or apply audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination apply rejects already-ended assignment without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    seedOpenTerminationEmploymentAndAssignment(db, {
      assignmentEndDate: "2026-08-20",
    });
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    assert.throws(
      () =>
        applyApprovedTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          appliedAt: "2026-08-15T02:00:00Z",
          appliedBy: "operator-people-ops-termination-apply-001",
          correlationId: "correlation-termination-apply-001",
        }),
      /approved termination apply requires an open current assignment/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code, end_date
              FROM employment
              WHERE id = 'employment-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "active",
        end_date: null,
      },
      "rejected termination apply must not end the current employment",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-termination-001'
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
              FROM lifecycle_event
              WHERE transaction_request_id = 'transaction-request-termination-001'
                AND event_type = 'termination'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected termination apply must not create lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "rejected termination apply must preserve only approval audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination apply rejects other open assignment for the current employment without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    seedOpenTerminationEmploymentAndAssignment(db);
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
          'assignment-other-open-termination-001',
          'person-termination-001',
          'employment-termination-001',
          'ASN-OTHER-OPEN-TERMINATION-001',
          'department-platform',
          'position-engineer-002',
          '2026-08-10',
          NULL
        )
      `,
    ).run();
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    assert.throws(
      () =>
        applyApprovedTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          appliedAt: "2026-08-15T02:00:00Z",
          appliedBy: "operator-people-ops-termination-apply-001",
          correlationId: "correlation-termination-apply-001",
        }),
      /approved termination apply requires no other assignment extending beyond the termination effective date for the current employment/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code, end_date
              FROM employment
              WHERE id = 'employment-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "active",
        end_date: null,
      },
      "rejected termination apply must not end employment with another open assignment",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, end_date
              FROM assignment
              WHERE employment_id = 'employment-termination-001'
              ORDER BY id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-current-termination-001",
          end_date: null,
        },
        {
          id: "assignment-other-open-termination-001",
          end_date: null,
        },
      ],
      "rejected termination apply must not close any assignment",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-termination-001'
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
              FROM lifecycle_event
              WHERE transaction_request_id = 'transaction-request-termination-001'
                AND event_type = 'termination'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected termination apply must not create lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "rejected termination apply must preserve only approval audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination apply rejects other finite assignment extending beyond the termination date without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    seedOpenTerminationEmploymentAndAssignment(db);
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
          'assignment-other-finite-termination-001',
          'person-termination-001',
          'employment-termination-001',
          'ASN-OTHER-FINITE-TERMINATION-001',
          'department-platform',
          'position-engineer-002',
          '2026-08-10',
          '2026-09-30'
        )
      `,
    ).run();
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    assert.throws(
      () =>
        applyApprovedTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          appliedAt: "2026-08-15T02:00:00Z",
          appliedBy: "operator-people-ops-termination-apply-001",
          correlationId: "correlation-termination-apply-001",
        }),
      /approved termination apply requires no other assignment extending beyond the termination effective date for the current employment/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code, end_date
              FROM employment
              WHERE id = 'employment-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "active",
        end_date: null,
      },
      "rejected termination apply must not end employment with a finite assignment extending beyond termination",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, end_date
              FROM assignment
              WHERE employment_id = 'employment-termination-001'
              ORDER BY id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-current-termination-001",
          end_date: null,
        },
        {
          id: "assignment-other-finite-termination-001",
          end_date: "2026-09-30",
        },
      ],
      "rejected termination apply must not close any assignment",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-termination-001'
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
              FROM lifecycle_event
              WHERE transaction_request_id = 'transaction-request-termination-001'
                AND event_type = 'termination'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected termination apply must not create lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "rejected termination apply must preserve only approval audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination apply rechecks sibling assignments at the assignment close boundary", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    seedOpenTerminationEmploymentAndAssignment(db);
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    let injectedSiblingAssignment = false;
    const concurrentAssignmentDb: OnboardingTransactionRequestDatabase = {
      exec(sql) {
        return db.exec(sql);
      },
      prepare(sql) {
        const statement = db.prepare(sql);
        if (
          sql.includes("UPDATE assignment") &&
          sql.includes("SET end_date = ?") &&
          sql.includes("AND assignment_code = ?")
        ) {
          return {
            get(...values: SqlValue[]) {
              return statement.get(...values);
            },
            run(...values: SqlValue[]) {
              if (!injectedSiblingAssignment) {
                injectedSiblingAssignment = true;
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
                      'assignment-concurrent-open-termination-001',
                      'person-termination-001',
                      'employment-termination-001',
                      'ASN-CONCURRENT-OPEN-TERMINATION-001',
                      'department-platform',
                      'position-engineer-002',
                      '2026-08-10',
                      NULL
                    )
                  `,
                ).run();
              }

              return statement.run(...values);
            },
          };
        }

        return statement;
      },
    };

    assert.throws(
      () =>
        applyApprovedTerminationTransactionRequest(concurrentAssignmentDb, {
          transactionRequestId: "transaction-request-termination-001",
          appliedAt: "2026-08-15T02:00:00Z",
          appliedBy: "operator-people-ops-termination-apply-001",
          correlationId: "correlation-termination-apply-001",
        }),
      /approved termination apply conflicts with the current assignment state/,
    );
    assert.equal(
      injectedSiblingAssignment,
      true,
      "the assignment close statement must be reached before the conflict is rejected",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, end_date
              FROM assignment
              WHERE employment_id = 'employment-termination-001'
              ORDER BY id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-current-termination-001",
          end_date: null,
        },
      ],
      "the assignment close boundary must roll back the injected conflict and preserve the current assignment",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code, end_date
              FROM employment
              WHERE id = 'employment-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "active",
        end_date: null,
      },
      "rejected termination apply must not end employment after a boundary conflict",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-termination-001'
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
              FROM lifecycle_event
              WHERE transaction_request_id = 'transaction-request-termination-001'
                AND event_type = 'termination'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected termination apply must not create lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "rejected termination apply must preserve only approval audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination apply retry fails closed when completed evidence drifts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    seedOpenTerminationEmploymentAndAssignment(db);
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });
    applyApprovedTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      appliedAt: "2026-08-15T02:00:00Z",
      appliedBy: "operator-people-ops-termination-apply-001",
      correlationId: "correlation-termination-apply-001",
    });
    db.prepare(
      `
        UPDATE audit_event
        SET action = 'mvp_c.termination.apply.drift'
        WHERE id = 'audit-event-lifecycle-event-transaction-request-termination-001-apply-applied'
      `,
    ).run();

    assert.throws(
      () =>
        applyApprovedTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          appliedAt: "2026-08-15T02:00:00Z",
          appliedBy: "operator-people-ops-termination-apply-001",
          correlationId: "correlation-termination-apply-001",
        }),
      /approved termination apply retry conflicts with the completed request/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "completed" },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 2 },
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination apply retry fails closed when completed start-date evidence drifts", async (t) => {
  for (const drift of [
    {
      name: "employment",
      updateSql: `
        UPDATE employment
        SET start_date = '2026-09-01'
        WHERE id = 'employment-termination-001'
      `,
    },
    {
      name: "assignment",
      updateSql: `
        UPDATE assignment
        SET start_date = '2026-09-01'
        WHERE id = 'assignment-current-termination-001'
      `,
    },
  ]) {
    await t.test(drift.name, async (t) => {
      const db = await openSchemaBackedDatabase(t);
      if (!db) return;

      try {
        saveTerminationTransactionRequest(
          db,
          createTerminationTransactionRequestFixture(),
        );
        seedOpenTerminationEmploymentAndAssignment(db);
        decideTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          decision: "approve",
          decidedAt: "2026-08-15T01:00:00Z",
          decidedBy: "operator-people-ops-termination-001",
          correlationId: "correlation-termination-approval-001",
        });
        applyApprovedTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          appliedAt: "2026-08-15T02:00:00Z",
          appliedBy: "operator-people-ops-termination-apply-001",
          correlationId: "correlation-termination-apply-001",
        });
        db.prepare(drift.updateSql).run();

        assert.throws(
          () =>
            applyApprovedTerminationTransactionRequest(db, {
              transactionRequestId: "transaction-request-termination-001",
              appliedAt: "2026-08-15T02:00:00Z",
              appliedBy: "operator-people-ops-termination-apply-001",
              correlationId: "correlation-termination-apply-001",
            }),
          /approved termination apply retry conflicts with the completed request/,
        );
        assert.deepEqual(
          normalizeRow(
            db
              .prepare(
                `
                  SELECT status_code
                  FROM transaction_request
                  WHERE id = 'transaction-request-termination-001'
                `,
              )
              .get() as Record<string, unknown> | undefined,
          ),
          { status_code: "completed" },
        );
        assert.deepEqual(
          normalizeRow(
            db.prepare("SELECT count(*) AS count FROM audit_event").get() as
              | Record<string, unknown>
              | undefined,
          ),
          { count: 2 },
        );
      } finally {
        db.close();
      }
    });
  }
});

function seedOpenTerminationEmploymentAndAssignment(
  db: NonNullable<Awaited<ReturnType<typeof openSchemaBackedDatabase>>>,
  options: {
    employmentEndDate?: string | null;
    assignmentEndDate?: string | null;
  } = {},
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
        'employment-termination-001',
        'person-termination-001',
        'EMP-TERMINATION-001',
        'active',
        '2026-08-01',
        ?
      )
    `,
  ).run(options.employmentEndDate ?? null);
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
        'department-platform',
        'position-engineer-001',
        '2026-08-01',
        ?
      )
    `,
  ).run(options.assignmentEndDate ?? null);
}
