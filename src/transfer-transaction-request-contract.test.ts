import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import test, { type TestContext } from "node:test";

import {
  createTransferTransactionRequestFixture,
  parseTransferTransactionRequestInput,
  saveTransferTransactionRequest,
  TransferTransactionRequestValidationError,
} from "./transfer-transaction-request.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
  readRepoFile,
} from "./test-helpers/database.js";

test("MVP-B transfer transaction request input is parsed into a typed bounded contract", () => {
  const parsed = parseTransferTransactionRequestInput(
    createTransferTransactionRequestFixture(),
  );

  assert.equal(parsed.requestType, "transfer");
  assert.equal(parsed.statusCode, "submitted");
  assert.equal(parsed.person.id, "person-transfer-001");
  assert.equal(parsed.payload.effectiveDate, "2026-07-01");
  assert.equal(
    parsed.payload.currentAssignment.assignmentId,
    "assignment-current-transfer-001",
  );
  assert.equal(
    parsed.payload.targetAssignment.departmentReference,
    "department-product",
  );
  assert.equal(parsed.payload.transferReason.reasonCode, "team_change");
});

test("MVP-B transfer transaction request validation returns deterministic missing-field errors", () => {
  const fixture = createTransferTransactionRequestFixture();

  assert.throws(
    () =>
      parseTransferTransactionRequestInput({
        ...fixture,
        payload: {
          ...fixture.payload,
          targetAssignment: {
            ...fixture.payload.targetAssignment,
            managerReference: "",
          },
        },
      }),
    (error) =>
      error instanceof TransferTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.targetAssignment.managerReference must be a non-empty string",
  );
});

test("MVP-B transfer transaction request validation rejects invalid effective dates", () => {
  assert.throws(
    () =>
      parseTransferTransactionRequestInput(
        createTransferTransactionRequestFixture({
          payload: {
            effectiveDate: "2026-02-30",
          },
        }),
      ),
    (error) =>
      error instanceof TransferTransactionRequestValidationError &&
      error instanceof Error &&
      error.message === "payload.effectiveDate must be an ISO date",
  );
});

test("MVP-B transfer transaction request validation rejects unsupported later-wave and regulated fields", () => {
  for (const unsupportedPayload of [
    { concurrentAssignment: { assignmentId: "assignment-second" } },
    { secondment: { hostOrganizationReference: "org-host" } },
    { leaveArrangement: { leaveType: "childcare" } },
    { workArrangement: { reducedHours: true } },
    { employmentStatusExtension: { statusCode: "inactive" } },
    { regulatedData: { sensitivePersonalInformation: true } },
    { rawPayload: { provider: "live" } },
    { csvExport: { enabled: true } },
    { liveProviderPayload: { providerSubjectId: "00u-live" } },
  ] as const) {
    assert.throws(
      () =>
        parseTransferTransactionRequestInput(
          createTransferTransactionRequestFixture({
            payload: unsupportedPayload,
          }),
        ),
      /payload contains unsupported fields:/,
    );
  }
});

