import assert from "node:assert/strict";
import test from "node:test";

import {
  applyApprovedTransferTransactionRequest,
  createTransferTransactionRequestFixture,
  decideTransferTransactionRequest,
  saveTransferTransactionRequest,
} from "./transfer-transaction-request.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-B transfer apply closes the current assignment and records deterministic assignment-change evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
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
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    const applyInput = {
      transactionRequestId: "transaction-request-transfer-001",
      appliedAt: "2026-06-15T02:00:00Z",
      appliedBy: "operator-people-ops-transfer-apply-001",
      correlationId: "correlation-transfer-apply-001",
    };
    const result = applyApprovedTransferTransactionRequest(db, applyInput);
    const retryResult = applyApprovedTransferTransactionRequest(db, applyInput);

    assert.deepEqual(retryResult, result);
    assert.deepEqual(result, {
      personId: "person-transfer-001",
      employmentId: "employment-transfer-001",
      closedAssignmentId: "assignment-current-transfer-001",
      targetAssignmentId:
        "assignment-transaction-request-transfer-001-transfer-target",
      transactionRequestId: "transaction-request-transfer-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-transfer-001-apply",
      statusCode: "completed",
      correlationId: "correlation-transfer-apply-001",
    });
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT
                id,
                assignment_code,
                organization_code,
                position_code,
                start_date,
                end_date
              FROM assignment
              WHERE person_id = 'person-transfer-001'
              ORDER BY start_date, id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-current-transfer-001",
          assignment_code: "ASN-CURRENT-TRANSFER-001",
          organization_code: "department-platform",
          position_code: "position-engineer-001",
          start_date: "2026-06-01",
          end_date: "2026-06-30",
        },
        {
          id: "assignment-transaction-request-transfer-001-transfer-target",
          assignment_code: "ASN-CURRENT-TRANSFER-001-XFER-20260701",
          organization_code: "organization-engineering",
          position_code: "position-staff-engineer-001",
          start_date: "2026-07-01",
          end_date: null,
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
              WHERE transaction_request.id = 'transaction-request-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "completed",
        event_type: "assignment_change",
        effective_date: "2026-07-01",
        action: "mvp_b.transfer.apply",
        subject_table: "lifecycle_event",
        subject_id: "lifecycle-event-transaction-request-transfer-001-apply",
        correlation_id: "correlation-transfer-apply-001",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 2 },
      "idempotent transfer apply must not duplicate decision or apply audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer apply fails closed when a future assignment would overlap the open target assignment", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
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
        VALUES
          (
            'assignment-current-transfer-001',
            'person-transfer-001',
            'employment-transfer-001',
            'ASN-CURRENT-TRANSFER-001',
            'department-platform',
            'position-engineer-001',
            '2026-06-01',
            NULL
          ),
          (
            'assignment-overlap-transfer-001',
            'person-transfer-001',
            'employment-transfer-001',
            'ASN-OVERLAP-TRANSFER-001',
            'department-shadow',
            'position-engineer-002',
            '2026-08-01',
            NULL
          )
      `,
    ).run();
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    assert.throws(
      () =>
        applyApprovedTransferTransactionRequest(db, {
          transactionRequestId: "transaction-request-transfer-001",
          appliedAt: "2026-06-15T02:00:00Z",
          appliedBy: "operator-people-ops-transfer-apply-001",
          correlationId: "correlation-transfer-apply-001",
        }),
      /approved transfer apply detected overlapping assignment effective dates/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-transfer-001'
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
              SELECT end_date
              FROM assignment
              WHERE id = 'assignment-current-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { end_date: null },
      "rejected transfer apply must not close the current assignment",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM assignment
              WHERE id = 'assignment-transaction-request-transfer-001-transfer-target'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected transfer apply must not create target assignment evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM lifecycle_event
              WHERE transaction_request_id = 'transaction-request-transfer-001'
                AND event_type = 'assignment_change'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected transfer apply must not create assignment-change lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "rejected transfer apply must preserve only the approval audit evidence",
    );
  } finally {
    db.close();
  }
});
