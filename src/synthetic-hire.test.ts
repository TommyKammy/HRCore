import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createSyntheticHireFixture,
  createSyntheticHireRequestFixture,
  applySyntheticHireRequest,
  saveSyntheticHire,
  saveSyntheticHireRequest,
  type SyntheticHireDatabase,
} from "./synthetic-hire.js";

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

const readCommittedMigrationSql = async (): Promise<string> => {
  const migrationFiles = (await readdir(join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) => readRepoFile(join("drizzle", file))),
  );

  return migrationSqlFiles.join("\n");
};

const normalizeRows = <TRow extends Record<string, unknown>>(
  rows: TRow[],
): Record<string, unknown>[] => rows.map((row) => ({ ...row }));

const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

const openSchemaBackedDatabase = async (t: test.TestContext) => {
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return undefined;
    }

    throw error;
  }

  const db = new sqlite.DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(await readCommittedMigrationSql());
  return db;
};

test("synthetic hire use case persists person, employment, and assignment together", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const result = saveSyntheticHire(db, createSyntheticHireFixture());

    assert.deepEqual(result, {
      personId: "person-syn-hire-001",
      employmentId: "employment-syn-hire-001",
      assignmentId: "assignment-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
    });

    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, display_name, created_at
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
          created_at: "2026-05-18T00:00:00Z",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, employment_code, status_code, start_date
              FROM employment
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "employment-syn-hire-001",
          person_id: "person-syn-hire-001",
          employment_code: "EMP-SYN-HIRE-001",
          status_code: "active",
          start_date: "2026-05-18",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, employment_id, assignment_code, organization_code, position_code, start_date
              FROM assignment
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "assignment-syn-hire-001",
          person_id: "person-syn-hire-001",
          employment_id: "employment-syn-hire-001",
          assignment_code: "ASN-SYN-HIRE-001",
          organization_code: "ORG-SYN-001",
          position_code: "POS-SYN-001",
          start_date: "2026-05-18",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, contact_type, value, is_primary, created_at
              FROM contact_point
              ORDER BY id
            `,
          )
          .all(),
      ),
      [
        {
          id: "contact-point-syn-hire-001",
          person_id: "person-syn-hire-001",
          contact_type: "work_email",
          value: "synthetic.hire.001@example.invalid",
          is_primary: 1,
          created_at: "2026-05-18T00:00:00Z",
        },
      ],
    );
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
          action: "poc.synthetic_hire.persisted",
          subject_table: "person",
          subject_id: "person-syn-hire-001",
          occurred_at: "2026-05-18T00:00:00Z",
          correlation_id: "correlation-syn-hire-direct-001",
          poc_marker: "synthetic_poc",
        },
      ],
    );
  } finally {
    db.close();
  }
});

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
              SELECT id, person_id, transaction_request_id, event_type, effective_date, occurred_at
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

test("synthetic hire input validation fails closed before partial writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const incompleteHire = createSyntheticHireFixture({
      assignment: {
        organizationCode: "",
      },
    });

    assert.throws(
      () => saveSyntheticHire(db, incompleteHire),
      /assignment.organizationCode must be a non-empty string/,
    );

    for (const tableName of ["person", "employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after rejected hire input`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire validation rejects malformed timestamps and impossible dates", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rejectedInputs = [
      {
        input: createSyntheticHireFixture({
          person: {
            createdAt: "2026-05-18Tnot-a-time",
          },
        }),
        error: /person.createdAt must be an ISO timestamp/,
      },
      {
        input: createSyntheticHireFixture({
          person: {
            createdAt: "2026-02-30T00:00:00Z",
          },
        }),
        error: /person.createdAt must be an ISO timestamp/,
      },
      {
        input: createSyntheticHireFixture({
          employment: {
            startDate: "2026-02-30",
          },
        }),
        error: /employment.startDate must be an ISO date/,
      },
      {
        input: createSyntheticHireFixture({
          contactPoint: {
            value: "@example.invalid",
          },
        }),
        error: /contactPoint.value must be a skeleton work email/,
      },
      {
        input: createSyntheticHireFixture({
          contactPoint: {
            isPrimary: "false" as unknown as boolean,
          },
        }),
        error: /contactPoint.isPrimary must be a boolean/,
      },
    ];

    for (const { input, error } of rejectedInputs) {
      assert.throws(() => saveSyntheticHire(db, input), error);
    }

    for (const tableName of [
      "person",
      "employment",
      "assignment",
      "contact_point",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after rejected timestamp or date input`,
      );
    }
  } finally {
    db.close();
  }
});

test("synthetic hire can use a minimal database adapter without transaction introspection", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const minimalDb = {
      exec: db.exec.bind(db),
      prepare: db.prepare.bind(db),
    };

    const result = saveSyntheticHire(minimalDb, createSyntheticHireFixture());

    assert.deepEqual(result, {
      personId: "person-syn-hire-001",
      employmentId: "employment-syn-hire-001",
      assignmentId: "assignment-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
    });
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("synthetic hire can run inside a caller-owned transaction", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec("BEGIN IMMEDIATE");

    const result = saveSyntheticHire(db, createSyntheticHireFixture());

    assert.deepEqual(result, {
      personId: "person-syn-hire-001",
      employmentId: "employment-syn-hire-001",
      assignmentId: "assignment-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
    });
    assert.deepEqual(
      normalizeRow(db.prepare("SELECT count(*) AS count FROM person").get()),
      { count: 1 },
    );

    db.exec("ROLLBACK");

    for (const tableName of ["person", "employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain under the caller-owned transaction boundary`,
      );
    }
  } finally {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    db.close();
  }
});

