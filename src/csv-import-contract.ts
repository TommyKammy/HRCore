import {
  buildMvpDCsvImportDryRunResult,
  evaluateMvpDCsvImportRows,
  type MvpDCsvImportDryRunResult,
} from "./csv-import-contract-helpers.js";

export { applySyntheticLifecycleCsvImport } from "./csv-import-apply.js";

export {
  evaluateMvpDCsvImportRows,
  mvpDCsvImportTemplateColumns,
  mvpDCsvImportTemplateVersion,
  mvpDCsvImportTenantEnvironmentId,
} from "./csv-import-contract-helpers.js";

export type {
  MvpDCsvImportAcceptedRow,
  MvpDCsvImportDryRunDiff,
  MvpDCsvImportDryRunResult,
  MvpDCsvImportRejectedRow,
  MvpDCsvLifecycleType,
} from "./csv-import-contract-helpers.js";

export type {
  MvpDCsvImportAppliedRow,
  MvpDCsvImportApplyInput,
  MvpDCsvImportApplyResult,
  MvpDCsvImportFailedApplyRow,
} from "./csv-import-apply-types.js";

export function dryRunSyntheticLifecycleCsvImport(
  csvInput: string,
): MvpDCsvImportDryRunResult {
  return buildMvpDCsvImportDryRunResult(evaluateMvpDCsvImportRows(csvInput));
}
