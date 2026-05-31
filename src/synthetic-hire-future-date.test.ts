import assert from "node:assert/strict";
import test from "node:test";

import {
  createSyntheticHireFixture,
  createSyntheticHireRequestFixture,
  applySyntheticFutureDateHireJob,
  applySyntheticHireRequest,
  saveSyntheticHire,
  saveSyntheticHireRequest,
  type SyntheticHireDatabase,
} from "./synthetic-hire.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

const hideFirstFutureDateApplyFailureEvidenceRead = (
  db: SyntheticHireDatabase,
): SyntheticHireDatabase => {
  let hideFirstFailureEvidenceRead = true;

  return {
    exec: db.exec.bind(db),
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        get(...values) {
          if (
            hideFirstFailureEvidenceRead &&
            sql.includes("FROM synthetic_future_date_apply_failure_evidence") &&
            sql.includes("WHERE job_id = ?")
          ) {
            hideFirstFailureEvidenceRead = false;
            return undefined;
          }

          return statement.get(...values);
        },
        run(...values) {
          return statement.run(...values);
        },
      };
    },
  };
};

const completeBeforeFutureDateFailureEvidenceRead = (
  db: SyntheticHireDatabase,
  apply: Parameters<typeof applySyntheticHireRequest>[1],
): SyntheticHireDatabase => {
  let completeBeforeObservedStateRead = true;

  return {
    exec: db.exec.bind(db),
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        get(...values) {
          if (
            completeBeforeObservedStateRead &&
            sql.includes("FROM transaction_request") &&
            sql.includes("lifecycle_event_count") &&
            sql.includes("status_code = 'submitted'")
          ) {
            completeBeforeObservedStateRead = false;
            applySyntheticHireRequest(db, apply);
          }

          return statement.get(...values);
        },
        run(...values) {
          return statement.run(...values);
        },
      };
    },
  };
};

