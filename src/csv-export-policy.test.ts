import assert from "node:assert/strict";
import test from "node:test";

import {
  exportSyntheticLifecycleCsv,
  mvpDCsvExportAllowedFields,
  mvpDCsvExportDeniedFields,
} from "./csv-export-policy.js";
import {
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-D bounded synthetic CSV export succeeds only for explicit allowed fields and records audit evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const result = exportSyntheticLifecycleCsv(db, {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-001",
    fields: [
      "row_id",
      "lifecycle_type",
      "display_name",
      "work_email",
      "effective_date",
    ],
    rows: [
      {
        row_id: "csv-export-row-001",
        lifecycle_type: "onboarding",
        display_name: "CSV Export Synthetic One",
        work_email: "csv.export.synthetic.one@example.test",
        effective_date: "2026-07-01",
      },
    ],
  });

  assert.equal(result.contentType, "text/csv; charset=utf-8");
  assert.equal(result.fileName, "mvp-d-synthetic-lifecycle-export.csv");
  assert.equal(result.readiness, "bounded_synthetic_only_not_production_ready");
  assert.equal(result.audit.downloadIntent, "synthetic_bounded_csv_export");
  assert.deepEqual(result.audit.exportedFields, [
    "row_id",
    "lifecycle_type",
    "display_name",
    "work_email",
    "effective_date",
  ]);
  assert.equal(
    result.csv,
    [
      "row_id,lifecycle_type,display_name,work_email,effective_date",
      "csv-export-row-001,onboarding,CSV Export Synthetic One,c***@example.test,2026-07-01",
      "",
    ].join("\n"),
  );

  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT
              actor_id,
              action,
              subject_table,
              subject_id,
              occurred_at,
              poc_marker,
              correlation_id
            FROM audit_event
            WHERE correlation_id = 'csv-export-correlation-001'
          `,
        )
        .all(),
    ),
    [
      {
        actor_id: "operator-mvp-d-csv-export",
        action: "mvp_d.csv_export.synthetic_download_intent",
        subject_table: "lifecycle_event",
        subject_id: "repo_owned_synthetic_mvp_d_csv",
        occurred_at: "2026-06-02T22:00:00+09:00",
        poc_marker: "synthetic_poc",
        correlation_id: "csv-export-correlation-001",
      },
    ],
  );
});

test("MVP-D bounded synthetic CSV export fails closed on raw, regulated, real-data, live-provider, broad, and unsupported requests", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  assert.deepEqual(mvpDCsvExportAllowedFields, [
    "row_id",
    "lifecycle_type",
    "person_id",
    "display_name",
    "effective_date",
    "employment_code",
    "assignment_code",
    "organization_reference",
    "work_email",
    "current_assignment_id",
    "target_organization_reference",
    "target_department_reference",
    "target_manager_reference",
    "reason_code",
  ]);
  assert.ok(mvpDCsvExportDeniedFields.includes("raw_payload"));
  assert.ok(mvpDCsvExportDeniedFields.includes("live_provider_payload"));
  assert.ok(mvpDCsvExportDeniedFields.includes("my_number"));

  const baseline = {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-denied",
    fields: ["row_id"],
    rows: [{ row_id: "csv-export-row-denied" }],
  } as const;

  for (const deniedInput of [
    { ...baseline, fields: ["raw_payload"] },
    { ...baseline, fields: ["my_number"] },
    { ...baseline, fields: ["live_provider_payload"] },
    { ...baseline, fields: ["unsupported_field"] },
    { ...baseline, scope: "all" },
    { ...baseline, scope: "production" },
    {
      ...baseline,
      rows: [
        {
          row_id: "csv-export-row-denied",
          data_marker: "real_employee_data",
        },
      ],
    },
    {
      ...baseline,
      rows: [
        {
          row_id: "csv-export-row-denied",
          regulated_data_marker: "my_number",
        },
      ],
    },
  ]) {
    assert.throws(
      () => exportSyntheticLifecycleCsv(db, deniedInput),
      /CSV export request is outside the bounded synthetic MVP-D policy/,
    );
  }

  assert.deepEqual(
    normalizeRows(db.prepare("SELECT * FROM audit_event").all()),
    [],
    "denied export attempts must not leave download intent evidence",
  );
});