test("MVP-B transfer transaction request persistence stores only draft or submitted transfer payloads", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const result = saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );

    assert.deepEqual(result, {
      personId: "person-transfer-001",
      transactionRequestId: "transaction-request-transfer-001",
      statusCode: "submitted",
      correlationId: "correlation-transfer-001",
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                person.id AS person_id,
                transaction_request.id AS transaction_request_id,
                transaction_request.request_type,
                transaction_request.status_code,
                transaction_request.payload_version,
                transaction_request.payload_json
              FROM transaction_request
              JOIN person ON person.id = transaction_request.person_id
              WHERE transaction_request.id = 'transaction-request-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        person_id: "person-transfer-001",
        transaction_request_id: "transaction-request-transfer-001",
        request_type: "transfer",
        status_code: "submitted",
        payload_version: "mvp_b_transfer_v1",
        payload_json: JSON.stringify({
          tenantEnvironmentId: "repo_owned_synthetic_mvp_b_transfer",
          effectiveDate: "2026-07-01",
          currentAssignment: {
            assignmentId: "assignment-current-transfer-001",
            assignmentCode: "ASN-CURRENT-TRANSFER-001",
          },
          targetAssignment: {
            organizationReference: "organization-engineering",
            departmentReference: "department-product",
            managerReference: "manager-product-001",
            positionCode: "position-staff-engineer-001",
          },
          transferReason: {
            reasonCode: "team_change",
            note: "Synthetic bounded MVP-B transfer request",
          },
        }),
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM assignment").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 0 },
      "transfer request persistence must not apply assignment data early",
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer transaction request persistence reuses an exact existing person", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createTransferTransactionRequestFixture();
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(
      request.person.id,
      request.person.displayName,
      request.person.createdAt,
    );

    const result = saveTransferTransactionRequest(db, request);

    assert.deepEqual(result, {
      personId: request.person.id,
      transactionRequestId: request.id,
      statusCode: "submitted",
      correlationId: request.correlationId,
    });
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM person").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "transfer persistence must not duplicate an existing transfer subject",
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer transaction request persistence rejects existing person drift", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createTransferTransactionRequestFixture();
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES (?, ?, ?)
      `,
    ).run(
      request.person.id,
      "Existing Transfer Subject",
      request.person.createdAt,
    );

    assert.throws(
      () => saveTransferTransactionRequest(db, request),
      /transfer transaction request person conflicts with the existing person/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare("SELECT count(*) AS count FROM transaction_request")
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "person drift must not leave a transfer request behind",
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer transaction request persistence submits an existing draft", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const draft = createTransferTransactionRequestFixture({
      statusCode: "draft",
    });
    const draftResult = saveTransferTransactionRequest(db, draft);

    const submitResult = saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture({
        statusCode: "submitted",
      }),
    );

    assert.deepEqual(submitResult, {
      ...draftResult,
      statusCode: "submitted",
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = ?
            `,
          )
          .get(draft.id) as Record<string, unknown> | undefined,
      ),
      { status_code: "submitted" },
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer migration preserves dependent onboarding apply attempts", async (t) => {
  const db = await openSqliteDatabase(t);
  if (!db) return;

  try {
    const migrationFiles = (await readdir("drizzle"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const migrationSqlBeforeTransfer = await Promise.all(
      migrationFiles
        .filter((file) => file < "0014_transfer_transaction_request.sql")
        .map((file) => readRepoFile(`drizzle/${file}`)),
    );

    db.exec("PRAGMA foreign_keys = ON");
    db.exec(migrationSqlBeforeTransfer.join("\n"));
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES ('person-migration-transfer-001', 'Migration Transfer Subject', '2026-06-01T00:00:00Z')
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
          'transaction-request-migration-transfer-001',
          'person-migration-transfer-001',
          'hire',
          'submitted',
          '2026-06-01T00:00:00Z',
          'correlation-migration-transfer-001',
          'mvp_a_onboarding_v1',
          '{}'
        )
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO onboarding_apply_job_attempt (
          id,
          transaction_request_id,
          person_id,
          status_code,
          attempted_at,
          worker_id,
          correlation_id,
          retryable,
          error_message
        )
        VALUES (
          'onboarding-apply-attempt-migration-transfer-001',
          'transaction-request-migration-transfer-001',
          'person-migration-transfer-001',
          'applied',
          '2026-06-01T00:00:00Z',
          'worker-migration-transfer-001',
          'correlation-migration-transfer-attempt-001',
          0,
          NULL
        )
      `,
    ).run();

    db.exec(
      await readRepoFile("drizzle/0014_transfer_transaction_request.sql"),
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT onboarding_apply_job_attempt.transaction_request_id
              FROM onboarding_apply_job_attempt
              JOIN transaction_request
                ON transaction_request.id = onboarding_apply_job_attempt.transaction_request_id
               AND transaction_request.person_id = onboarding_apply_job_attempt.person_id
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        transaction_request_id: "transaction-request-migration-transfer-001",
      },
    );
    assert.deepEqual(
      normalizeRows(
        db.prepare("PRAGMA foreign_key_check").all() as Record<
          string,
          unknown
        >[],
      ),
      [],
      "transfer migration must leave referenced transaction_request rows valid",
    );
  } finally {
    db.close();
  }
});

async function openSqliteDatabase(t: TestContext) {
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

  return new sqlite.DatabaseSync(":memory:");
}
