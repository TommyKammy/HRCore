import assert from "node:assert/strict";
import test from "node:test";

import {
  createTerminationTransactionRequestFixture,
  decideTerminationTransactionRequest,
  saveTerminationTransactionRequest,
} from "./termination-transaction-request.js";
import {
  createTransferTransactionRequestFixture,
  saveTransferTransactionRequest,
} from "./transfer-transaction-request.js";
import {
  normalizeRow,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-C termination approval moves a submitted request to approved with audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );

    assert.deepEqual(
      decideTerminationTransactionRequest(db, {
        transactionRequestId: "transaction-request-termination-001",
        decision: "approve",
        decidedAt: "2026-08-15T01:00:00Z",
        decidedBy: "operator-people-ops-termination-001",
        correlationId: "correlation-termination-approval-001",
      }),
      {
        personId: "person-termination-001",
        transactionRequestId: "transaction-request-termination-001",
        statusCode: "approved",
        decision: "approve",
        auditEventId:
          "audit-event-transaction-request-termination-001-approve-correlation-termination-approval-001",
        correlationId: "correlation-termination-approval-001",
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
              WHERE transaction_request.id = 'transaction-request-termination-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "approved",
        action: "mvp_c.termination.approve",
      },
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination decision state machine supports return, reject, and cancel from submitted", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [decision, statusCode, action] of [
      ["return", "returned", "mvp_c.termination.return"],
      ["reject", "rejected", "mvp_c.termination.reject"],
      ["cancel", "cancelled", "mvp_c.termination.cancel"],
    ] as const) {
      const requestId = `transaction-request-termination-${decision}`;
      saveTerminationTransactionRequest(
        db,
        createTerminationTransactionRequestFixture({
          id: requestId,
          person: { id: `person-termination-${decision}` },
          correlationId: `correlation-termination-${decision}`,
        }),
      );

      const result = decideTerminationTransactionRequest(db, {
        transactionRequestId: requestId,
        decision,
        decidedAt: "2026-08-15T01:00:00Z",
        decidedBy: "operator-people-ops-termination-001",
        correlationId: `correlation-termination-decision-${decision}`,
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

test("MVP-C termination decision retry is idempotent by correlation id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    const decision = {
      transactionRequestId: "transaction-request-termination-001",
      decision: "reject" as const,
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-reject-001",
    };

    const firstResult = decideTerminationTransactionRequest(db, decision);
    const retryResult = decideTerminationTransactionRequest(db, decision);

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

test("MVP-C termination decisions reject non-termination targets without mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );

    assert.throws(
      () =>
        decideTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-transfer-001",
          decision: "approve",
          decidedAt: "2026-08-15T01:00:00Z",
          decidedBy: "operator-people-ops-termination-001",
          correlationId: "correlation-termination-approval-001",
        }),
      /termination transaction request decision target not found/,
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
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("MVP-C termination illegal transitions fail closed without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "approve",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-approval-001",
    });

    assert.throws(
      () =>
        decideTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          decision: "reject",
          decidedAt: "2026-08-15T02:00:00Z",
          decidedBy: "operator-people-ops-termination-001",
          correlationId: "correlation-termination-reject-after-approval-001",
        }),
      /termination transaction request reject decision requires submitted state/,
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

test("MVP-C termination decision retry fails closed when audit evidence drifts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
    );
    decideTerminationTransactionRequest(db, {
      transactionRequestId: "transaction-request-termination-001",
      decision: "cancel",
      decidedAt: "2026-08-15T01:00:00Z",
      decidedBy: "operator-people-ops-termination-001",
      correlationId: "correlation-termination-cancel-001",
    });
    db.prepare(
      `
        UPDATE audit_event
        SET action = 'mvp_c.termination.reject'
        WHERE id = 'audit-event-transaction-request-termination-001-cancel-correlation-termination-cancel-001'
      `,
    ).run();

    assert.throws(
      () =>
        decideTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          decision: "cancel",
          decidedAt: "2026-08-15T01:00:00Z",
          decidedBy: "operator-people-ops-termination-001",
          correlationId: "correlation-termination-cancel-001",
        }),
      /termination transaction request repeated decision conflicts with existing audit evidence/,
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
      { status_code: "cancelled" },
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

test("MVP-C termination decision rolls back status when audit evidence insert fails", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTerminationTransactionRequest(
      db,
      createTerminationTransactionRequestFixture(),
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
          'audit-event-transaction-request-termination-001-approve-correlation-termination-approval-001',
          'operator-conflicting-termination-001',
          'mvp_c.termination.reject',
          'transaction_request',
          'transaction-request-termination-001',
          '2026-08-15T00:30:00Z',
          'correlation-termination-approval-001',
          'synthetic_poc'
        )
      `,
    ).run();

    assert.throws(
      () =>
        decideTerminationTransactionRequest(db, {
          transactionRequestId: "transaction-request-termination-001",
          decision: "approve",
          decidedAt: "2026-08-15T01:00:00Z",
          decidedBy: "operator-people-ops-termination-001",
          correlationId: "correlation-termination-approval-001",
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
              WHERE id = 'transaction-request-termination-001'
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
