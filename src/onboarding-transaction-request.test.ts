import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  createOnboardingTransactionRequestFixture,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveOnboardingTransactionRequest,
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
      error.message === "payload.managerReference must be a non-empty string",
  );
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
