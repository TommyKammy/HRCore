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

test("synthetic hire request remains separate from the applied lifecycle event", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    const requestResult = saveSyntheticHireRequest(db, request);

    assert.deepEqual(requestResult, {
      personId: "person-syn-hire-001",
      transactionRequestId: "transaction-request-syn-hire-001",
      statusCode: "submitted",
      correlationId: "correlation-syn-hire-001",
    });
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, request_type, status_code, correlation_id
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          person_id: "person-syn-hire-001",
          request_type: "hire",
          status_code: "submitted",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get(),
      ),
      { count: 0 },
      "a request/change intent must exist before any applied lifecycle event",
    );

    const appliedResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-001",
        eventType: "hire",
        effectiveDate: "2026-05-18",
        occurredAt: "2026-05-18T00:00:00Z",
      },
    });

    assert.deepEqual(appliedResult, {
      transactionRequestId: "transaction-request-syn-hire-001",
      lifecycleEventId: "lifecycle-event-syn-hire-001",
      personId: "person-syn-hire-001",
      statusCode: "completed",
      correlationId: "correlation-syn-hire-001",
    });
    assert.notEqual(
      appliedResult.transactionRequestId,
      appliedResult.lifecycleEventId,
      "the applied event must be a distinct record, not the request row reused",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, status_code, correlation_id
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          person_id: "person-syn-hire-001",
          status_code: "completed",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, transaction_request_id, contact_point_id, event_type, effective_date, occurred_at
              FROM lifecycle_event
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "lifecycle-event-syn-hire-001",
          person_id: "person-syn-hire-001",
          transaction_request_id: "transaction-request-syn-hire-001",
          contact_point_id: "contact-point-syn-hire-001",
          event_type: "hire",
          effective_date: "2026-05-18",
          occurred_at: "2026-05-18T00:00:00Z",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit is idempotent for the same correlation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();

    const firstResult = saveSyntheticHireRequest(db, request);
    const retryResult = saveSyntheticHireRequest(db, request);

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM transaction_request").get(),
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.request_submitted'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "retrying the same submit must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit uses correlation for regenerated request ids", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();

    const firstResult = saveSyntheticHireRequest(db, request);
    const retryResult = saveSyntheticHireRequest(
      db,
      createSyntheticHireRequestFixture({
        transactionRequest: {
          id: "transaction-request-syn-hire-regenerated",
        },
      }),
    );

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, correlation_id
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          person_id: "person-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "correlated retry must return the original request without writing a new one",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit prefers correlation over a colliding regenerated request id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();

    const firstResult = saveSyntheticHireRequest(db, request);
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES (
        'person-syn-hire-colliding-request',
        'Synthetic Hire Colliding Request',
        '2026-05-18T00:00:00Z'
      );

      INSERT INTO transaction_request (
        id,
        person_id,
        request_type,
        status_code,
        requested_at,
        correlation_id
      )
      VALUES (
        'transaction-request-syn-hire-regenerated',
        'person-syn-hire-colliding-request',
        'hire',
        'submitted',
        '2026-05-18T00:00:00Z',
        'correlation-syn-hire-colliding-request'
      );
    `);

    const retryResult = saveSyntheticHireRequest(
      db,
      createSyntheticHireRequestFixture({
        transactionRequest: {
          id: "transaction-request-syn-hire-regenerated",
        },
      }),
    );

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, correlation_id
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          person_id: "person-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
        {
          id: "transaction-request-syn-hire-regenerated",
          person_id: "person-syn-hire-colliding-request",
          correlation_id: "correlation-syn-hire-colliding-request",
        },
      ],
      "a cross-person request id collision must not hide the authoritative correlation match",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.request_submitted'
                AND correlation_id = 'correlation-syn-hire-001'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "correlated retry must not write duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit does not classify a cross-person request id collision as a retry", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const firstResult = saveSyntheticHireRequest(
      db,
      createSyntheticHireRequestFixture(),
    );

    assert.throws(
      () =>
        saveSyntheticHireRequest(
          db,
          createSyntheticHireRequestFixture({
            person: {
              id: "person-syn-hire-same-request-id",
              displayName: "Synthetic Hire Same Request Id",
            },
            transactionRequest: {
              correlationId: "correlation-syn-hire-same-request-id",
            },
          }),
        ),
      /UNIQUE constraint failed: transaction_request\.id/,
    );

    assert.deepEqual(firstResult, {
      personId: "person-syn-hire-001",
      transactionRequestId: "transaction-request-syn-hire-001",
      statusCode: "submitted",
      correlationId: "correlation-syn-hire-001",
    });
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, correlation_id
              FROM transaction_request
              ORDER BY person_id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          person_id: "person-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "cross-person request id collisions must fail at the authoritative schema boundary instead of the retry pre-read",
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, display_name
              FROM person
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "person-syn-hire-001",
          display_name: "Synthetic Hire One",
        },
      ],
      "failed cross-person collision must roll back the attempted person insert",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 1 },
      "failed cross-person collision must not write extra audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit fails closed when regenerated correlated retry changes person", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveSyntheticHireRequest(db, createSyntheticHireRequestFixture());

    assert.throws(
      () =>
        saveSyntheticHireRequest(
          db,
          createSyntheticHireRequestFixture({
            person: {
              id: "person-syn-hire-retry",
              displayName: "Synthetic Hire Retry",
            },
            transactionRequest: {
              id: "transaction-request-syn-hire-regenerated",
              personId: "person-syn-hire-retry",
            },
          }),
        ),
      /synthetic hire request retry conflicts with the existing request/,
    );

    for (const tableName of ["person", "transaction_request", "audit_event"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 1 },
        `${tableName} must not duplicate rows after correlated person drift`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire request submit recovers an idempotent result after a stale retry read collides", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();
    const firstResult = saveSyntheticHireRequest(db, request);
    let hideFirstRetryRead = true;
    const staleReadDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            if (
              hideFirstRetryRead &&
              sql.includes(
                "JOIN person ON person.id = transaction_request.person_id",
              ) &&
              sql.includes("transaction_request.correlation_id = ?")
            ) {
              hideFirstRetryRead = false;
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

    const retryResult = saveSyntheticHireRequest(staleReadDb, request);

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
      "stale submit retry must roll back the failed write collision",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM transaction_request").get(),
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 1 },
      "stale submit retry must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit recovers a regenerated id after a stale retry read collides", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();
    const firstResult = saveSyntheticHireRequest(db, request);
    let hideFirstRetryRead = true;
    const staleReadDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            if (
              hideFirstRetryRead &&
              sql.includes(
                "JOIN person ON person.id = transaction_request.person_id",
              ) &&
              sql.includes("transaction_request.correlation_id = ?")
            ) {
              hideFirstRetryRead = false;
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

    const retryResult = saveSyntheticHireRequest(
      staleReadDb,
      createSyntheticHireRequestFixture({
        transactionRequest: {
          id: "transaction-request-syn-hire-regenerated",
        },
      }),
    );

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, correlation_id
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          person_id: "person-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "stale regenerated submit retry must recover the authoritative correlated request",
    );
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
      "stale regenerated submit retry must roll back the failed insert attempt",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 1 },
      "stale regenerated submit retry must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit fails closed on retry correlation drift", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();

    saveSyntheticHireRequest(db, request);

    assert.throws(
      () =>
        saveSyntheticHireRequest(
          db,
          createSyntheticHireRequestFixture({
            transactionRequest: {
              correlationId: "correlation-syn-hire-drift",
            },
          }),
        ),
      /synthetic hire request retry conflicts with the existing request/,
    );

    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, status_code, correlation_id
              FROM transaction_request
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "transaction-request-syn-hire-001",
          status_code: "submitted",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "drifted retry must leave the authoritative request unchanged",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 1 },
      "drifted retry must not write extra audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire request submit remains idempotent by correlation after apply completes the request", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const lifecycleEvent = {
      id: "lifecycle-event-syn-hire-001",
      eventType: "hire" as const,
      effectiveDate: "2026-05-18",
      occurredAt: "2026-05-18T00:00:00Z",
    };

    const submitResult = saveSyntheticHireRequest(db, request);
    applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });
    const retryResult = saveSyntheticHireRequest(
      db,
      createSyntheticHireRequestFixture({
        person: hire.person,
        transactionRequest: {
          id: "transaction-request-syn-hire-regenerated",
        },
      }),
    );

    assert.deepEqual(retryResult, submitResult);
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
      "submit retry must not roll back or rewrite the completed lifecycle state",
    );
    for (const tableName of [
      "person",
      "transaction_request",
      "lifecycle_event",
      "employment",
      "assignment",
      "contact_point",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 1 },
        `${tableName} must not duplicate rows after out-of-order submit retry`,
      );
    }
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 2 },
      "out-of-order submit retry must not write duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});
