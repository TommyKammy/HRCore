import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildOktaMasteringAdapter } from "./okta-mastering-adapter.js";
import {
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
  saveOnboardingTransactionRequest,
  type OnboardingTransactionRequestPayload,
  type SqlStatement,
} from "./onboarding-transaction-request.js";
import {
  verifyMvpAOnboardingCorrelationTrace,
  type MvpAOnboardingCorrelationTrace,
  type MvpAOnboardingTraceabilityDatabase,
} from "./mvp-a-onboarding-traceability.js";

type SqlValue = string | number | bigint | null;
type SnapshotRow = Record<string, SqlValue>;
type SnapshotTable = {
  tableName: string;
  columns: string[];
  rows: SnapshotRow[];
};

export interface MvpAOnboardingBackupRestoreRehearsalStatement extends SqlStatement {
  get(...values: SqlValue[]): Record<string, unknown> | undefined;
  all(...values: SqlValue[]): Record<string, unknown>[];
}

export interface MvpAOnboardingBackupRestoreRehearsalDatabase
  extends
    MvpAOnboardingTraceabilityDatabase,
    OnboardingTransactionRequestDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): MvpAOnboardingBackupRestoreRehearsalStatement;
}

export interface MvpAOnboardingBackupRestoreRehearsalGate {
  gateId: "mvp_a_onboarding_backup_restore_rehearsal_v1";
  readiness: "local_synthetic_rehearsal_only";
  evidenceScope: readonly string[];
  outOfScope: readonly string[];
  remainingBackupReadinessGaps: readonly string[];
}

export interface RunMvpAOnboardingBackupRestoreRehearsalInput {
  sourceDb: MvpAOnboardingBackupRestoreRehearsalDatabase;
  restoredDb: MvpAOnboardingBackupRestoreRehearsalDatabase;
}

export interface MvpAOnboardingBackupRestoreRehearsalResult {
  gate: MvpAOnboardingBackupRestoreRehearsalGate;
  verifiedCorrelationIds: string[];
  restoredTraceStatuses: {
    success: string;
    providerFailure: string;
    writebackConflict: string;
  };
  remainingBackupReadinessGaps: string[];
}

const successCorrelationId =
  "correlation-onboarding-backup-restore-success-001";
const providerFailureCorrelationId =
  "correlation-onboarding-backup-restore-provider-failure-001";
const writebackConflictCorrelationId =
  "correlation-onboarding-backup-restore-conflict-001";

const localRehearsalTables = [
  "person",
  "transaction_request",
  "employment",
  "assignment",
  "contact_point",
  "lifecycle_event",
  "audit_event",
  "writeback_event",
  "writeback_provider_refresh",
  "writeback_work_email_conflict",
  "writeback_work_email_conflict_resolution",
  "onboarding_apply_job_attempt",
  "onboarding_apply_job_run",
] as const;

const remainingBackupReadinessGaps = [
  "production RTO/RPO acceptance",
  "cloud snapshot or PITR integration",
  "cross-region restore",
  "secrets backup and rotation recovery",
  "live tenant backup rehearsal",
  "legal retention acceptance",
] as const;

export const mvpAOnboardingBackupRestoreRehearsalGate: MvpAOnboardingBackupRestoreRehearsalGate =
  Object.freeze({
    gateId: "mvp_a_onboarding_backup_restore_rehearsal_v1",
    readiness: "local_synthetic_rehearsal_only",
    evidenceScope: Object.freeze([
      "MVP-A synthetic onboarding success evidence",
      "MVP-A synthetic provider failure or partial-success evidence",
      "MVP-A synthetic writeback conflict evidence",
      "restored correlation trace re-verification",
    ]),
    outOfScope: Object.freeze([
      "production backup readiness",
      "production RTO/RPO guarantees",
      "cloud snapshots",
      "point-in-time recovery",
      "cross-region restore",
      "secrets backup",
      "live tenant data backup",
      "legal retention acceptance",
    ]),
    remainingBackupReadinessGaps: Object.freeze([
      ...remainingBackupReadinessGaps,
    ]),
  });

