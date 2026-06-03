import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import { rollbackNamedSavepoint } from "./onboarding-transaction-request-shared.js";
import {
  buildImportFingerprint,
  buildMvpDCsvImportDryRunResult,
  buildRowFingerprint,
  evaluateMvpDCsvImportRows,
} from "./csv-import-contract-helpers.js";
import type { AcceptedParsedCsvRow } from "./csv-import-contract-helpers.js";
import {
  buildApplyJobRowIds,
  buildApplyRowIds,
} from "./csv-import-apply-ids.js";
import {
  applyAcceptedCsvRow,
  assertExistingOutcomeMatchesAppliedRow,
  finalizeCsvImportJob,
  readSuccessfulCsvImportRowOutcome,
  recordCsvImportJob,
  recordFailedCsvImportRowOutcome,
  recordIdempotentCsvImportRowOutcome,
} from "./csv-import-apply-persistence.js";
import type {
  MvpDCsvImportAppliedRow,
  MvpDCsvImportApplyInput,
  MvpDCsvImportApplyResult,
  MvpDCsvImportApplyRowContext,
  MvpDCsvImportFailedApplyRow,
  NormalizedMvpDCsvImportApplyInput,
} from "./csv-import-apply-types.js";
import type { MvpDCsvImportDryRunResult } from "./csv-import-contract-helpers.js";

export function applySyntheticLifecycleCsvImport(
  db: OnboardingTransactionRequestDatabase,
  input: MvpDCsvImportApplyInput,
): MvpDCsvImportApplyResult {
  const command = normalizeApplyCommand(input);
  const applyPlan = buildApplyPlan(command);
  const rows: Array<MvpDCsvImportAppliedRow | MvpDCsvImportFailedApplyRow> = [];
  let appliedRows = 0;
  let idempotentRows = 0;
  let failedRows = 0;
  let savepointStarted = false;

  try {
    db.exec("SAVEPOINT mvp_d_csv_import_apply");
    savepointStarted = true;

    recordCsvImportJob(db, command, applyPlan.importFingerprint, {
      acceptedRows: applyPlan.dryRun.summary.acceptedRows,
      failedRows: applyPlan.dryRun.summary.rejectedRows,
    });

    for (const dryRunRow of applyPlan.dryRun.acceptedRows) {
      const rowContext = applyPlan.rowsById.get(dryRunRow.rowId);
      if (!rowContext) {
        throw new Error(
          `CSV import apply row ${dryRunRow.rowId} is missing from the CSV input`,
        );
      }

      const existingOutcome = readSuccessfulCsvImportRowOutcome(
        db,
        dryRunRow.rowId,
      );
      if (existingOutcome) {
        assertExistingOutcomeMatchesAppliedRow(
          existingOutcome,
          rowContext.row,
          rowContext.rowIds,
          rowContext.rowFingerprint,
        );
        recordIdempotentCsvImportRowOutcome(
          db,
          command,
          rowContext.row,
          rowContext.rowIds,
          rowContext.jobRowIds,
          rowContext.rowFingerprint,
        );
        rows.push({
          rowId: dryRunRow.rowId,
          lifecycleType: dryRunRow.lifecycleType,
          status: "idempotent",
          transactionRequestId: rowContext.rowIds.transactionRequestId,
          lifecycleEventId: rowContext.rowIds.lifecycleEventId,
        });
        idempotentRows += 1;
        continue;
      }

      const rowResult = applyCsvImportRow(db, command, rowContext);
      rows.push(rowResult);
      if (rowResult.status === "applied") {
        appliedRows += 1;
      } else {
        failedRows += 1;
      }
    }

    finalizeCsvImportJob(db, command, {
      appliedRows,
      failedRows,
      idempotentRows,
    });

    db.exec("RELEASE SAVEPOINT mvp_d_csv_import_apply");
  } catch (error) {
    if (savepointStarted) {
      rollbackNamedSavepoint(db, "mvp_d_csv_import_apply");
    }
    throw error;
  }

  return {
    summary: {
      appliedRows,
      failedRows,
      idempotentRows,
    },
    rows,
    correlationId: command.correlationId,
  };
}

