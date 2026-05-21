import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createOnboardingTransactionRequestFixture,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveEditableOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";

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

const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

const normalizeRows = <TRow extends Record<string, unknown>>(
  rows: TRow[],
): Record<string, unknown>[] => rows.map((row) => ({ ...row }));

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

test("MVP-A onboarding transaction request input is parsed into a typed fail-closed contract", () => {
  const parsed = parseOnboardingTransactionRequestInput(
    createOnboardingTransactionRequestFixture(),
  );

  assert.equal(parsed.requestType, "hire");
  assert.equal(parsed.statusCode, "submitted");
  assert.equal(parsed.person.id, "person-onboarding-001");
  assert.equal(parsed.payload.effectiveDate, "2026-06-01");
  assert.equal(
    parsed.payload.workEmailExpectation.value,
    "onboarding.hire.001@example.invalid",
  );
});

test("MVP-A onboarding transaction request validation returns deterministic required-field errors", () => {
  const fixture = createOnboardingTransactionRequestFixture();

  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput({
        ...fixture,
        payload: {
          ...fixture.payload,
          assignment: {
            ...fixture.payload.assignment,
            managerReference: "",
          },
        },
      }),
    (error) =>
      error instanceof OnboardingTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.assignment.managerReference must be a non-empty string",
  );
});

test("MVP-A onboarding transaction request validation reports assignment reference paths", () => {
  const fixture = createOnboardingTransactionRequestFixture();

  for (const fieldName of [
    "departmentReference",
    "legalEntityReference",
    "managerReference",
  ] as const) {
    assert.throws(
      () =>
        parseOnboardingTransactionRequestInput({
          ...fixture,
          payload: {
            ...fixture.payload,
            assignment: {
              ...fixture.payload.assignment,
              [fieldName]: "",
            },
          },
        }),
      (error) =>
        error instanceof OnboardingTransactionRequestValidationError &&
        error instanceof Error &&
        error.message ===
          `payload.assignment.${fieldName} must be a non-empty string`,
    );
  }
});

test("MVP-A onboarding transaction request validation rejects invalid effective dates", () => {
  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput(
        createOnboardingTransactionRequestFixture({
          payload: {
            effectiveDate: "2026-02-30",
          },
        }),
      ),
    (error) =>
      error instanceof OnboardingTransactionRequestValidationError &&
      error instanceof Error &&
      error.message === "payload.effectiveDate must be an ISO date",
  );
});

test("MVP-A onboarding transaction request validation rejects unsupported and regulated fields", () => {
  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput({
        ...createOnboardingTransactionRequestFixture(),
        myNumber: "123456789012",
      }),
    /request contains unsupported fields: myNumber/,
  );

  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput(
        createOnboardingTransactionRequestFixture({
          payload: {
            providerPayload: {
              id: "live-provider-payload",
            },
          } as Record<string, unknown>,
        }),
      ),
    /payload contains unsupported fields: providerPayload/,
  );
});

