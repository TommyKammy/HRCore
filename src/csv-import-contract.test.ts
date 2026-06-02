import assert from "node:assert/strict";
import test from "node:test";

import {
  applySyntheticLifecycleCsvImport,
  dryRunSyntheticLifecycleCsvImport,
  mvpDCsvImportTemplateColumns,
} from "./csv-import-contract.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

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

test("MVP-D CSV apply persists accepted dry-run rows once and records row outcome evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-csv-apply-001', 'CSV Apply Synthetic One', '2026-06-01T00:00:00Z');
    INSERT INTO employment (
      id,
      person_id,
      employment_code,
      status_code,
      start_date,
      end_date
    )
    VALUES (
      'employment-csv-apply-001',
      'person-csv-apply-001',
      'EMP-CURRENT-CSV-APPLY-001',
      'active',
      '2026-01-01',
      NULL
    );
    INSERT INTO assignment (
      id,
      person_id,
      employment_id,
      assignment_code,
      organization_code,
      position_code,
      start_date,
      end_date
    )
    VALUES (
      'assignment-current-csv-apply-001',
      'person-csv-apply-001',
      'employment-csv-apply-001',
      'ASN-CURRENT-CSV-APPLY-001',
      'organization-engineering',
      NULL,
      '2026-01-01',
      NULL
    );
  `);

  const csvInput = csv([
    mvpDCsvImportTemplateColumns.join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-apply-001",
      "termination",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-apply-001",
      "CSV Apply Synthetic One",
      "2026-08-31",
      "",
      "",
      "",
      "",
      "assignment-current-csv-apply-001",
      "",
      "",
      "",
      "resignation",
    ].join(","),
  ]);
  const dryRun = dryRunSyntheticLifecycleCsvImport(csvInput);

  const firstApply = applySyntheticLifecycleCsvImport(db, {
    csvInput,
    dryRun,
    appliedAt: "2026-06-02T12:00:00Z",
    appliedBy: "operator-mvp-d-csv-import",
    correlationId: "csv-import-apply-correlation-001",
  });
  const secondApply = applySyntheticLifecycleCsvImport(db, {
    csvInput,
    dryRun,
    appliedAt: "2026-06-02T12:05:00Z",
    appliedBy: "operator-mvp-d-csv-import",
    correlationId: "csv-import-apply-correlation-001",
  });

  assert.deepEqual(firstApply.summary, {
    appliedRows: 1,
    failedRows: 0,
    idempotentRows: 0,
  });
  assert.deepEqual(secondApply.summary, {
    appliedRows: 0,
    failedRows: 0,
    idempotentRows: 1,
  });

  const lifecycleRows = normalizeRows(
    db
      .prepare(
        `
          SELECT
            person.display_name,
            transaction_request.request_type,
            transaction_request.status_code,
            lifecycle_event.event_type,
            lifecycle_event.effective_date,
            audit_event.action,
            audit_event.correlation_id
          FROM lifecycle_event
          JOIN person ON person.id = lifecycle_event.person_id
          JOIN transaction_request
            ON transaction_request.id = lifecycle_event.transaction_request_id
          JOIN audit_event ON audit_event.subject_id = lifecycle_event.id
          ORDER BY lifecycle_event.id
        `,
      )
      .all(),
  );

  assert.deepEqual(lifecycleRows, [
    {
      display_name: "CSV Apply Synthetic One",
      request_type: "terminate",
      status_code: "completed",
      event_type: "termination",
      effective_date: "2026-08-31",
      action: "mvp_d.csv_import.apply_row",
      correlation_id: "csv-import-apply-correlation-001",
    },
  ]);

  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT
              row_id,
              lifecycle_type,
              status_code,
              transaction_request_id,
              lifecycle_event_id,
              error_message
            FROM csv_import_row_outcome
            ORDER BY row_id
          `,
        )
        .all(),
    ),
    [
      {
        row_id: "csv-row-apply-001",
        lifecycle_type: "termination",
        status_code: "applied",
        transaction_request_id:
          "csv-import-transaction-request-csv-row-apply-001",
        lifecycle_event_id: "csv-import-lifecycle-event-csv-row-apply-001",
        error_message: null,
      },
    ],
  );
});

