import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestContext } from "node:test";

export const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

export const readCommittedMigrationSql = async (): Promise<string> => {
  const migrationFiles = (await readdir(join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) => readRepoFile(join("drizzle", file))),
  );

  return migrationSqlFiles.join("\n");
};

export const openSchemaBackedDatabase = async (t: TestContext) => {
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

export const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

export const normalizeRows = <TRow extends Record<string, unknown>>(
  rows: TRow[],
): Record<string, unknown>[] => rows.map((row) => ({ ...row }));
