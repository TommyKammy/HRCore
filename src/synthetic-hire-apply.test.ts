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

test("synthetic hire paths emit minimal synthetic audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    saveSyntheticHireRequest(db, request);
    const applyRequest = {
      ...request,
      transactionRequest: {
        ...request.transactionRequest,
        correlationId: "correlation-input-drift-ignored",
      },
    };
    const appliedResult = applySyntheticHireRequest(db, {
      request: applyRequest,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-001",
        eventType: "hire",
        effectiveDate: "2026-05-18",
        occurredAt: "2026-05-18T00:00:00Z",
      },
    });

    assert.equal(appliedResult.correlationId, "correlation-syn-hire-001");
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT actor_id, action, subject_table, subject_id, occurred_at, correlation_id, poc_marker
              FROM audit_event
              ORDER BY
                CASE subject_table
                  WHEN 'transaction_request' THEN 1
                  WHEN 'lifecycle_event' THEN 2
                  ELSE 3
                END,
                id
            `,
          )
          .all(),
      ),
      [
        {
          actor_id: "synthetic-poc-actor",
          action: "poc.synthetic_hire.request_submitted",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          occurred_at: "2026-05-18T00:00:00Z",
          correlation_id: "correlation-syn-hire-001",
          poc_marker: "synthetic_poc",
        },
        {
          actor_id: "synthetic-poc-actor",
          action: "poc.synthetic_hire.lifecycle_applied",
          subject_table: "lifecycle_event",
          subject_id: "lifecycle-event-syn-hire-001",
          occurred_at: "2026-05-18T00:00:00Z",
          correlation_id: "correlation-syn-hire-001",
          poc_marker: "synthetic_poc",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry is idempotent without duplicate durable effects", async (t) => {
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

    saveSyntheticHireRequest(db, request);

    const firstResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });
    const retryResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
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
        `${tableName} must not duplicate rows after retry`,
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
          action: "poc.synthetic_hire.lifecycle_applied",
          subject_table: "lifecycle_event",
          subject_id: "lifecycle-event-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
        {
          action: "poc.synthetic_hire.request_submitted",
          subject_table: "transaction_request",
          subject_id: "transaction-request-syn-hire-001",
          correlation_id: "correlation-syn-hire-001",
        },
      ],
      "retrying apply must not duplicate lifecycle or submit audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry recovers when stale retry state misses a completed apply", async (t) => {
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

    saveSyntheticHireRequest(db, request);
    const firstResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    let hideFirstCompletedRead = true;
    const staleReadDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            if (
              hideFirstCompletedRead &&
              sql.includes(
                "transaction_request.status_code AS transaction_status_code",
              )
            ) {
              hideFirstCompletedRead = false;
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

    const retryResult = applySyntheticHireRequest(staleReadDb, {
      request,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get(),
      ),
      { count: 1 },
      "stale apply retry must not duplicate lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "stale apply retry must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry recovers when stale submitted state enters the write path", async (t) => {
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

    saveSyntheticHireRequest(db, request);
    const firstResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    let hideFirstCompletedRead = true;
    let returnStaleSubmittedRead = true;
    const staleReadDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            if (
              hideFirstCompletedRead &&
              sql.includes(
                "transaction_request.status_code AS transaction_status_code",
              )
            ) {
              hideFirstCompletedRead = false;
              return undefined;
            }

            if (
              returnStaleSubmittedRead &&
              sql.includes("SELECT\n        correlation_id") &&
              sql.includes("status_code = 'submitted'")
            ) {
              returnStaleSubmittedRead = false;
              return { correlation_id: "correlation-syn-hire-001" };
            }

            return statement.get(...values);
          },
          run(...values) {
            return statement.run(...values);
          },
        };
      },
    };

    const retryResult = applySyntheticHireRequest(staleReadDb, {
      request,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get(),
      ),
      { count: 1 },
      "stale submitted apply retry must roll back the failed write path",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "stale submitted apply retry must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry keeps authoritative correlation when caller input drifts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const driftedRequest = createSyntheticHireRequestFixture({
      person: hire.person,
      transactionRequest: {
        correlationId: "correlation-input-drift-ignored",
      },
    });
    const lifecycleEvent = {
      id: "lifecycle-event-syn-hire-001",
      eventType: "hire" as const,
      effectiveDate: "2026-05-18",
      occurredAt: "2026-05-18T00:00:00Z",
    };

    saveSyntheticHireRequest(db, request);

    const firstResult = applySyntheticHireRequest(db, {
      request: driftedRequest,
      hire,
      lifecycleEvent,
    });
    const retryResult = applySyntheticHireRequest(db, {
      request: driftedRequest,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.equal(firstResult.correlationId, "correlation-syn-hire-001");
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get(),
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
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry ignores non-authoritative request metadata accepted by first apply", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const driftedRequest = createSyntheticHireRequestFixture({
      person: {
        id: hire.person.id,
        displayName: "Synthetic Hire Display Drift",
        createdAt: "2026-05-18T00:10:00Z",
      },
      transactionRequest: {
        requestedAt: "2026-05-18T00:10:00Z",
      },
    });
    const lifecycleEvent = {
      id: "lifecycle-event-syn-hire-001",
      eventType: "hire" as const,
      effectiveDate: "2026-05-18",
      occurredAt: "2026-05-18T00:00:00Z",
    };

    saveSyntheticHireRequest(db, request);

    const firstResult = applySyntheticHireRequest(db, {
      request: driftedRequest,
      hire,
      lifecycleEvent,
    });
    const retryResult = applySyntheticHireRequest(db, {
      request: driftedRequest,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.equal(firstResult.correlationId, "correlation-syn-hire-001");
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT display_name, created_at
              FROM person
              WHERE id = 'person-syn-hire-001'
            `,
          )
          .get(),
      ),
      {
        display_name: "Synthetic Hire One",
        created_at: "2026-05-18T00:00:00Z",
      },
      "retry must keep the authoritative person row from submit",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply fails closed when persisted request correlation is missing", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-syn-hire-001', 'Synthetic Hire One', '2026-05-18T00:00:00Z');

      INSERT INTO transaction_request (
        id,
        person_id,
        request_type,
        status_code,
        requested_at,
        correlation_id
      )
      VALUES (
        'transaction-request-syn-hire-001',
        'person-syn-hire-001',
        'hire',
        'submitted',
        '2026-05-18T00:00:00Z',
        NULL
      );
    `);

    assert.throws(
      () =>
        applySyntheticHireRequest(db, {
          request,
          hire,
          lifecycleEvent: {
            id: "lifecycle-event-syn-hire-001",
            eventType: "hire",
            effectiveDate: "2026-05-18",
            occurredAt: "2026-05-18T00:00:00Z",
          },
        }),
      /synthetic hire apply requires a persisted request correlation/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code, correlation_id
              FROM transaction_request
              WHERE id = 'transaction-request-syn-hire-001'
            `,
          )
          .get(),
      ),
      {
        status_code: "submitted",
        correlation_id: null,
      },
    );
    for (const tableName of [
      "employment",
      "assignment",
      "contact_point",
      "lifecycle_event",
      "audit_event",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after missing correlation rejection`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry tolerates later mutable contact value changes", async (t) => {
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

    saveSyntheticHireRequest(db, request);
    const firstResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    db.prepare(
      `
        UPDATE contact_point
        SET value = 'synthetic.hire.updated@example.invalid',
          is_primary = 0
        WHERE id = 'contact-point-syn-hire-001'
          AND person_id = 'person-syn-hire-001'
      `,
    ).run();

    const retryResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value, is_primary
              FROM contact_point
              WHERE id = 'contact-point-syn-hire-001'
            `,
          )
          .get(),
      ),
      {
        value: "synthetic.hire.updated@example.invalid",
        is_primary: 0,
      },
      "retry must not overwrite later mutable contact value changes",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 2 },
      "retry after contact mutation must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry fails closed when contact point is omitted", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      contactPoint: {
        createdAt: "2026-05-18T01:00:00Z",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const lifecycleEvent = {
      id: "lifecycle-event-syn-hire-001",
      eventType: "hire" as const,
      effectiveDate: "2026-05-18",
      occurredAt: "2026-05-18T00:00:00Z",
    };

    saveSyntheticHireRequest(db, request);
    applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    const { contactPoint: _omitted, ...hireWithoutContactPoint } = hire;
    assert.throws(
      () =>
        applySyntheticHireRequest(db, {
          request,
          hire: hireWithoutContactPoint,
          lifecycleEvent,
        }),
      /synthetic hire apply retry conflicts with the completed request/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 1 },
      "omitted contact point retry must not alter stored contact evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get(),
      ),
      { count: 2 },
      "omitted contact point retry must not write extra audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry ignores later work email contacts when original apply omitted contact", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      contactPoint: null,
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const lifecycleEvent = {
      id: "lifecycle-event-syn-hire-001",
      eventType: "hire" as const,
      effectiveDate: "2026-05-18",
      occurredAt: "2026-05-18T00:00:00Z",
    };

    saveSyntheticHireRequest(db, request);
    const firstResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    db.exec(`
      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-later-writeback',
        'person-syn-hire-001',
        'work_email',
        'synthetic.hire.later@example.invalid',
        1,
        '2026-05-19T00:00:00Z'
      );
    `);

    const retryResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 1 },
      "later contact evidence must remain untouched by a no-contact apply retry",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "no-contact apply retry must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry ignores preexisting work email contacts when original apply omitted contact", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      contactPoint: null,
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const lifecycleEvent = {
      id: "lifecycle-event-syn-hire-001",
      eventType: "hire" as const,
      effectiveDate: "2026-05-18",
      occurredAt: "2026-05-18T00:00:00Z",
    };

    saveSyntheticHireRequest(db, request);
    db.exec(`
      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-preexisting-writeback',
        'person-syn-hire-001',
        'work_email',
        'synthetic.hire.preexisting@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const firstResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });
    const retryResult = applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent,
    });

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT contact_point_id FROM lifecycle_event").get(),
      ),
      { contact_point_id: null },
      "no-contact apply must keep contact linkage empty even when a prior contact exists",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 1 },
      "preexisting contact evidence must remain untouched by a no-contact apply retry",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "no-contact apply retry with a preexisting contact must not duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply retry fails closed on lifecycle id drift", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    saveSyntheticHireRequest(db, request);
    applySyntheticHireRequest(db, {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-001",
        eventType: "hire",
        effectiveDate: "2026-05-18",
        occurredAt: "2026-05-18T00:00:00Z",
      },
    });

    assert.throws(
      () =>
        applySyntheticHireRequest(db, {
          request,
          hire,
          lifecycleEvent: {
            id: "lifecycle-event-syn-hire-drift",
            eventType: "hire",
            effectiveDate: "2026-05-18",
            occurredAt: "2026-05-18T00:00:00Z",
          },
        }),
      /synthetic hire apply retry conflicts with the completed request/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get(),
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
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      { count: 1 },
      "drifted apply retry must not write duplicate audit evidence",
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply rejects submitted non-hire transaction requests", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-syn-hire-001', 'Synthetic Hire One', '2026-05-18T00:00:00Z');

      INSERT INTO transaction_request (
        id,
        person_id,
        request_type,
        status_code,
        requested_at,
        correlation_id
      )
      VALUES (
        'transaction-request-syn-hire-001',
        'person-syn-hire-001',
        'change',
        'submitted',
        '2026-05-18T00:00:00Z',
        'correlation-syn-hire-001'
      );
    `);

    assert.throws(
      () =>
        applySyntheticHireRequest(db, {
          request,
          hire,
          lifecycleEvent: {
            id: "lifecycle-event-syn-hire-001",
            eventType: "hire",
            effectiveDate: "2026-05-18",
            occurredAt: "2026-05-18T00:00:00Z",
          },
        }),
      /synthetic hire apply requires a submitted hire request/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT request_type, status_code
              FROM transaction_request
              WHERE id = 'transaction-request-syn-hire-001'
            `,
          )
          .get(),
      ),
      {
        request_type: "change",
        status_code: "submitted",
      },
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
        `${tableName} must remain empty after rejected non-hire request apply`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire apply does not require run changes metadata", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const metadataFreeDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            return statement.get(...values);
          },
          run(...values) {
            statement.run(...values);
            return undefined;
          },
        };
      },
    };

    saveSyntheticHireRequest(metadataFreeDb, request);

    const appliedResult = applySyntheticHireRequest(metadataFreeDb, {
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
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT request_type, status_code
              FROM transaction_request
              WHERE id = 'transaction-request-syn-hire-001'
            `,
          )
          .get(),
      ),
      {
        request_type: "hire",
        status_code: "completed",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM lifecycle_event").get(),
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic hire apply does not reject unused hire audit payload", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = {
      ...createSyntheticHireFixture(),
      audit: {
        actorId: "",
        correlationId: "",
        occurredAt: "not-a-timestamp",
        pocMarker: "not_synthetic_poc" as "synthetic_poc",
      },
    };
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    saveSyntheticHireRequest(db, request);

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
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT correlation_id, poc_marker
              FROM audit_event
              WHERE action = 'poc.synthetic_hire.lifecycle_applied'
            `,
          )
          .get(),
      ),
      {
        correlation_id: "correlation-syn-hire-001",
        poc_marker: "synthetic_poc",
      },
    );
  } finally {
    db.close();
  }
});
