import type { AcceptedParsedCsvRow } from "./csv-import-contract-helpers.js";
import type {
  ExistingCsvImportRowOutcome,
  MvpDCsvImportApplyRowIds,
} from "./csv-import-apply-types.js";

export type CsvImportRowOutcomeDecision =
  | { status: "matched_success" }
  | { status: "retry_failed_outcome" }
  | { status: "conflict"; reason: string };

export function decideCsvImportRowOutcome(
  existing: ExistingCsvImportRowOutcome,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  rowFingerprint: string,
): CsvImportRowOutcomeDecision {
  if (matchesAppliedOutcome(existing, row, rowIds, rowFingerprint)) {
    return { status: "matched_success" };
  }

  if (matchesRetryableFailedOutcome(existing, row, rowFingerprint)) {
    return { status: "retry_failed_outcome" };
  }

  return {
    status: "conflict",
    reason: `CSV import row ${row.row_id.trim()} conflicts with existing outcome evidence`,
  };
}

export function matchesAppliedOutcome(
  existing: ExistingCsvImportRowOutcome,
  row: AcceptedParsedCsvRow,
  rowIds: MvpDCsvImportApplyRowIds,
  rowFingerprint: string,
): boolean {
  return (
    existing.lifecycle_type === row.lifecycle_type &&
    (existing.status_code === "applied" ||
      existing.status_code === "idempotent") &&
    existing.transaction_request_id === rowIds.transactionRequestId &&
    existing.lifecycle_event_id === rowIds.lifecycleEventId &&
    existing.row_fingerprint === rowFingerprint &&
    existing.error_message === null
  );
}

function matchesRetryableFailedOutcome(
  existing: ExistingCsvImportRowOutcome,
  row: AcceptedParsedCsvRow,
  rowFingerprint: string,
): boolean {
  return (
    existing.status_code === "failed" &&
    existing.lifecycle_type === row.lifecycle_type &&
    existing.row_fingerprint === rowFingerprint &&
    existing.transaction_request_id === null &&
    existing.lifecycle_event_id === null &&
    existing.error_message !== null
  );
}
