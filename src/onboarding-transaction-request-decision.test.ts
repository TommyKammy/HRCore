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

test("MVP-A onboarding approval moves a submitted request to approved with audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );

    assert.deepEqual(
      decideOnboardingTransactionRequest(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        decision: "approve",
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: "correlation-onboarding-approval-001",
      }),
      {
        personId: "person-onboarding-001",
        transactionRequestId: "transaction-request-onboarding-001",
        statusCode: "approved",
        decision: "approve",
        auditEventId:
          "audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-approval-001",
        correlationId: "correlation-onboarding-approval-001",
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
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                actor_id,
                action,
                subject_table,
                subject_id,
                occurred_at,
                correlation_id
              FROM audit_event
              WHERE id = 'audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-approval-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        actor_id: "operator-people-ops-001",
        action: "mvp_a.onboarding.approve",
        subject_table: "transaction_request",
        subject_id: "transaction-request-onboarding-001",
        occurred_at: "2026-05-21T01:00:00Z",
        correlation_id: "correlation-onboarding-approval-001",
      },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding decision state machine supports return, reject, and cancel from submitted", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    for (const [decision, statusCode, action] of [
      ["return", "returned", "mvp_a.onboarding.return"],
      ["reject", "rejected", "mvp_a.onboarding.reject"],
      ["cancel", "cancelled", "mvp_a.onboarding.cancel"],
    ] as const) {
      const requestId = `transaction-request-onboarding-${decision}`;
      const personId = `person-onboarding-${decision}`;
      saveOnboardingTransactionRequest(
        db,
        createOnboardingTransactionRequestFixture({
          id: requestId,
          person: { id: personId },
          correlationId: `correlation-onboarding-${decision}`,
        }),
      );

      const result = decideOnboardingTransactionRequest(db, {
        transactionRequestId: requestId,
        decision,
        decidedAt: "2026-05-21T01:00:00Z",
        decidedBy: "operator-people-ops-001",
        correlationId: `correlation-onboarding-decision-${decision}`,
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

test("MVP-A onboarding decision retry is idempotent and does not duplicate audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    const decision = {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "reject" as const,
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-reject-001",
    };

    const firstResult = decideOnboardingTransactionRequest(db, decision);
    const retryResult = decideOnboardingTransactionRequest(db, decision);

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

test("MVP-A onboarding decisions reject non-hire transaction requests without mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES ('person-change-request-001', 'Change Request One', '2026-05-21T00:00:00Z')
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO transaction_request (
          id,
          person_id,
          request_type,
          status_code,
          requested_at,
          correlation_id,
          payload_version,
          payload_json
        )
        VALUES (
          'transaction-request-change-001',
          'person-change-request-001',
          'change',
          'submitted',
          '2026-05-21T00:00:00Z',
          'correlation-change-request-001',
          NULL,
          NULL
        )
      `,
    ).run();

    assert.throws(
      () =>
        decideOnboardingTransactionRequest(db, {
          transactionRequestId: "transaction-request-change-001",
          decision: "approve",
          decidedAt: "2026-05-21T01:00:00Z",
          decidedBy: "operator-people-ops-001",
          correlationId: "correlation-onboarding-approval-001",
        }),
      /onboarding transaction request decision target not found/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT request_type, status_code
              FROM transaction_request
              WHERE id = 'transaction-request-change-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { request_type: "change", status_code: "submitted" },
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

test("MVP-A onboarding decision retry re-reads authoritative state after a stale submitted write", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );

    const concurrentDecisionDb: OnboardingTransactionRequestDatabase = {
      exec(sql) {
        return db.exec(sql);
      },
      prepare(sql) {
        const statement = db.prepare(sql);
        if (
          sql.includes("UPDATE transaction_request") &&
          sql.includes("AND status_code = 'submitted'")
        ) {
          return {
            get(...values: (string | number | bigint | null)[]) {
              return statement.get(...values);
            },
            run(..._values: (string | number | bigint | null)[]) {
              db.prepare(
                `
                  UPDATE transaction_request
                  SET status_code = 'approved'
                  WHERE id = 'transaction-request-onboarding-001'
                    AND person_id = 'person-onboarding-001'
                    AND request_type = 'hire'
                    AND status_code = 'submitted'
                `,
              ).run();
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
                    'audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-approval-001',
                    'operator-people-ops-001',
                    'mvp_a.onboarding.approve',
                    'transaction_request',
                    'transaction-request-onboarding-001',
                    '2026-05-21T01:00:00Z',
                    'correlation-onboarding-approval-001',
                    'synthetic_poc'
                  )
                `,
              ).run();
              return { changes: 0 };
            },
          };
        }

        return statement;
      },
    };

    const result = decideOnboardingTransactionRequest(concurrentDecisionDb, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    assert.deepEqual(result, {
      personId: "person-onboarding-001",
      transactionRequestId: "transaction-request-onboarding-001",
      statusCode: "approved",
      decision: "approve",
      auditEventId:
        "audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-approval-001",
      correlationId: "correlation-onboarding-approval-001",
    });
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

test("MVP-A onboarding decision retry fails closed when audit evidence drifts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    const decision = {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "cancel" as const,
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-cancel-001",
    };
    decideOnboardingTransactionRequest(db, decision);

    assert.throws(
      () =>
        decideOnboardingTransactionRequest(db, {
          ...decision,
          decidedBy: "operator-people-ops-002",
        }),
      /onboarding transaction request repeated decision conflicts with existing audit evidence/,
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

test("MVP-A onboarding decision fails closed for illegal transitions without partial mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        statusCode: "draft",
      }),
    );

    assert.throws(
      () =>
        decideOnboardingTransactionRequest(db, {
          transactionRequestId: "transaction-request-onboarding-001",
          decision: "approve",
          decidedAt: "2026-05-21T01:00:00Z",
          decidedBy: "operator-people-ops-001",
          correlationId: "correlation-onboarding-approval-001",
        }),
      /onboarding transaction request approve decision requires submitted state/,
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
      { status_code: "draft" },
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
