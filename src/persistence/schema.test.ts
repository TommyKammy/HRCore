import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";

import * as schema from "./schema.js";

const schemaExports = schema as Record<string, unknown>;

const expectedTables = [
  "person",
  "employment",
  "assignment",
  "contact_point",
  "transaction_request",
  "lifecycle_event",
  "audit_event",
] as const;

const requiredColumnsByTable = {
  person: ["id", "display_name", "created_at"],
  employment: [
    "id",
    "person_id",
    "employment_code",
    "status_code",
    "start_date",
  ],
  assignment: [
    "id",
    "person_id",
    "employment_id",
    "assignment_code",
    "start_date",
  ],
  contact_point: ["id", "person_id", "contact_type", "value", "created_at"],
  transaction_request: [
    "id",
    "person_id",
    "request_type",
    "status_code",
    "requested_at",
  ],
  lifecycle_event: [
    "id",
    "person_id",
    "transaction_request_id",
    "event_type",
    "effective_date",
  ],
  audit_event: [
    "id",
    "actor_id",
    "action",
    "subject_table",
    "subject_id",
    "occurred_at",
    "poc_marker",
  ],
} as const;

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

const readCommittedMigrationSql = async (): Promise<string> => {
  const migrationFiles = (await readdir(join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  assert.ok(
    migrationFiles.length > 0,
    "minimum DDL issue should commit at least one migration artifact",
  );

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) => readRepoFile(join("drizzle", file))),
  );

  return migrationSqlFiles.join("\n");
};

const forbiddenSamplePattern = new RegExp(
  [
    "マイ" + "ナンバー",
    "real " + "employee",
    "client" + "_secret",
    "api" + "_token",
    "OKTA" + "_",
  ].join("|"),
  "i",
);

test("minimum HR Core PoC tables are defined as separate Drizzle boundaries", () => {
  for (const tableName of expectedTables) {
    const table = schemaExports[tableName];
    assert.ok(table, `missing Drizzle table export: ${tableName}`);

    const config = getTableConfig(table as SQLiteTable);
    assert.equal(config.name, tableName);

    const columnNames = config.columns.map((column) => column.name);
    for (const requiredColumn of requiredColumnsByTable[tableName]) {
      assert.ok(
        columnNames.includes(requiredColumn),
        `${tableName} is missing required column ${requiredColumn}`,
      );
    }

    assert.ok(
      config.checks.length > 0,
      `${tableName} must have at least one obvious-invalid-record check`,
    );
  }
});

test("minimum DDL migration preserves skeleton scope and PoC audit boundary", async () => {
  const migrationSql = await readCommittedMigrationSql();

  for (const tableName of expectedTables) {
    assert.match(migrationSql, new RegExp(`CREATE TABLE \`${tableName}\``));
  }

  assert.match(migrationSql, /contact_type.*work_email/s);
  assert.match(migrationSql, /transaction_request/);
  assert.match(migrationSql, /lifecycle_event/);
  assert.match(
    migrationSql,
    /FOREIGN KEY \(`employment_id`,`person_id`\) REFERENCES `employment`\(`id`,`person_id`\)/,
  );
  assert.doesNotMatch(
    migrationSql,
    /FOREIGN KEY \(`employment_id`\) REFERENCES `employment`\(`id`\)/,
  );
  assert.match(
    migrationSql,
    /FOREIGN KEY \(`transaction_request_id`,`person_id`\) REFERENCES `transaction_request`\(`id`,`person_id`\)/,
  );
  assert.doesNotMatch(
    migrationSql,
    /FOREIGN KEY \(`transaction_request_id`\) REFERENCES `transaction_request`\(`id`\)/,
  );
  assert.doesNotMatch(migrationSql, /worm|hash_chain|object_lock/i);
  assert.doesNotMatch(
    migrationSql,
    /approver|approval_workflow|rbac|retention_job/i,
  );
  assert.doesNotMatch(migrationSql, /my_number|individual_number/i);
});

test("DDL constraints reject cross-person lifecycle links", async (t) => {
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return;
    }

    throw error;
  }

  const db = new sqlite.DatabaseSync(":memory:");

  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(await readCommittedMigrationSql());

    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES
        ('person-1', 'Synthetic One', '2026-05-18T00:00:00Z'),
        ('person-2', 'Synthetic Two', '2026-05-18T00:00:00Z');

      INSERT INTO employment (
        id,
        person_id,
        employment_code,
        status_code,
        start_date
      )
      VALUES ('employment-1', 'person-1', 'employment-code-1', 'active', '2026-05-18');

      INSERT INTO transaction_request (
        id,
        person_id,
        request_type,
        status_code,
        requested_at
      )
      VALUES (
        'transaction-request-1',
        'person-1',
        'hire',
        'submitted',
        '2026-05-18T00:00:00Z'
      );
    `);

    assert.throws(
      () =>
        db.exec(`
          INSERT INTO assignment (
            id,
            person_id,
            employment_id,
            assignment_code,
            organization_code,
            start_date
          )
          VALUES (
            'assignment-cross-person',
            'person-2',
            'employment-1',
            'assignment-code-cross-person',
            'organization-code-1',
            '2026-05-18'
          );
        `),
      /FOREIGN KEY constraint failed/,
    );

    assert.throws(
      () =>
        db.exec(`
          INSERT INTO lifecycle_event (
            id,
            person_id,
            transaction_request_id,
            event_type,
            effective_date,
            occurred_at
          )
          VALUES (
            'lifecycle-event-cross-person',
            'person-2',
            'transaction-request-1',
            'hire',
            '2026-05-18',
            '2026-05-18T00:00:00Z'
          );
        `),
      /FOREIGN KEY constraint failed/,
    );
  } finally {
    db.close();
  }
});

test("DDL work does not promote proposed ADRs or introduce protected samples", async () => {
  const [readme, migrationSql, adr0005, adr0010, adr0011, adr0012, adr0013] =
    await Promise.all([
      readRepoFile("README.md"),
      readCommittedMigrationSql(),
      readRepoFile("docs/adr/0005-my-number-scope-boundary.md"),
      readRepoFile("docs/adr/0010-break-glass-emergency-access-boundary.md"),
      readRepoFile("docs/adr/0011-data-scope-policy-dsl-rls-boundary.md"),
      readRepoFile(
        "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
      ),
      readRepoFile("docs/adr/0013-self-approval-prevention-boundary.md"),
    ]);

  for (const adrText of [adr0005, adr0010, adr0011, adr0012, adr0013]) {
    assert.match(adrText, /^Proposed$/m);
  }

  for (const text of [readme, migrationSql]) {
    assert.doesNotMatch(text, forbiddenSamplePattern);
  }
});