export async function runMvpAOnboardingBackupRestoreRehearsal(
  input: RunMvpAOnboardingBackupRestoreRehearsalInput,
): Promise<MvpAOnboardingBackupRestoreRehearsalResult> {
  await prepareMvpAOnboardingRehearsalDatabase(input.sourceDb);
  await prepareMvpAOnboardingRehearsalDatabase(input.restoredDb);
  await seedSyntheticRehearsalEvidence(input.sourceDb);

  const snapshot = exportLocalSyntheticSnapshot(input.sourceDb);
  restoreLocalSyntheticSnapshot(input.restoredDb, snapshot);

  const successTrace = verifyMvpAOnboardingCorrelationTrace(input.restoredDb, {
    correlationId: successCorrelationId,
    requireApproval: true,
    requireApply: true,
    requireWriteback: true,
    requireProviderRefresh: true,
  });
  const providerFailureTrace = verifyMvpAOnboardingCorrelationTrace(
    input.restoredDb,
    {
      correlationId: providerFailureCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireWriteback: false,
      requireProviderRefresh: false,
    },
  );
  const writebackConflictTrace = verifyMvpAOnboardingCorrelationTrace(
    input.restoredDb,
    {
      correlationId: writebackConflictCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireWriteback: true,
      requireProviderRefresh: false,
    },
  );
  assertRestoredWritebackConflictEvidence(writebackConflictTrace);

  return {
    gate: mvpAOnboardingBackupRestoreRehearsalGate,
    verifiedCorrelationIds: [
      successCorrelationId,
      providerFailureCorrelationId,
      writebackConflictCorrelationId,
    ],
    restoredTraceStatuses: {
      success: successTrace.transactionRequest.statusCode,
      providerFailure: providerFailureTrace.transactionRequest.statusCode,
      writebackConflict: writebackConflictTrace.transactionRequest.statusCode,
    },
    remainingBackupReadinessGaps: [...remainingBackupReadinessGaps],
  };
}

function assertRestoredWritebackConflictEvidence(
  trace: MvpAOnboardingCorrelationTrace,
): void {
  if (trace.workEmailConflict?.conflictType !== "inbound_value_conflict") {
    throw new Error(
      "MVP-A onboarding backup/restore rehearsal requires restored writeback conflict evidence",
    );
  }
}

export async function prepareMvpAOnboardingRehearsalDatabase(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): Promise<void> {
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(await readCommittedMigrationSql());
}

export function exportLocalSyntheticSnapshot(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): SnapshotTable[] {
  db.exec("BEGIN IMMEDIATE");
  try {
    const snapshot = localRehearsalTables.map((tableName) => {
      const columns = readTableColumns(db, tableName);
      return {
        tableName,
        columns,
        rows: db
          .prepare(
            `SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(
              tableName,
            )} ORDER BY rowid`,
          )
          .all()
          .map(assertSnapshotRow),
      };
    });
    db.exec("COMMIT");
    return snapshot;
  } catch (error) {
    rollbackTransaction(db);
    throw error;
  }
}

export function restoreLocalSyntheticSnapshot(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
  snapshot: SnapshotTable[],
): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const table of [...snapshot].reverse()) {
      db.exec(`DELETE FROM ${quoteIdentifier(table.tableName)}`);
    }

    for (const table of snapshot) {
      if (table.rows.length === 0) continue;

      const columnList = table.columns.map(quoteIdentifier).join(", ");
      const placeholders = table.columns.map(() => "?").join(", ");
      const insert = db.prepare(
        `INSERT INTO ${quoteIdentifier(
          table.tableName,
        )} (${columnList}) VALUES (${placeholders})`,
      );
      for (const row of table.rows) {
        insert.run(...table.columns.map((column) => row[column] ?? null));
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    rollbackTransaction(db);
    throw error;
  }
}

async function seedSyntheticRehearsalEvidence(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): Promise<void> {
  await seedSuccessEvidence(db);
  await seedProviderFailureEvidence(db);
  await seedWritebackConflictEvidence(db);
}

async function seedSuccessEvidence(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): Promise<void> {
  saveOnboardingTransactionRequest(
    db,
    createRehearsalFixture({
      sequence: "001",
      correlationId: successCorrelationId,
      displayName: "MVP-A Backup Restore Success",
      workEmail: "backup.restore.success@example.invalid",
    }),
  );
  decideOnboardingTransactionRequest(db, {
    transactionRequestId: "transaction-request-backup-restore-001",
    decision: "approve",
    decidedAt: "2026-05-29T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: successCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
    transactionRequestId: "transaction-request-backup-restore-001",
    appliedAt: "2026-05-29T02:00:00Z",
    appliedBy: "operator-people-ops-apply-001",
    correlationId: successCorrelationId,
    oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
  });
}

async function seedProviderFailureEvidence(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): Promise<void> {
  saveOnboardingTransactionRequest(
    db,
    createRehearsalFixture({
      sequence: "002",
      correlationId: providerFailureCorrelationId,
      displayName: "MVP-A Backup Restore Provider Failure",
      workEmail: "backup.restore.provider.failure@example.invalid",
    }),
  );
  decideOnboardingTransactionRequest(db, {
    transactionRequestId: "transaction-request-backup-restore-002",
    decision: "approve",
    decidedAt: "2026-05-29T03:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: providerFailureCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
    transactionRequestId: "transaction-request-backup-restore-002",
    appliedAt: "2026-05-29T04:00:00Z",
    appliedBy: "operator-people-ops-apply-001",
    correlationId: providerFailureCorrelationId,
    oktaAdapter: buildOktaMasteringAdapter({
      mode: "mock",
      forcedFailures: {
        "EMP-BACKUP-RESTORE-002": {
          outcome: "retryable_failure",
          errorCode: "mock_rate_limited",
          message: "Synthetic retryable provider failure.",
        },
      },
    }),
  });
}