test("synthetic hire database failures roll back earlier hire writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-existing-contact', 'Synthetic Existing Contact', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-syn-hire-001',
        'person-existing-contact',
        'work_email',
        'synthetic.existing@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const minimalDb: SyntheticHireDatabase = {
      exec: db.exec.bind(db),
      prepare: db.prepare.bind(db),
    };

    assert.throws(
      () => saveSyntheticHire(minimalDb, createSyntheticHireFixture()),
      /UNIQUE constraint failed/,
    );
    assert.equal(db.isTransaction, false);

    for (const tableName of ["employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after rolled back hire input`,
      );
    }
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id
              FROM person
              ORDER BY id
            `,
          )
          .all(),
      ),
      [{ id: "person-existing-contact" }],
    );
  } finally {
    db.close();
  }
});

test("synthetic hire preserves the original error when savepoint start fails", () => {
  const calls: string[] = [];
  const db: SyntheticHireDatabase = {
    exec(sql: string) {
      calls.push(sql);
      if (sql === "SAVEPOINT synthetic_hire_persistence") {
        throw new Error("savepoint start failed");
      }
      if (sql.startsWith("ROLLBACK TO")) {
        throw new Error("no such savepoint");
      }
    },
    prepare() {
      throw new Error("prepare must not run when savepoint start fails");
    },
  };

  assert.throws(
    () => saveSyntheticHire(db, createSyntheticHireFixture()),
    /savepoint start failed/,
  );
  assert.deepEqual(calls, ["SAVEPOINT synthetic_hire_persistence"]);
});

test("synthetic hire database failures inside a caller-owned transaction roll back to the savepoint", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-existing-contact', 'Synthetic Existing Contact', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-syn-hire-001',
        'person-existing-contact',
        'work_email',
        'synthetic.existing@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    assert.throws(
      () => saveSyntheticHire(db, createSyntheticHireFixture()),
      /UNIQUE constraint failed/,
    );

    assert.equal(db.isTransaction, true);
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id
              FROM person
              ORDER BY id
            `,
          )
          .all(),
      ),
      [{ id: "person-existing-contact" }],
    );
    for (const tableName of ["employment", "assignment"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
        ),
        { count: 0 },
        `${tableName} must remain empty after savepoint rollback`,
      );
    }

    db.exec("ROLLBACK");
  } finally {
    if (db.isTransaction) {
      db.exec("ROLLBACK");
    }
    db.close();
  }
});
