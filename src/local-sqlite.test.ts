import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";

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