test("synthetic future-date apply records retryable failure evidence after preconditions", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
      contactPoint: {
        createdAt: "2026-06-01T00:00:00Z",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);

    const result = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });

    assert.deepEqual(result, {
      outcome: "retryable_failure",
      failureEvidence: {
        id: "future-date-apply-failure-future-date-apply-job-001",
        jobId: "future-date-apply-job-001",
        transactionRequestId: "transaction-request-syn-hire-001",
        lifecycleEventId: "lifecycle-event-syn-hire-future-001",
        personId: "person-syn-hire-001",
        correlationId: "correlation-syn-hire-001",
        failureReason: "synthetic_post_precondition_apply_failure",
        retryable: true,
        observedAt: "2026-05-19T00:00:00Z",
        observedState: {
          transactionRequestStatusCode: "submitted",
          lifecycleEventCount: 0,
          employmentCount: 0,
          assignmentCount: 0,
          lifecycleAppliedAuditCount: 0,
        },
      },
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-syn-hire-001'
            `,
          )
          .get(),
      ),
      { status_code: "submitted" },
      "synthetic failure must leave the submitted request retryable",
    );
    for (const tableName of [
      "employment",
      "assignment",
      "contact_point",
      "lifecycle_event",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must stay clean after synthetic future-date failure`,
      );
    }
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, subject_table, subject_id, correlation_id
              FROM audit_event
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.future_date_apply_failed",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "operator-facing retry evidence must be correlated without applying lifecycle state",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply failure audit collision rolls back evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
    ).run(
      "future-date-apply-failure-future-date-apply-job-audit-collision",
      "synthetic-hr-operator",
      "poc.synthetic_hire.preexisting_audit_collision",
      "transaction_request",
      "transaction-request-syn-hire-001",
      "2026-05-19T00:00:00Z",
      "correlation-syn-hire-001",
      "synthetic_poc",
    );

    assert.throws(
      () =>
        applySyntheticFutureDateHireJob(db, {
          job: {
            id: "future-date-apply-job-audit-collision",
            correlationId: "correlation-syn-hire-001",
            observedAt: "2026-05-19T00:00:00Z",
            failAfterPreconditionsReason:
              "synthetic_post_precondition_apply_failure",
          },
          apply,
        }),
      /UNIQUE constraint failed: audit_event\.id/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT name
              FROM sqlite_master
              WHERE type = 'table'
                AND name = 'synthetic_future_date_apply_failure_evidence'
            `,
          )
          .get(),
      ),
      undefined,
      "audit collision must roll back synthetic failure evidence table creation",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 2 },
      "audit collision must not append retry failure audit evidence",
    );
    for (const tableName of [
      "employment",
      "assignment",
      "contact_point",
      "lifecycle_event",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must stay clean after failure-evidence rollback`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic future-date apply retry succeeds without duplicate lifecycle effects", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
      contactPoint: {
        createdAt: "2026-06-01T00:00:00Z",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });

    const retryResult = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001-retry",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:05:00Z",
      },
      apply,
    });
    const idempotentRetryResult = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001-retry",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:05:00Z",
      },
      apply,
    });

    assert.deepEqual(retryResult, {
      outcome: "applied",
      transactionRequestId: "transaction-request-syn-hire-001",
      lifecycleEventId: "lifecycle-event-syn-hire-future-001",
      personId: "person-syn-hire-001",
      statusCode: "completed",
      correlationId: "correlation-syn-hire-001",
    });
    assert.deepEqual(idempotentRetryResult, retryResult);
    for (const tableName of [
      "person",
      "transaction_request",
      "employment",
      "assignment",
      "contact_point",
      "lifecycle_event",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 1 },
        `${tableName} must not duplicate after future-date retry`,
      );
    }
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, subject_table, subject_id, correlation_id
              FROM audit_event
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.future_date_apply_failed",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
        {
          action: "poc.synthetic_hire.lifecycle_applied",
          subject_table: "lifecycle_event",
          subject_id: "lifecycle-event-syn-hire-future-001",
          correlation_id: "correlation-syn-hire-001",
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "retry must add only the apply audit and retain the single failure evidence row",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply retry fails closed on stale job correlation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    saveSyntheticHireRequest(db, request);

    assert.throws(
      () =>
        applySyntheticFutureDateHireJob(db, {
          job: {
            id: "future-date-apply-job-stale",
            correlationId: "correlation-syn-hire-stale",
            observedAt: "2026-05-19T00:00:00Z",
          },
          apply: {
            request,
            hire,
            lifecycleEvent: {
              id: "lifecycle-event-syn-hire-future-001",
              eventType: "hire",
              effectiveDate: "2026-06-01",
              occurredAt: "2026-05-19T00:00:00Z",
            },
          },
        }),
      /synthetic future-date apply job correlation must match the persisted request/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 1 },
      "stale retry must not write failure or apply audit evidence",
    );
    for (const tableName of [
      "employment",
      "assignment",
      "contact_point",
      "lifecycle_event",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must stay clean after stale retry rejection`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic future-date completed retry enforces persisted job correlation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
      },
      apply,
    });

    assert.throws(
      () =>
        applySyntheticFutureDateHireJob(db, {
          job: {
            id: "future-date-apply-job-stale-completed",
            correlationId: "correlation-syn-hire-stale",
            observedAt: "2026-05-19T00:05:00Z",
          },
          apply,
        }),
      /synthetic future-date apply job correlation must match the persisted request/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-syn-hire-001'
            `,
          )
          .get(),
      ),
      { status_code: "completed" },
      "stale completed retry must not mutate the authoritative request state",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 2 },
      "stale completed retry must not append audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply validates future gate from persisted request data", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const persistedRequest = createSyntheticHireRequestFixture({
      person: hire.person,
      transactionRequest: {
        requestedAt: "2026-06-02T00:00:00Z",
      },
    });
    const callerRequest = {
      person: persistedRequest.person,
      transactionRequest: {
        ...persistedRequest.transactionRequest,
        requestedAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, persistedRequest);

    assert.throws(
      () =>
        applySyntheticFutureDateHireJob(db, {
          job: {
            id: "future-date-apply-job-not-future",
            correlationId: "correlation-syn-hire-001",
            observedAt: "2026-05-19T00:00:00Z",
            failAfterPreconditionsReason:
              "synthetic_post_precondition_apply_failure",
          },
          apply: {
            request: callerRequest,
            hire,
            lifecycleEvent: {
              id: "lifecycle-event-syn-hire-future-001",
              eventType: "hire",
              effectiveDate: "2026-06-01",
              occurredAt: "2026-05-19T00:00:00Z",
            },
          },
        }),
      /synthetic future-date apply job requires a future effective date/,
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, subject_table, subject_id, correlation_id
              FROM audit_event
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.request_submitted",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "persisted-request future gate rejection must not record failure evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT name
              FROM sqlite_master
              WHERE type = 'table'
                AND name = 'synthetic_future_date_apply_failure_evidence'
            `,
          )
          .get(),
      ),
      undefined,
      "rejected future-date preconditions must not create synthetic failure evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply normalizes persisted request timezone before future gate", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-05-20",
      },
      assignment: {
        startDate: "2026-05-20",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
      transactionRequest: {
        requestedAt: "2026-05-19T23:30:00-02:00",
      },
    });

    saveSyntheticHireRequest(db, request);

    assert.throws(
      () =>
        applySyntheticFutureDateHireJob(db, {
          job: {
            id: "future-date-apply-job-offset-boundary",
            correlationId: "correlation-syn-hire-001",
            observedAt: "2026-05-20T02:00:00Z",
            failAfterPreconditionsReason:
              "synthetic_post_precondition_apply_failure",
          },
          apply: {
            request,
            hire,
            lifecycleEvent: {
              id: "lifecycle-event-syn-hire-offset-boundary",
              eventType: "hire",
              effectiveDate: "2026-05-20",
              occurredAt: "2026-05-20T02:00:00Z",
            },
          },
        }),
      /synthetic future-date apply job requires a future effective date/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT name
              FROM sqlite_master
              WHERE type = 'table'
                AND name = 'synthetic_future_date_apply_failure_evidence'
            `,
          )
          .get(),
      ),
      undefined,
      "offset-boundary rejection must not create synthetic failure evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply duplicate job returns persisted failure evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    const firstFailure = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });
    applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001-retry",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:05:00Z",
      },
      apply,
    });

    const duplicateFailure = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:10:00Z",
        failAfterPreconditionsReason: "changed_later_input_must_not_win",
      },
      apply,
    });

    assert.deepEqual(
      duplicateFailure,
      firstFailure,
      "duplicate job ids must return the persisted failure snapshot",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT failure_reason, observed_at, lifecycle_event_count,
                employment_count, assignment_count,
                lifecycle_applied_audit_count
              FROM synthetic_future_date_apply_failure_evidence
              ORDER BY job_id
            `,
          )
          .all(),
      ),
      [
        {
          failure_reason: "synthetic_post_precondition_apply_failure",
          observed_at: "2026-05-19T00:00:00Z",
          lifecycle_event_count: 0,
          employment_count: 0,
          assignment_count: 0,
          lifecycle_applied_audit_count: 0,
        },
      ],
      "persisted failure evidence must not be rebuilt from later input or state",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, count(*) AS count
              FROM audit_event
              GROUP BY action
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.future_date_apply_failed",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.lifecycle_applied",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          count: 1,
        },
      ],
      "duplicate failure job ids must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply stale duplicate job read remains fully idempotent", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    const firstFailure = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });

    const staleReadDb = hideFirstFutureDateApplyFailureEvidenceRead(db);

    const duplicateFailure = applySyntheticFutureDateHireJob(staleReadDb, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:10:00Z",
        failAfterPreconditionsReason: "changed_later_input_must_not_win",
      },
      apply,
    });

    assert.deepEqual(
      duplicateFailure,
      firstFailure,
      "stale duplicate job reads must return the persisted failure snapshot",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, count(*) AS count
              FROM audit_event
              GROUP BY action
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.future_date_apply_failed",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          count: 1,
        },
      ],
      "stale duplicate job reads must not duplicate failure audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply stale duplicate job read cannot apply lifecycle state", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    const firstFailure = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });

    const duplicateFailure = applySyntheticFutureDateHireJob(
      hideFirstFutureDateApplyFailureEvidenceRead(db),
      {
        job: {
          id: "future-date-apply-job-001",
          correlationId: "correlation-syn-hire-001",
          observedAt: "2026-05-19T00:10:00Z",
        },
        apply,
      },
    );

    assert.deepEqual(
      duplicateFailure,
      firstFailure,
      "stale duplicate job reads must re-check persisted failure evidence before applying",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, count(*) AS count
              FROM audit_event
              GROUP BY action
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.future_date_apply_failed",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          count: 1,
        },
      ],
      "stale duplicate job reads must not apply lifecycle or append audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply stale duplicate job read returns failure after completion", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    const firstFailure = applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });
    applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001-retry",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:05:00Z",
      },
      apply,
    });

    const duplicateFailure = applySyntheticFutureDateHireJob(
      hideFirstFutureDateApplyFailureEvidenceRead(db),
      {
        job: {
          id: "future-date-apply-job-001",
          correlationId: "correlation-syn-hire-001",
          observedAt: "2026-05-19T00:10:00Z",
        },
        apply,
      },
    );

    assert.deepEqual(
      duplicateFailure,
      firstFailure,
      "stale duplicate job reads must re-check failure evidence before completed retry fallback",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, count(*) AS count
              FROM audit_event
              GROUP BY action
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.future_date_apply_failed",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.lifecycle_applied",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          count: 1,
        },
      ],
      "completed stale duplicate reads must not append audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic future-date apply failure evidence capture tolerates completion races", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);

    const result = applySyntheticFutureDateHireJob(
      completeBeforeFutureDateFailureEvidenceRead(db, apply),
      {
        job: {
          id: "future-date-apply-job-completion-race",
          correlationId: "correlation-syn-hire-001",
          observedAt: "2026-05-19T00:00:00Z",
          failAfterPreconditionsReason:
            "synthetic_post_precondition_apply_failure",
        },
        apply,
      },
    );

    assert.deepEqual(result, {
      outcome: "applied",
      transactionRequestId: "transaction-request-syn-hire-001",
      lifecycleEventId: "lifecycle-event-syn-hire-future-001",
      personId: "person-syn-hire-001",
      statusCode: "completed",
      correlationId: "correlation-syn-hire-001",
    });
    assert.equal(
      normalizeRow(
        db
          .prepare(
            `
              SELECT name
              FROM sqlite_master
              WHERE type = 'table'
                AND name = 'synthetic_future_date_apply_failure_evidence'
            `,
          )
          .get(),
      ),
      undefined,
      "completion races must not persist failed-job evidence after another worker completed the request",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT action, count(*) AS count
              FROM audit_event
              GROUP BY action
              ORDER BY action
            `,
          )
          .all(),
      ),
      [
        {
          action: "poc.synthetic_hire.lifecycle_applied",
          count: 1,
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          count: 1,
        },
      ],
      "completion races must return the completed retry result without extra failure audit evidence",
    );
  } finally {
    db.close();
  }
});