async function seedWritebackConflictEvidence(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): Promise<void> {
  saveOnboardingTransactionRequest(
    db,
    createRehearsalFixture({
      sequence: "003",
      correlationId: writebackConflictCorrelationId,
      displayName: "MVP-A Backup Restore Conflict",
      workEmail: "backup.restore.conflict@example.invalid",
    }),
  );
  db.prepare(
    `
      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (?, ?, 'work_email', ?, 1, ?)
    `,
  ).run(
    "contact-point-backup-restore-003",
    "person-backup-restore-003",
    "manual.backup.restore.conflict@example.invalid",
    "2026-05-29T04:30:00Z",
  );
  decideOnboardingTransactionRequest(db, {
    transactionRequestId: "transaction-request-backup-restore-003",
    decision: "approve",
    decidedAt: "2026-05-29T05:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: writebackConflictCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
    transactionRequestId: "transaction-request-backup-restore-003",
    appliedAt: "2026-05-29T06:00:00Z",
    appliedBy: "operator-people-ops-apply-001",
    correlationId: writebackConflictCorrelationId,
    oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
  });
}

function createRehearsalFixture(input: {
  sequence: string;
  correlationId: string;
  displayName: string;
  workEmail: string;
}) {
  const employmentCode = `EMP-BACKUP-RESTORE-${input.sequence}`;
  const payload: OnboardingTransactionRequestPayload = {
    tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
    effectiveDate: "2026-06-01",
    employment: {
      id: `employment-backup-restore-${input.sequence}`,
      employmentCode,
      startDate: "2026-06-01",
    },
    assignment: {
      id: `assignment-backup-restore-${input.sequence}`,
      assignmentCode: `ASN-BACKUP-RESTORE-${input.sequence}`,
      departmentReference: "department-people-ops",
      legalEntityReference: "legal-entity-jp-001",
      managerReference: "manager-001",
      positionCode: "position-engineer-001",
    },
    workEmailExpectation: {
      contactPointId: `contact-point-backup-restore-${input.sequence}`,
      value: input.workEmail,
    },
  };

  return createOnboardingTransactionRequestFixture({
    id: `transaction-request-backup-restore-${input.sequence}`,
    person: {
      id: `person-backup-restore-${input.sequence}`,
      displayName: input.displayName,
      createdAt: "2026-05-29T00:00:00Z",
    },
    correlationId: input.correlationId,
    payload: payload as unknown as Partial<Record<string, unknown>>,
  });
}

function readTableColumns(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
  tableName: string,
): string[] {
  const rows = db
    .prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .all()
    .map(assertTableInfoRow);
  if (rows.length === 0) {
    throw new Error(
      `MVP-A backup/restore rehearsal missing table ${tableName}`,
    );
  }

  return rows.map((row) => row.name);
}

async function readCommittedMigrationSql(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const migrationDirectory = resolve(moduleDirectory, "..", "drizzle");
  const migrationFiles = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) =>
      readFile(join(migrationDirectory, file), "utf8"),
    ),
  );

  return migrationSqlFiles.join("\n");
}

function assertTableInfoRow(row: unknown): { name: string } {
  if (!isRecord(row) || typeof row.name !== "string") {
    throw new Error("MVP-A backup/restore rehearsal table metadata is invalid");
  }

  return { name: row.name };
}

function assertSnapshotRow(row: unknown): SnapshotRow {
  if (!isRecord(row)) {
    throw new Error("MVP-A backup/restore rehearsal snapshot row is invalid");
  }

  const snapshotRow: SnapshotRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint" ||
      value === null
    ) {
      snapshotRow[key] = value;
      continue;
    }

    throw new Error(
      `MVP-A backup/restore rehearsal cannot snapshot unsupported ${key} value`,
    );
  }

  return snapshotRow;
}

function rollbackTransaction(
  db: MvpAOnboardingBackupRestoreRehearsalDatabase,
): void {
  try {
    db.exec("ROLLBACK");
  } catch {
    // Preserve the original failure when SQLite has already unwound the transaction.
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) {
    throw new Error(
      `MVP-A backup/restore rehearsal rejected unsafe identifier ${identifier}`,
    );
  }

  return `"${identifier}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
