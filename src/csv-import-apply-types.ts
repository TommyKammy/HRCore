import type { AcceptedParsedCsvRow } from "./csv-import-contract-helpers.js";
import type {
  MvpDCsvImportDryRunResult,
  MvpDCsvLifecycleType,
} from "./csv-import-contract-helpers.js";

export interface MvpDCsvImportApplyInput {
  csvInput: string;
  dryRun: MvpDCsvImportDryRunResult;
  appliedAt: string;
  appliedBy: string;
  correlationId: string;
}

export interface MvpDCsvImportAppliedRow {
  rowId: string;
  lifecycleType: MvpDCsvLifecycleType;
  status: "applied" | "idempotent";
  transactionRequestId: string;
  lifecycleEventId: string;
}

export interface MvpDCsvImportFailedApplyRow {
  rowId: string;
  lifecycleType: MvpDCsvLifecycleType;
  status: "failed";
  reason: string;
}

export interface MvpDCsvImportApplyResult {
  summary: {
    appliedRows: number;
    failedRows: number;
    idempotentRows: number;
  };
  rows: Array<MvpDCsvImportAppliedRow | MvpDCsvImportFailedApplyRow>;
  correlationId: string;
}

export type ExistingCsvImportRowOutcome = {
  row_id: string;
  lifecycle_type: string;
  status_code: string;
  transaction_request_id: string | null;
  lifecycle_event_id: string | null;
  error_message: string | null;
  row_fingerprint: string;
};

export type ExistingCsvImportJob = {
  correlation_id: string;
  import_fingerprint: string;
};

export type NormalizedMvpDCsvImportApplyInput = MvpDCsvImportApplyInput & {
  appliedAt: string;
  appliedBy: string;
  correlationId: string;
};

export type MvpDCsvImportApplyRowIds = {
  transactionRequestId: string;
  lifecycleEventId: string;
  auditEventId: string;
  rowCorrelationId: string;
};

export type MvpDCsvImportApplyJobRowIds = {
  rowOutcomeId: string;
  rowOutcomeCorrelationId: string;
};

export type MvpDCsvImportApplyRowContext = {
  row: AcceptedParsedCsvRow;
  rowIds: MvpDCsvImportApplyRowIds;
  jobRowIds: MvpDCsvImportApplyJobRowIds;
  rowFingerprint: string;
};