function buildApplyPlan(command: NormalizedMvpDCsvImportApplyInput): {
  dryRun: MvpDCsvImportDryRunResult;
  importFingerprint: string;
  rowsById: Map<string, MvpDCsvImportApplyRowContext>;
} {
  const currentDryRun = buildMvpDCsvImportDryRunResult(
    evaluateMvpDCsvImportRows(command.csvInput),
  );
  if (!matchesDryRunContract(command.dryRun, currentDryRun)) {
    throw new Error(
      "CSV import apply requires a current dry-run result for the exact CSV input",
    );
  }
  if (currentDryRun.summary.rejectedRows > 0) {
    throw new Error(
      "CSV import apply requires a dry-run with no rejected rows",
    );
  }

  const acceptedRows = evaluateMvpDCsvImportRows(
    command.csvInput,
  ).acceptedParsedRows;

  return {
    dryRun: currentDryRun,
    importFingerprint: buildImportFingerprint(acceptedRows),
    rowsById: buildApplyRowContexts(command, acceptedRows),
  };
}

function buildApplyRowContexts(
  command: NormalizedMvpDCsvImportApplyInput,
  rows: AcceptedParsedCsvRow[],
): Map<string, MvpDCsvImportApplyRowContext> {
  return new Map(
    rows.map((row) => {
      const rowId = row.row_id.trim();
      return [
        rowId,
        {
          row,
          rowIds: buildApplyRowIds(row),
          jobRowIds: buildApplyJobRowIds(command, row),
          rowFingerprint: buildRowFingerprint(row),
        },
      ];
    }),
  );
}

function applyCsvImportRow(
  db: OnboardingTransactionRequestDatabase,
  command: NormalizedMvpDCsvImportApplyInput,
  rowContext: MvpDCsvImportApplyRowContext,
): MvpDCsvImportAppliedRow | MvpDCsvImportFailedApplyRow {
  try {
    db.exec("SAVEPOINT mvp_d_csv_import_apply_row");
    applyAcceptedCsvRow(
      db,
      command,
      rowContext.row,
      rowContext.rowIds,
      rowContext.jobRowIds,
      rowContext.rowFingerprint,
    );
    db.exec("RELEASE SAVEPOINT mvp_d_csv_import_apply_row");
    return {
      rowId: rowContext.row.row_id.trim(),
      lifecycleType: rowContext.row.lifecycle_type,
      status: "applied",
      transactionRequestId: rowContext.rowIds.transactionRequestId,
      lifecycleEventId: rowContext.rowIds.lifecycleEventId,
    };
  } catch (error) {
    rollbackNamedSavepoint(db, "mvp_d_csv_import_apply_row");
    const reason = formatApplyFailureReason(error);
    recordFailedCsvImportRowOutcome(
      db,
      command,
      rowContext.row,
      rowContext.jobRowIds,
      rowContext.rowFingerprint,
      reason,
    );
    return {
      rowId: rowContext.row.row_id.trim(),
      lifecycleType: rowContext.row.lifecycle_type,
      status: "failed",
      reason,
    };
  }
}

function formatApplyFailureReason(error: unknown): string {
  return error instanceof Error ? error.message : "unknown CSV import failure";
}

function normalizeApplyCommand(
  input: MvpDCsvImportApplyInput,
): NormalizedMvpDCsvImportApplyInput {
  const appliedAt = input.appliedAt.trim();
  const appliedBy = input.appliedBy.trim();
  const correlationId = input.correlationId.trim();

  if (!isValidIsoTimestamp(appliedAt)) {
    throw new Error("CSV import apply requires an ISO timestamp");
  }
  if (appliedBy.length === 0) {
    throw new Error("CSV import apply requires an authenticated actor");
  }
  if (correlationId.length === 0) {
    throw new Error("CSV import apply requires a correlation id");
  }

  return {
    ...input,
    appliedAt,
    appliedBy,
    correlationId,
  };
}

function matchesDryRunContract(
  expected: MvpDCsvImportDryRunResult,
  actual: MvpDCsvImportDryRunResult,
): boolean {
  return JSON.stringify(expected) === JSON.stringify(actual);
}

function isValidIsoTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second, millisecond, offset] = match;
  const localDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number((millisecond ?? "").padEnd(3, "0")),
    ),
  );
  const date = new Date(value);
  const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
  return (
    !Number.isNaN(date.getTime()) &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    localDate.getUTCFullYear() === Number(year) &&
    localDate.getUTCMonth() + 1 === Number(month) &&
    localDate.getUTCDate() === Number(day) &&
    localDate.getUTCHours() === Number(hour) &&
    localDate.getUTCMinutes() === Number(minute) &&
    localDate.getUTCSeconds() === Number(second)
  );
}
