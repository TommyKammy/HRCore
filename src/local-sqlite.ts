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
  "writeback_work_email_conflict_resolution",
  "p2list_audit_event",
];
const additiveWritebackMigrationByTable = new Map([
  ["writeback_work_email_conflict", "0005_white_imperial_guard.sql"],
  ["writeback_work_email_conflict_resolution", "0009_conflict_resolution.sql"],
  ["p2list_audit_event", "0018_p2list_audit_event.sql"],
]);
const p2ListExportMigrationFile =
  "0019_p2list_export_schema_version.sql" as const;

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

  if (countUserTables(db) === 0) {
    db.exec(await readCommittedMigrationSql());
    return;
  }

  const additiveMigrationFiles =
    getAdditiveWritebackMigrationFiles(missingTables);
  if (!additiveMigrationFiles) {
    throw new Error(
      `DATABASE_URL is missing required writeback tables: ${missingTables.join(
        ", ",
      )}`,
    );
  }
  if (
    missingTables.includes("p2list_audit_event") ||
    !tableIncludesColumn(db, "p2list_audit_event", "export_schema_version")
  ) {
    additiveMigrationFiles.push(p2ListExportMigrationFile);
  }
  if (additiveMigrationFiles.length > 0) {
    db.exec(
      await readCommittedMigrationSql([...new Set(additiveMigrationFiles)]),
    );
    return;
  }
}

function getAdditiveWritebackMigrationFiles(
  missingTables: string[],
): string[] | undefined {
  const migrationFiles = missingTables.map((tableName) =>
    additiveWritebackMigrationByTable.get(tableName),
  );

  return migrationFiles.every(
    (file): file is string => typeof file === "string",
  )
    ? migrationFiles
    : undefined;
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

function tableIncludesColumn(
  db: SyntheticWritebackDatabase,
  tableName: string,
  columnName: string,
): boolean {
  if (
    !/^[a-z][a-z0-9_]*$/u.test(tableName) ||
    !/^[a-z][a-z0-9_]*$/u.test(columnName)
  ) {
    return false;
  }
  const row = db
    .prepare(
      `
        SELECT 1 AS present
        FROM pragma_table_info(?)
        WHERE name = ?
      `,
    )
    .get(tableName, columnName);
  return row?.present === 1;
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
    migrationFiles.map(async (file) =>
      prepareLocalBootstrapMigrationSql(
        file,
        await readFile(join(migrationDirectory, file), "utf8"),
      ),
    ),
  );

  return migrationSqlFiles.join("\n");
}

export function prepareLocalBootstrapMigrationSql(
  migrationFile: string,
  migrationSql: string,
): string {
  if (migrationFile !== p2ListExportMigrationFile) {
    return migrationSql;
  }

  const foreignKeysOff =
    "PRAGMA foreign_keys=OFF;--> statement-breakpoint";
  const foreignKeysOn = "PRAGMA foreign_keys=ON;";
  if (
    !migrationSql.startsWith(foreignKeysOff) ||
    !migrationSql.trimEnd().endsWith(foreignKeysOn)
  ) {
    throw new Error(
      `${p2ListExportMigrationFile} no longer matches the local atomic upgrade boundary.`,
    );
  }

  return migrationSql
    .replace(foreignKeysOff, `${foreignKeysOff}\nBEGIN IMMEDIATE;`)
    .replace(foreignKeysOn, `COMMIT;\n${foreignKeysOn}`);
}
