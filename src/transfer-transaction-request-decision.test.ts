import assert from "node:assert/strict";
import test from "node:test";

import {
  createTransferTransactionRequestFixture,
  decideTransferTransactionRequest,
  saveTransferTransactionRequest,
} from "./transfer-transaction-request.js";
import {
  normalizeRow,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-B transfer approval moves a submitted request to approved with audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );

    assert.deepEqual(
      decideTransferTransactionRequest(db, {
        transactionRequestId: "transaction-request-transfer-001",
        decision: "approve",
        decidedAt: "2026-06-15T01:00:00Z",
        decidedBy: "operator-people-ops-transfer-001",
        correlationId: "correlation-transfer-approval-001",
      }),
      {
        personId: "person-transfer-001",
        transactionRequestId: "transaction-request-transfer-001",
        statusCode: "approved",
        decision: "approve",
        auditEventId:
          "audit-event-transaction-request-transfer-001-approve-correlation-transfer-approval-001",
        correlationId: "correlation-transfer-approval-001",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT transaction_request.status_code, audit_event.action
              FROM transaction_request
              JOIN audit_event ON audit_event.subject_id = transaction_request.id
              WHERE transaction_request.id = 'transaction-request-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "approved",
        action: "mvp_b.transfer.approve",
      },
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer decision state machine supports return, reject, and cancel from submitted", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [decision, statusCode, action] of [
      ["return", "returned", "mvp_b.transfer.return"],
      ["reject", "rejected", "mvp_b.transfer.reject"],
      ["cancel", "cancelled", "mvp_b.transfer.cancel"],
    ] as const) {
      const requestId = `transaction-request-transfer-${decision}`;
      saveTransferTransactionRequest(
        db,
        createTransferTransactionRequestFixture({
          id: requestId,
          person: { id: `person-transfer-${decision}` },
          correlationId: `correlation-transfer-${decision}`,
        }),
      );

      const result = decideTransferTransactionRequest(db, {
        transactionRequestId: requestId,
        decision,
        decidedAt: "2026-06-15T01:00:00Z",
        decidedBy: "operator-people-ops-transfer-001",
        correlationId: `correlation-transfer-decision-${decision}`,
      });

      assert.equal(result.statusCode, statusCode);
      assert.deepEqual(
        normalizeRow(
          db
            .prepare(
              `
                SELECT transaction_request.status_code, audit_event.action
                FROM transaction_request
                JOIN audit_event ON audit_event.subject_id = transaction_request.id
                WHERE transaction_request.id = ?
              `,
            )
            .get(requestId) as Record<string, unknown> | undefined,
        ),
        { status_code: statusCode, action },
      );
    }
  } finally {
    db.close();
  }
});

test("MVP-B transfer decision retry is idempotent by correlation id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
    const decision = {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "reject" as const,
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-reject-001",
    };

    const firstResult = decideTransferTransactionRequest(db, decision);
    const retryResult = decideTransferTransactionRequest(db, decision);

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer illegal transitions fail closed without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    assert.throws(
      () =>
        decideTransferTransactionRequest(db, {
          transactionRequestId: "transaction-request-transfer-001",
          decision: "reject",
          decidedAt: "2026-06-15T02:00:00Z",
          decidedBy: "operator-people-ops-transfer-001",
          correlationId: "correlation-transfer-reject-after-approval-001",
        }),
      /transfer transaction request reject decision requires submitted state/,
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
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer decision rolls back status when audit evidence insert fails", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
    db.prepare(
      `
        INSERT INTO audit_event (
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id,
          poc_marker
        )
        VALUES (
          'audit-event-transaction-request-transfer-001-approve-correlation-transfer-approval-001',
          'operator-conflicting-transfer-001',
          'mvp_b.transfer.reject',
          'transaction_request',
          'transaction-request-transfer-001',
          '2026-06-15T00:30:00Z',
          'correlation-transfer-approval-001',
          'synthetic_poc'
        )
      `,
    ).run();

    assert.throws(
      () =>
        decideTransferTransactionRequest(db, {
          transactionRequestId: "transaction-request-transfer-001",
          decision: "approve",
          decidedAt: "2026-06-15T01:00:00Z",
          decidedBy: "operator-people-ops-transfer-001",
          correlationId: "correlation-transfer-approval-001",
        }),
      /UNIQUE constraint failed: audit_event.id/,
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
      { status_code: "submitted" },
      "status update must roll back when audit evidence cannot be recorded",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "failed decision must not append extra audit evidence",
    );
  } finally {
    db.close();
  }
});
