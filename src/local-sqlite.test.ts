import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  openLocalSyntheticWritebackDatabase,
  prepareLocalBootstrapMigrationSql,
} from "./local-sqlite.js";

const readMigrationSqlBefore = async (
  excludedFile: string,
): Promise<string> => {
  const migrationFiles = (await readdir(join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file < excludedFile)
    .sort();

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) =>
      readFile(join(process.cwd(), "drizzle", file), "utf8"),
    ),
  );

  return migrationSqlFiles.join("\n");
};

test("local SQLite bootstrap rejects pre-refresh writeback schemas", async (t) => {
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

  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-local-db-"));
  t.after(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const databasePath = join(tempDirectory, "hrcore.sqlite");
  const db = new sqlite.DatabaseSync(databasePath);
  try {
    db.exec(`
      CREATE TABLE person (id text PRIMARY KEY);
      CREATE TABLE contact_point (id text PRIMARY KEY);
      CREATE TABLE writeback_event (id text PRIMARY KEY);
    `);
  } finally {
    db.close();
  }

  await assert.rejects(
    openLocalSyntheticWritebackDatabase(`file:${databasePath}`),
    /DATABASE_URL is missing required writeback tables: writeback_provider_refresh/,
  );
});

test("local SQLite bootstrap applies additive work email conflict migrations", async (t) => {
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

  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-local-db-"));
  t.after(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const databasePath = join(tempDirectory, "hrcore.sqlite");
  const db = new sqlite.DatabaseSync(databasePath);
  try {
    db.exec(await readMigrationSqlBefore("0005_white_imperial_guard.sql"));
  } finally {
    db.close();
  }

  const migratedDb = await openLocalSyntheticWritebackDatabase(
    `file:${databasePath}`,
  );
  try {
    const conflictTable = migratedDb
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'writeback_work_email_conflict'
        `,
      )
      .get();
    const resolutionTable = migratedDb
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'writeback_work_email_conflict_resolution'
        `,
      )
      .get();

    assert.equal(conflictTable?.name, "writeback_work_email_conflict");
    assert.equal(
      resolutionTable?.name,
      "writeback_work_email_conflict_resolution",
    );
  } finally {
    migratedDb.close();
  }
});

test("local SQLite bootstrap upgrades the P2LIST audit sink without losing rows", async (t) => {
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

  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-local-db-"));
  t.after(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const databasePath = join(tempDirectory, "hrcore.sqlite");
  const db = new sqlite.DatabaseSync(databasePath);
  try {
    db.exec(
      await readMigrationSqlBefore("0019_p2list_export_schema_version.sql"),
    );
    db.exec(`
      INSERT INTO p2list_audit_event (
        event_id,
        event_type,
        event_version,
        occurred_at,
        evaluated_permission,
        resource_type,
        correlation_id,
        policy_decision
      )
      VALUES (
        'legacy-p2list-audit-event',
        'employee_list.viewed',
        'p2list_audit_v1',
        '2026-07-26T00:00:00.000Z',
        'employee:list:read',
        'employee',
        'legacy-p2list-correlation',
        'allow'
      )
    `);
  } finally {
    db.close();
  }

  const migratedDb = await openLocalSyntheticWritebackDatabase(
    `file:${databasePath}`,
  );
  try {
    const migratedTable = migratedDb
      .prepare(
        `
          SELECT name, sql
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'p2list_audit_event'
        `,
      )
      .get();

    assert.equal(migratedTable?.name, "p2list_audit_event");
    assert.match(String(migratedTable?.sql), /export_schema_version/u);
    assert.match(String(migratedTable?.sql), /duration_ms/u);
    const preservedAuditRow = migratedDb
      .prepare(
        `
          SELECT event_id, export_schema_version, duration_ms
          FROM p2list_audit_event
          WHERE event_id = ?
        `,
      )
      .get("legacy-p2list-audit-event");
    assert.deepEqual(preservedAuditRow ? { ...preservedAuditRow } : undefined, {
      event_id: "legacy-p2list-audit-event",
      export_schema_version: null,
      duration_ms: 0,
    });
    const observabilityIndexes = migratedDb
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM sqlite_master
          WHERE type = 'index'
            AND tbl_name = 'p2list_audit_event'
            AND name LIKE 'p2list_audit_event_correlation_%'
        `,
      )
      .get();
    assert.equal(observabilityIndexes?.count, 2);
  } finally {
    migratedDb.close();
  }
});

test("P2LIST audit sink rebuild rolls back a failed upgrade atomically", async (t) => {
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

  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-local-db-"));
  t.after(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const databasePath = join(tempDirectory, "hrcore.sqlite");
  const db = new sqlite.DatabaseSync(databasePath);
  try {
    db.exec(
      await readMigrationSqlBefore("0019_p2list_export_schema_version.sql"),
    );
    db.exec(`
      INSERT INTO p2list_audit_event (
        event_id,
        event_type,
        event_version,
        occurred_at,
        evaluated_permission,
        resource_type,
        correlation_id,
        policy_decision
      )
      VALUES (
        'rollback-p2list-audit-event',
        'employee_list.viewed',
        'p2list_audit_v1',
        '2026-07-26T00:00:00.000Z',
        'employee:list:read',
        'employee',
        'rollback-p2list-correlation',
        'allow'
      )
    `);
    const migrationSql = await readFile(
      join(process.cwd(), "drizzle", "0019_p2list_export_schema_version.sql"),
      "utf8",
    );
    const renameStatement =
      "ALTER TABLE `__new_p2list_audit_event` RENAME TO `p2list_audit_event`;";
    const failingMigrationSql = prepareLocalBootstrapMigrationSql(
      "0019_p2list_export_schema_version.sql",
      migrationSql.replace(
        renameStatement,
        `SELECT * FROM __forced_p2list_migration_failure;\n${renameStatement}`,
      ),
    );
    assert.notEqual(failingMigrationSql, migrationSql);
    assert.throws(
      () => db.exec(failingMigrationSql),
      /__forced_p2list_migration_failure/u,
    );
  } finally {
    db.close();
  }

  const migratedDb = await openLocalSyntheticWritebackDatabase(
    `file:${databasePath}`,
  );
  try {
    const liveTable = migratedDb
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'p2list_audit_event'
        `,
      )
      .get();
    const temporaryTable = migratedDb
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = '__new_p2list_audit_event'
        `,
      )
      .get();
    assert.equal(liveTable?.name, "p2list_audit_event");
    assert.equal(temporaryTable, undefined);
    const preservedRow = migratedDb
      .prepare(
        `
          SELECT event_id, export_schema_version
          FROM p2list_audit_event
          WHERE event_id = ?
        `,
      )
      .get("rollback-p2list-audit-event");
    assert.deepEqual(preservedRow ? { ...preservedRow } : undefined, {
      event_id: "rollback-p2list-audit-event",
      export_schema_version: null,
    });
  } finally {
    migratedDb.close();
  }
});

test("P2LIST migration leaves transaction ownership to the Drizzle runner", async (t) => {
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
    db.exec(
      await readMigrationSqlBefore("0019_p2list_export_schema_version.sql"),
    );
    const migrationSql = await readFile(
      join(process.cwd(), "drizzle", "0019_p2list_export_schema_version.sql"),
      "utf8",
    );

    db.exec("BEGIN");
    assert.doesNotThrow(() => db.exec(migrationSql));
    assert.equal(
      db
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM pragma_table_info('p2list_audit_event')
            WHERE name = 'export_schema_version'
          `,
        )
        .get()?.count,
      1,
    );
    db.exec("ROLLBACK");
  } finally {
    db.close();
  }
});

test("local SQLite bootstrap upgrades existing conflict schemas with resolution table", async (t) => {
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

  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-local-db-"));
  t.after(async () => {
    await rm(tempDirectory, { recursive: true, force: true });
  });

  const databasePath = join(tempDirectory, "hrcore.sqlite");
  const db = new sqlite.DatabaseSync(databasePath);
  try {
    db.exec(await readMigrationSqlBefore("0009_conflict_resolution.sql"));
  } finally {
    db.close();
  }

  const migratedDb = await openLocalSyntheticWritebackDatabase(
    `file:${databasePath}`,
  );
  try {
    const migratedTable = migratedDb
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'writeback_work_email_conflict_resolution'
        `,
      )
      .get();

    assert.equal(
      migratedTable?.name,
      "writeback_work_email_conflict_resolution",
    );
  } finally {
    migratedDb.close();
  }
});
