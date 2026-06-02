import assert from "node:assert/strict";
import test from "node:test";

import {
  dryRunSyntheticLifecycleCsvImport,
  mvpDCsvImportTemplateColumns,
} from "./csv-import-contract.js";

function csv(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

test("MVP-D CSV dry-run parses bounded synthetic lifecycle rows without applying changes", () => {
  const result = dryRunSyntheticLifecycleCsvImport(
    csv([
      mvpDCsvImportTemplateColumns.join(","),
      [
        "mvp_d_lifecycle_support_v1",
        "csv-row-001",
        "onboarding",
        "repo_owned_synthetic_mvp_d_csv",
        "person-csv-001",
        "CSV Synthetic One",
        "2026-07-01",
        "EMP-CSV-001",
        "ASN-CSV-001",
        "organization-engineering",
        "csv.synthetic.one@example.test",
        "",
        "",
        "",
        "",
        "",
      ].join(","),
      [
        "mvp_d_lifecycle_support_v1",
        "csv-row-002",
        "transfer",
        "repo_owned_synthetic_mvp_d_csv",
        "person-csv-002",
        "CSV Synthetic Two",
        "2026-07-15",
        "",
        "",
        "",
        "",
        "assignment-current-csv-002",
        "organization-product",
        "department-product",
        "manager-product-001",
        "team_change",
      ].join(","),
    ]),
  );

  assert.equal(result.mutatesRecords, false);
  assert.deepEqual(result.summary, {
    acceptedRows: 2,
    rejectedRows: 0,
  });
  assert.deepEqual(result.rejectedRows, []);
  assert.deepEqual(
    result.acceptedRows.map((row) => row.rowId),
    ["csv-row-001", "csv-row-002"],
  );
  assert.deepEqual(result.diffs, [
    {
      rowId: "csv-row-001",
      lifecycleType: "onboarding",
      operation: "would_create_onboarding_request",
      evidence: {
        personId: "person-csv-001",
        effectiveDate: "2026-07-01",
        correlationId: "csv-import-csv-row-001",
      },
    },
    {
      rowId: "csv-row-002",
      lifecycleType: "transfer",
      operation: "would_create_transfer_request",
      evidence: {
        personId: "person-csv-002",
        effectiveDate: "2026-07-15",
        correlationId: "csv-import-csv-row-002",
      },
    },
  ]);
});

test("MVP-D CSV dry-run reports deterministic validation reasons without mutating", () => {
  const result = dryRunSyntheticLifecycleCsvImport(
    csv([
      mvpDCsvImportTemplateColumns.join(","),
      [
        "mvp_d_lifecycle_support_v1",
        "csv-row-duplicate",
        "onboarding",
        "repo_owned_synthetic_mvp_d_csv",
        "person-csv-duplicate",
        "CSV Duplicate One",
        "2026-02-30",
        "EMP-CSV-DUP",
        "ASN-CSV-DUP",
        "organization-engineering",
        "csv.duplicate@example.test",
        "",
        "",
        "",
        "",
        "",
      ].join(","),
      [
        "mvp_d_lifecycle_support_v1",
        "csv-row-duplicate",
        "termination",
        "repo_owned_synthetic_mvp_d_csv",
        "person-csv-duplicate",
        "CSV Duplicate Two",
        "2026-08-01",
        "",
        "",
        "",
        "",
        "assignment-current-csv-duplicate",
        "",
        "",
        "",
        "hard_delete",
      ].join(","),
    ]),
  );

  assert.equal(result.mutatesRecords, false);
  assert.deepEqual(result.summary, {
    acceptedRows: 0,
    rejectedRows: 2,
  });
  assert.deepEqual(result.rejectedRows, [
    {
      rowNumber: 2,
      rowId: "csv-row-duplicate",
      reasons: ["effective_date must be an ISO date"],
    },
    {
      rowNumber: 3,
      rowId: "csv-row-duplicate",
      reasons: [
        "row_id duplicates an earlier row",
        "termination_reason_code must be resignation, retirement, contract_end, or mutual_agreement",
      ],
    },
  ]);
  assert.deepEqual(result.acceptedRows, []);
  assert.deepEqual(result.diffs, []);
});

test("MVP-D CSV dry-run normalizes lifecycle type before emitting diffs", () => {
  const result = dryRunSyntheticLifecycleCsvImport(
    csv([
      mvpDCsvImportTemplateColumns.join(","),
      [
        "mvp_d_lifecycle_support_v1",
        "csv-row-normalized",
        " transfer ",
        "repo_owned_synthetic_mvp_d_csv",
        "person-csv-normalized",
        "CSV Normalized",
        "2026-07-15",
        "",
        "",
        "",
        "",
        "assignment-current-csv-normalized",
        "organization-product",
        "department-product",
        "manager-product-001",
        "team_change",
      ].join(","),
    ]),
  );

  assert.deepEqual(result.acceptedRows, [
    {
      rowNumber: 2,
      rowId: "csv-row-normalized",
      lifecycleType: "transfer",
    },
  ]);
  assert.deepEqual(result.diffs, [
    {
      rowId: "csv-row-normalized",
      lifecycleType: "transfer",
      operation: "would_create_transfer_request",
      evidence: {
        personId: "person-csv-normalized",
        effectiveDate: "2026-07-15",
        correlationId: "csv-import-csv-row-normalized",
      },
    },
  ]);
});

test("MVP-D CSV dry-run fails closed on unsupported prohibited fields and malformed CSV", () => {
  for (const prohibitedColumn of [
    "realEmployeeData",
    "regulatedData",
    "rawPayload",
    "rawProviderPayload",
    "retentionJob",
    "deletionJob",
    "liveProviderPayload",
    "futureExtension",
  ]) {
    assert.throws(
      () =>
        dryRunSyntheticLifecycleCsvImport(
          csv([
            `${mvpDCsvImportTemplateColumns.join(",")},${prohibitedColumn}`,
            `mvp_d_lifecycle_support_v1,csv-row-prohibited,onboarding,repo_owned_synthetic_mvp_d_csv,person-csv-prohibited,CSV Prohibited,2026-07-01,EMP-CSV-PROHIBITED,ASN-CSV-PROHIBITED,organization-engineering,csv.prohibited@example.test,,,,,,blocked`,
          ]),
        ),
      new RegExp(
        `CSV header contains unsupported columns: ${prohibitedColumn}`,
      ),
    );
  }

  assert.throws(
    () =>
      dryRunSyntheticLifecycleCsvImport(
        `${mvpDCsvImportTemplateColumns.join(",")}\n"unterminated`,
      ),
    /CSV input is malformed: unterminated quoted field/,
  );

  assert.throws(
    () =>
      dryRunSyntheticLifecycleCsvImport(
        `${mvpDCsvImportTemplateColumns.join(",")}\n"person-1"extra,2026-07-01`,
      ),
    /CSV input is malformed: characters after closing quoted field/,
  );
});

test("MVP-D CSV dry-run rejects duplicate headers before mapping rows", () => {
  assert.throws(
    () =>
      dryRunSyntheticLifecycleCsvImport(
        csv([
          `${mvpDCsvImportTemplateColumns.join(",")},lifecycle_type`,
          `mvp_d_lifecycle_support_v1,csv-row-duplicate-header,onboarding,repo_owned_synthetic_mvp_d_csv,person-csv-duplicate-header,CSV Duplicate Header,2026-07-01,EMP-CSV-DUPLICATE-HEADER,ASN-CSV-DUPLICATE-HEADER,organization-engineering,csv.duplicate.header@example.test,,,,,,transfer`,
        ]),
      ),
    /CSV header contains duplicate columns: lifecycle_type/,
  );
});
