import { readdir, readFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SyntheticWritebackDatabase } from "./writeback-ingest.js";

const DEFAULT_DATABASE_URL = "file:./.local/hrcore-dev.sqlite";
const sqliteUriPattern = /^[a-z][a-z0-9+.-]*:/iu;
const requiredWritebackTables = [
  "person",
  "contact_point",
  "writeback_event",
  "writeback_provider_refresh",
  "writeback_work_email_conflict",
];
const additiveConflictMigration = "0005_white_imperial_guard.sql";

export interface LocalSyntheticWritebackDatabase extends SyntheticWritebackDatabase {
  close(): void;
}

export async function openLocalSyntheticWritebackDatabase(
  databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
): Promise<LocalSyntheticWritebackDatabase> {
  const { DatabaseSync } = await import("node:sqlite");
  const databasePath = resolveSqliteDatabasePath(databaseUrl);

  if (databasePath !== ":memory:") {
    await mkdir(dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);

  try {
    db.exec("PRAGMA foreign_keys = ON");
    await ensureSyntheticWritebackSchema(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export function resolveSqliteDatabasePath(databaseUrl: string): string {
  const normalizedUrl = databaseUrl.trim();
  if (!normalizedUrl) {
    throw new Error("DATABASE_URL must point to a local SQLite database.");
  }

  if (normalizedUrl === ":memory:") {
    return normalizedUrl;
  }

  if (normalizedUrl.startsWith("file://")) {
    const parsedUrl = new URL(normalizedUrl);
    if (parsedUrl.hostname && parsedUrl.hostname !== "localhost") {
      throw new Error("DATABASE_URL file URL must be local.");
    }

    return fileURLToPath(parsedUrl);
  }

  if (normalizedUrl.startsWith("file:")) {
    const filePath = normalizedUrl.slice("file:".length);
    if (!filePath) {
      throw new Error("DATABASE_URL file path must not be empty.");
    }

    return resolve(process.cwd(), filePath);
  }

  if (sqliteUriPattern.test(normalizedUrl)) {
    throw new Error("DATABASE_URL must use a local SQLite file path.");
  }

  return resolve(process.cwd(), normalizedUrl);
}

async function ensureSyntheticWritebackSchema(
  db: SyntheticWritebackDatabase,
): Promise<void> {
  const missingTables = requiredWritebackTables.filter(
    (tableName) => !tableExists(db, tableName),
  );
  if (missingTables.length === 0) {
    return;
  }

  if (countUserTables(db) === 0) {
    db.exec(await readCommittedMigrationSql());
    return;
  }

  if (isOnlyMissingConflictTable(missingTables)) {
    db.exec(await readCommittedMigrationSql([additiveConflictMigration]));
    return;
  }

  throw new Error(
    `DATABASE_URL is missing required writeback tables: ${missingTables.join(
      ", ",
    )}`,
  );
}

function isOnlyMissingConflictTable(missingTables: string[]): boolean {
  return (
    missingTables.length === 1 &&
    missingTables[0] === "writeback_work_email_conflict"
  );
}

function tableExists(
  db: SyntheticWritebackDatabase,
  tableName: string,
): boolean {
  const row = db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
    )
    .get(tableName);

  return !!row;
}

function countUserTables(db: SyntheticWritebackDatabase): number {
  const row = db
    .prepare(
      `
        SELECT count(*) AS count
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
      `,
    )
    .get();

  return typeof row?.count === "number" ? row.count : 0;
}

async function readCommittedMigrationSql(
  targetMigrationFiles?: string[],
): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const migrationDirectory = resolve(moduleDirectory, "..", "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .filter(
      (file) => !targetMigrationFiles || targetMigrationFiles.includes(file),
    )
    .sort();

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) =>
      readFile(join(migrationDirectory, file), "utf8"),
    ),
  );

  return migrationSqlFiles.join("\n");
}
