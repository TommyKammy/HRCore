import assert from "node:assert/strict";
import test from "node:test";

import { decideTerminationTransactionRequest } from "./termination-transaction-request.js";
import {
  createTransferTransactionRequestFixture,
  saveTransferTransactionRequest,
} from "./transfer-transaction-request.js";
import {
  normalizeRow,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";
import {
  assertTerminationDecisionAuditCount,
  assertTerminationRequestStatus,
  seedSubmittedTerminationRequest,
  terminationDecisionInput,
} from "./test-helpers/termination-decision.js";

test("MVP-C termination approval moves a submitted request to approved with audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    seedSubmittedTerminationRequest(db);

    assert.deepEqual(
      decideTerminationTransactionRequest(
        db,
        terminationDecisionInput("approve", {
          correlationId: "correlation-termination-approval-001",
        }),
      ),
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
      seedSubmittedTerminationRequest(db, { requestId });

      const result = decideTerminationTransactionRequest(
        db,
        terminationDecisionInput(decision, {
          transactionRequestId: requestId,
        }),
      );

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
    seedSubmittedTerminationRequest(db);
    const decision = terminationDecisionInput("reject", {
      correlationId: "correlation-termination-reject-001",
    });

    const firstResult = decideTerminationTransactionRequest(db, decision);
    const retryResult = decideTerminationTransactionRequest(db, decision);

    assert.deepEqual(retryResult, firstResult);
    assertTerminationDecisionAuditCount(db, 1);
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
        decideTerminationTransactionRequest(
          db,
          terminationDecisionInput("approve", {
            transactionRequestId: "transaction-request-transfer-001",
            correlationId: "correlation-termination-approval-001",
          }),
        ),
      /termination transaction request decision target not found/,
    );
    assertTerminationRequestStatus(
      db,
      "transaction-request-transfer-001",
      "submitted",
    );
    assertTerminationDecisionAuditCount(db, 0);
  } finally {
    db.close();
  }
});

test("MVP-C termination illegal transitions fail closed without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    seedSubmittedTerminationRequest(db);
    decideTerminationTransactionRequest(
      db,
      terminationDecisionInput("approve", {
        correlationId: "correlation-termination-approval-001",
      }),
    );

    assert.throws(
      () =>
        decideTerminationTransactionRequest(
          db,
          terminationDecisionInput("reject", {
            decidedAt: "2026-08-15T02:00:00Z",
            correlationId: "correlation-termination-reject-after-approval-001",
          }),
        ),
      /termination transaction request reject decision requires submitted state/,
    );
    assertTerminationRequestStatus(
      db,
      "transaction-request-termination-001",
      "approved",
    );
    assertTerminationDecisionAuditCount(db, 1);
  } finally {
    db.close();
  }
});

test("MVP-C termination decision retry fails closed when audit evidence drifts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    seedSubmittedTerminationRequest(db);
    decideTerminationTransactionRequest(
      db,
      terminationDecisionInput("cancel", {
        correlationId: "correlation-termination-cancel-001",
      }),
    );
    db.prepare(
      `
        UPDATE audit_event
        SET action = 'mvp_c.termination.reject'
        WHERE id = 'audit-event-transaction-request-termination-001-cancel-correlation-termination-cancel-001'
      `,
    ).run();

    assert.throws(
      () =>
        decideTerminationTransactionRequest(
          db,
          terminationDecisionInput("cancel", {
            correlationId: "correlation-termination-cancel-001",
          }),
        ),
      /termination transaction request repeated decision conflicts with existing audit evidence/,
    );
    assertTerminationRequestStatus(
      db,
      "transaction-request-termination-001",
      "cancelled",
    );
    assertTerminationDecisionAuditCount(db, 1);
  } finally {
    db.close();
  }
});

test("MVP-C termination decision rolls back status when audit evidence insert fails", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    seedSubmittedTerminationRequest(db);
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
        decideTerminationTransactionRequest(
          db,
          terminationDecisionInput("approve", {
            correlationId: "correlation-termination-approval-001",
          }),
        ),
      /UNIQUE constraint failed: audit_event.id/,
    );
    assertTerminationRequestStatus(
      db,
      "transaction-request-termination-001",
      "submitted",
      "status update must roll back when audit evidence cannot be recorded",
    );
    assertTerminationDecisionAuditCount(
      db,
      1,
      "failed decision must not append extra audit evidence",
    );
  } finally {
    db.close();
  }
});
