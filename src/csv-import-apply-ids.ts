import { encodeStableKey } from "./onboarding-transaction-request-shared.js";
import type { AcceptedParsedCsvRow } from "./csv-import-contract-helpers.js";
import type {
  MvpDCsvImportApplyInput,
  MvpDCsvImportApplyJobRowIds,
  MvpDCsvImportApplyRowIds,
} from "./csv-import-apply-types.js";

export function buildApplyRowIds(
  row: AcceptedParsedCsvRow,
): MvpDCsvImportApplyRowIds {
  const rowId = row.row_id.trim();
  return {
    transactionRequestId: `csv-import-transaction-request-${rowId}`,
    lifecycleEventId: `csv-import-lifecycle-event-${rowId}`,
    auditEventId: `audit-event-csv-import-lifecycle-event-${rowId}-applied`,
    rowCorrelationId: `csv-import-${rowId}`,
  };
}

export function buildApplyJobRowIds(
  input: MvpDCsvImportApplyInput,
  row: AcceptedParsedCsvRow,
): MvpDCsvImportApplyJobRowIds {
  const rowId = row.row_id.trim();
  const rowOutcomeKey = encodeStableKey([input.correlationId, rowId]);
  return {
    rowOutcomeId: `csv-import-row-outcome-${rowOutcomeKey}`,
    rowOutcomeCorrelationId: `csv-import-row-outcome-correlation-${rowOutcomeKey}`,
  };
}

export function buildCsvImportJobId(correlationId: string): string {
  return `csv-import-job-${correlationId}`;
}