test("MVP-A onboarding transaction request persistence stores request payload only at draft or submitted boundary", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const result = saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );

    assert.deepEqual(result, {
      personId: "person-onboarding-001",
      transactionRequestId: "transaction-request-onboarding-001",
      statusCode: "submitted",
      correlationId: "correlation-onboarding-001",
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                person.id AS person_id,
                person.display_name,
                transaction_request.id AS transaction_request_id,
                transaction_request.request_type,
                transaction_request.status_code,
                transaction_request.correlation_id,
                transaction_request.payload_version,
                transaction_request.payload_json
              FROM transaction_request
              JOIN person ON person.id = transaction_request.person_id
              WHERE transaction_request.id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        person_id: "person-onboarding-001",
        display_name: "MVP-A Onboarding Hire One",
        transaction_request_id: "transaction-request-onboarding-001",
        request_type: "hire",
        status_code: "submitted",
        correlation_id: "correlation-onboarding-001",
        payload_version: "mvp_a_onboarding_v1",
        payload_json: JSON.stringify({
          effectiveDate: "2026-06-01",
          employment: {
            id: "employment-onboarding-001",
            employmentCode: "EMP-ONBOARDING-001",
            startDate: "2026-06-01",
          },
          assignment: {
            id: "assignment-onboarding-001",
            assignmentCode: "ASN-ONBOARDING-001",
            departmentReference: "department-people-ops",
            legalEntityReference: "legal-entity-jp-001",
            managerReference: "manager-001",
            positionCode: "position-engineer-001",
          },
          workEmailExpectation: {
            contactPointId: "contact-point-onboarding-001",
            value: "onboarding.hire.001@example.invalid",
          },
        }),
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM employment").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 0 },
      "request persistence must not apply employment data early",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding transaction request submit is idempotent for same correlation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createOnboardingTransactionRequestFixture();

    const firstResult = saveOnboardingTransactionRequest(db, request);
    const retryResult = saveOnboardingTransactionRequest(db, request);

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM person").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare("SELECT count(*) AS count FROM transaction_request")
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding transaction request submit uses correlation for regenerated request ids", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createOnboardingTransactionRequestFixture();

    const firstResult = saveOnboardingTransactionRequest(db, request);
    const retryResult = saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        id: "transaction-request-onboarding-regenerated",
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
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "transaction-request-onboarding-001",
          person_id: "person-onboarding-001",
          correlation_id: "correlation-onboarding-001",
        },
      ],
      "correlated retry must return the original request without writing a new one",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding transaction request submit returns authoritative completed retry state", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createOnboardingTransactionRequestFixture();

    const firstResult = saveOnboardingTransactionRequest(db, request);
    db.prepare(
      `
        UPDATE transaction_request
        SET status_code = 'completed'
        WHERE id = ?
      `,
    ).run(firstResult.transactionRequestId);

    assert.deepEqual(saveOnboardingTransactionRequest(db, request), {
      ...firstResult,
      statusCode: "completed",
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare("SELECT count(*) AS count FROM transaction_request")
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
      "out-of-order submit retry must not replace an authoritative completed request",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding transaction request submit fails closed when correlated retry drifts", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );

    assert.throws(
      () =>
        saveOnboardingTransactionRequest(
          db,
          createOnboardingTransactionRequestFixture({
            id: "transaction-request-onboarding-regenerated",
            person: {
              id: "person-onboarding-retry",
              displayName: "MVP-A Onboarding Retry",
            },
          }),
        ),
      /onboarding transaction request retry conflicts with the existing request/,
    );

    for (const tableName of ["person", "transaction_request"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get() as
            | Record<string, unknown>
            | undefined,
        ),
        { count: 1 },
        `${tableName} must not duplicate rows after correlated person drift`,
      );
    }
  } finally {
    db.close();
  }
});

test("MVP-A onboarding transaction request submit recovers when a stale retry read collides", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createOnboardingTransactionRequestFixture();
    const firstResult = saveOnboardingTransactionRequest(db, request);
    let hideFirstRetryRead = true;
    const staleReadDb: OnboardingTransactionRequestDatabase = {
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

            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            return statement.run(...values);
          },
        };
      },
    };

    const retryResult = saveOnboardingTransactionRequest(
      staleReadDb,
      createOnboardingTransactionRequestFixture({
        id: "transaction-request-onboarding-regenerated",
      }),
    );

    assert.deepEqual(retryResult, firstResult);
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM person").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "stale submit retry must roll back the failed write collision",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare("SELECT count(*) AS count FROM transaction_request")
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding draft edit fails closed when the draft update is stale", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const draft = createOnboardingTransactionRequestFixture({
      statusCode: "draft",
    });
    saveEditableOnboardingTransactionRequest(db, draft);

    const staleDraftDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            if (
              sql.includes("UPDATE transaction_request") &&
              sql.includes("AND status_code = 'draft'")
            ) {
              return { changes: 0 };
            }

            return statement.run(...values);
          },
        };
      },
    };

    assert.throws(
      () =>
        saveEditableOnboardingTransactionRequest(
          staleDraftDb,
          createOnboardingTransactionRequestFixture({
            statusCode: "draft",
            person: {
              displayName: "MVP-A Onboarding Stale Edit",
            },
          }),
        ),
      /onboarding transaction request edit conflicts with the current draft state/,
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
            SELECT person.display_name, transaction_request.status_code
            FROM transaction_request
            JOIN person ON person.id = transaction_request.person_id
            WHERE transaction_request.id = ?
          `,
          )
          .get(draft.id) as Record<string, unknown> | undefined,
      ),
      {
        display_name: "MVP-A Onboarding Hire One",
        status_code: "draft",
      },
      "stale draft edit must not leave a partial person update behind",
    );
  } finally {
    db.close();
  }
});
