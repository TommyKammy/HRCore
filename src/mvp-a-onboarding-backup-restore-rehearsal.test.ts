import assert from "node:assert/strict";
import test from "node:test";

import {
  exportLocalSyntheticSnapshot,
  mvpAOnboardingBackupRestoreRehearsalGate,
  restoreLocalSyntheticSnapshot,
  runMvpAOnboardingBackupRestoreRehearsal,
} from "./mvp-a-onboarding-backup-restore-rehearsal.js";

test("MVP-A onboarding backup/restore rehearsal re-verifies restored synthetic evidence", async (t) => {
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

  const sourceDb = new sqlite.DatabaseSync(":memory:");
  const restoredDb = new sqlite.DatabaseSync(":memory:");
  t.after(() => {
    sourceDb.close();
    restoredDb.close();
  });

  const result = await runMvpAOnboardingBackupRestoreRehearsal({
    sourceDb,
    restoredDb,
  });

  assert.equal(
    result.gate.gateId,
    "mvp_a_onboarding_backup_restore_rehearsal_v1",
  );
  assert.equal(result.gate.readiness, "local_synthetic_rehearsal_only");
  assert.deepEqual(result.verifiedCorrelationIds, [
    "correlation-onboarding-backup-restore-success-001",
    "correlation-onboarding-backup-restore-provider-failure-001",
    "correlation-onboarding-backup-restore-conflict-001",
  ]);
  assert.deepEqual(result.restoredTraceStatuses, {
    success: "completed",
    providerFailure: "completed",
    writebackConflict: "completed",
  });
  assert.deepEqual(result.remainingBackupReadinessGaps, [
    "production RTO/RPO acceptance",
    "cloud snapshot or PITR integration",
    "cross-region restore",
    "secrets backup and rotation recovery",
    "live tenant backup rehearsal",
    "legal retention acceptance",
  ]);
});

test("MVP-A onboarding backup/restore rehearsal gate keeps production backup readiness out of scope", () => {
  assert.deepEqual(mvpAOnboardingBackupRestoreRehearsalGate.outOfScope, [
    "production backup readiness",
    "production RTO/RPO guarantees",
    "cloud snapshots",
    "point-in-time recovery",
    "cross-region restore",
    "secrets backup",
    "live tenant data backup",
    "legal retention acceptance",
  ]);
});

test("MVP-A onboarding backup/restore rehearsal rolls back failed restores", async (t) => {
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

  const sourceDb = new sqlite.DatabaseSync(":memory:");
  const restoredDb = new sqlite.DatabaseSync(":memory:");
  t.after(() => {
    sourceDb.close();
    restoredDb.close();
  });

  await runMvpAOnboardingBackupRestoreRehearsal({ sourceDb, restoredDb });

  const personCountBeforeFailure = restoredDb
    .prepare("SELECT count(*) AS count FROM person")
    .get()?.count;
  const corruptedSnapshot = exportLocalSyntheticSnapshot(sourceDb).map(
    (table) => (table.tableName === "person" ? { ...table, rows: [] } : table),
  );

  assert.throws(
    () => restoreLocalSyntheticSnapshot(restoredDb, corruptedSnapshot),
    /FOREIGN KEY constraint failed/,
  );
  assert.equal(
    restoredDb.prepare("SELECT count(*) AS count FROM person").get()?.count,
    personCountBeforeFailure,
  );
});