test("MVP-D CSV apply fails closed when the dry-run no longer matches the CSV input", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const originalCsvInput = csv([
    mvpDCsvImportTemplateColumns.join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-stale-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-stale-001",
      "CSV Stale Original",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-csv-stale-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "team_change",
    ].join(","),
  ]);
  const staleDryRun = dryRunSyntheticLifecycleCsvImport(originalCsvInput);
  const changedCsvInput = originalCsvInput.replace("2026-07-15", "2026-07-16");

  assert.throws(
    () =>
      applySyntheticLifecycleCsvImport(db, {
        csvInput: changedCsvInput,
        dryRun: staleDryRun,
        appliedAt: "2026-06-02T12:00:00Z",
        appliedBy: "operator-mvp-d-csv-import",
        correlationId: "csv-import-apply-correlation-stale",
      }),
    /CSV import apply requires a current dry-run result for the exact CSV input/,
  );

  for (const tableName of [
    "csv_import_job",
    "csv_import_row_outcome",
    "transaction_request",
    "lifecycle_event",
    "audit_event",
  ]) {
    assert.deepEqual(
      normalizeRow(
        db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
      ),
      { count: 0 },
      `${tableName} must remain clean after stale dry-run rejection`,
    );
  }
});

test("MVP-D CSV apply records row-level failures without leaving partial lifecycle state", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  db.prepare(
    `
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-csv-conflict-001', 'Existing Synthetic Person', '2026-06-01T00:00:00Z')
    `,
  ).run();

  const csvInput = csv([
    mvpDCsvImportTemplateColumns.join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-conflict-001",
      "onboarding",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-conflict-001",
      "CSV Conflicting Person",
      "2026-07-01",
      "EMP-CSV-CONFLICT-001",
      "ASN-CSV-CONFLICT-001",
      "organization-engineering",
      "csv.conflict@example.test",
      "",
      "",
      "",
      "",
      "",
    ].join(","),
  ]);
  const dryRun = dryRunSyntheticLifecycleCsvImport(csvInput);

  const result = applySyntheticLifecycleCsvImport(db, {
    csvInput,
    dryRun,
    appliedAt: "2026-06-02T12:00:00Z",
    appliedBy: "operator-mvp-d-csv-import",
    correlationId: "csv-import-apply-correlation-conflict",
  });

  assert.deepEqual(result.summary, {
    appliedRows: 0,
    failedRows: 1,
    idempotentRows: 0,
  });
  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT row_id, lifecycle_type, status_code, error_message
            FROM csv_import_row_outcome
          `,
        )
        .all(),
    ),
    [
      {
        row_id: "csv-row-conflict-001",
        lifecycle_type: "onboarding",
        status_code: "failed",
        error_message: "UNIQUE constraint failed: person.id",
      },
    ],
  );

  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT status_code, accepted_rows, failed_rows
            FROM csv_import_job
            WHERE correlation_id = 'csv-import-apply-correlation-conflict'
          `,
        )
        .get(),
    ),
    {
      status_code: "failed",
      accepted_rows: 0,
      failed_rows: 1,
    },
  );

  for (const tableName of [
    "transaction_request",
    "lifecycle_event",
    "audit_event",
  ]) {
    assert.deepEqual(
      normalizeRow(
        db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
      ),
      { count: 0 },
      `${tableName} must remain clean after row failure`,
    );
  }
});

test("MVP-D CSV apply fails closed for invalid lifecycle references", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const csvInput = csv([
    mvpDCsvImportTemplateColumns.join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-invalid-reference-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-missing-assignment-001",
      "CSV Missing Assignment",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-missing-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "team_change",
    ].join(","),
  ]);
  const dryRun = dryRunSyntheticLifecycleCsvImport(csvInput);

  const result = applySyntheticLifecycleCsvImport(db, {
    csvInput,
    dryRun,
    appliedAt: "2026-06-02T12:00:00Z",
    appliedBy: "operator-mvp-d-csv-import",
    correlationId: "csv-import-apply-correlation-invalid-reference",
  });

  assert.deepEqual(result.summary, {
    appliedRows: 0,
    failedRows: 1,
    idempotentRows: 0,
  });
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT status_code, error_message
            FROM csv_import_row_outcome
            WHERE row_id = 'csv-row-invalid-reference-001'
          `,
        )
        .get(),
    ),
    {
      status_code: "failed",
      error_message:
        "CSV import apply requires current_assignment_id to match an existing assignment for the person",
    },
  );

  for (const tableName of [
    "person",
    "transaction_request",
    "lifecycle_event",
    "audit_event",
  ]) {
    assert.deepEqual(
      normalizeRow(
        db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get(),
      ),
      { count: 0 },
      `${tableName} must remain clean after invalid reference failure`,
    );
  }
});
