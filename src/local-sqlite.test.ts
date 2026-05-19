import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";

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

test("local SQLite bootstrap applies the additive work email conflict migration", async (t) => {
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
    const migratedTable = migratedDb
      .prepare(
        `
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name = 'writeback_work_email_conflict'
        `,
      )
      .get();

    assert.equal(migratedTable?.name, "writeback_work_email_conflict");
  } finally {
    migratedDb.close();
  }
});
