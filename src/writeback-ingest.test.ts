import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildApp } from "./app.js";
import {
  createSyntheticWorkEmailWritebackFixture,
  ingestSyntheticWorkEmailWriteback,
} from "./writeback-ingest.js";

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

test("synthetic work email writeback ingest persists event evidence and upserts contact point", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');

      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-writeback-001',
        'person-writeback-001',
        'work_email',
        'old.writeback@example.invalid',
        1,
        '2026-05-18T00:00:00Z'
      );
    `);

    const result = ingestSyntheticWorkEmailWriteback(
      db,
      createSyntheticWorkEmailWritebackFixture(),
    );

    assert.deepEqual(result, {
      eventId: "writeback-event-work-email-001",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      correlationId: "correlation-writeback-work-email-001",
      applied: true,
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT id, person_id, contact_type, value, is_primary, created_at
              FROM contact_point
              WHERE person_id = 'person-writeback-001'
            `,
          )
          .get(),
      ),
      {
        id: "contact-point-writeback-001",
        person_id: "person-writeback-001",
        contact_type: "work_email",
        value: "confirmed.writeback@example.invalid",
        is_primary: 1,
        created_at: "2026-05-18T00:00:00Z",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                id,
                person_id,
                provider_name,
                provider_subject_id,
                provider_value,
                target_contact_type,
                correlation_id,
                received_at,
                poc_marker
              FROM writeback_event
              WHERE id = 'writeback-event-work-email-001'
            `,
          )
          .get(),
      ),
      {
        id: "writeback-event-work-email-001",
        person_id: "person-writeback-001",
        provider_name: "synthetic_okta",
        provider_subject_id: "synthetic-okta-user-001",
        provider_value: "confirmed.writeback@example.invalid",
        target_contact_type: "work_email",
        correlation_id: "correlation-writeback-work-email-001",
        received_at: "2026-05-18T01:00:00Z",
        poc_marker: "synthetic_poc",
      },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback rejects invalid input before durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    db.exec(`
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
    `);

    assert.throws(
      () =>
        ingestSyntheticWorkEmailWriteback(
          db,
          createSyntheticWorkEmailWritebackFixture({
            providerValue: "not-an-email",
          }),
        ),
      /providerValue must be a skeleton work email/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
      ),
      { count: 0 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("synthetic work email writeback rejects unknown person without partial durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    assert.throws(
      () =>
        ingestSyntheticWorkEmailWriteback(
          db,
          createSyntheticWorkEmailWritebackFixture({
            personId: "person-writeback-missing",
          }),
        ),
      /FOREIGN KEY constraint failed/,
    );

    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get(),
      ),
      { count: 0 },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM contact_point").get(),
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("POST /writeback-events/work-email exposes the local synthetic ingest API", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  const app = await buildApp({ writebackDb: db });
  t.after(async () => {
    await app.close();
    db.close();
  });

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
  `);

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture(),
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    eventId: "writeback-event-work-email-001",
    personId: "person-writeback-001",
    contactPointId: "contact-point-writeback-001",
    providerName: "synthetic_okta",
    providerSubjectId: "synthetic-okta-user-001",
    correlationId: "correlation-writeback-work-email-001",
    applied: true,
  });
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT provider_value
            FROM writeback_event
            WHERE id = 'writeback-event-work-email-001'
          `,
        )
        .get(),
    ),
    {
      provider_value: "confirmed.writeback@example.invalid",
    },
  );
});
