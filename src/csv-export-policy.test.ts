import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMvpDCsvExportAuditEvidence,
  classifyMvpDCsvExportSurface,
  evaluateMvpDCsvExportPolicy,
  exportSyntheticLifecycleCsv,
  type MvpDCsvExportInput,
  mvpDCsvExportAllowedFields,
  mvpDCsvExportDeniedFields,
  mvpDCsvExportDownloadPermission,
  mvpDCsvExportMaskingProfile,
  mvpDCsvExportRequiredPermission,
} from "./csv-export-policy.js";
import {
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-D CSV export helper boundaries classify allowed, denied, and unsupported surfaces", () => {
  assert.deepEqual(classifyMvpDCsvExportSurface("work_email"), {
    kind: "allowed_field",
    field: "work_email",
  });
  assert.deepEqual(classifyMvpDCsvExportSurface("rawPayload"), {
    kind: "denied_surface",
    normalizedSurface: "raw_payload",
  });
  assert.deepEqual(classifyMvpDCsvExportSurface("individual_number"), {
    kind: "unsupported_surface",
    normalizedSurface: "individual_number",
  });
});

test("MVP-D CSV export policy helper returns fail-closed denial reasons before auditing", () => {
  const baseline: MvpDCsvExportInput = {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-policy-helper",
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
    fields: ["row_id"],
    rows: [{ row_id: "csv-export-row-policy-helper" }],
  };

  assert.deepEqual(evaluateMvpDCsvExportPolicy(baseline), {
    outcome: "allowed",
    request: {
      scope: "repo_owned_synthetic_mvp_d_csv",
      requestedBy: "operator-mvp-d-csv-export",
      requestedAt: "2026-06-02T22:00:00+09:00",
      correlationId: "csv-export-correlation-policy-helper",
      fields: ["row_id"],
      rows: [{ row_id: "csv-export-row-policy-helper" }],
    },
  });

  assert.deepEqual(
    evaluateMvpDCsvExportPolicy({
      ...baseline,
      fields: ["raw_payload"],
    }),
    {
      outcome: "denied",
      reason: "denied_field_surface",
    },
  );
  assert.deepEqual(
    evaluateMvpDCsvExportPolicy({
      ...baseline,
      fields: ["unsupported_field"],
    }),
    {
      outcome: "denied",
      reason: "unsupported_field_surface",
    },
  );
  assert.deepEqual(
    evaluateMvpDCsvExportPolicy({
      ...baseline,
      permissions: [mvpDCsvExportRequiredPermission],
    }),
    {
      outcome: "denied",
      reason: "missing_required_permissions",
    },
  );
  assert.deepEqual(
    evaluateMvpDCsvExportPolicy({
      ...baseline,
      rows: [
        {
          row_id: "csv-export-row-policy-helper",
          data_marker: "real_employee_data",
        },
      ],
    }),
    {
      outcome: "denied",
      reason: "unsupported_row_surface",
    },
  );
  assert.deepEqual(
    evaluateMvpDCsvExportPolicy({
      ...baseline,
      fields: ["row_id", "display_name"],
      rows: [
        {
          row_id: "csv-export-row-policy-helper",
          display_name: "real_employee_data",
        },
      ],
    }),
    {
      outcome: "denied",
      reason: "real_or_regulated_row_value",
    },
  );
});

test("MVP-D CSV export audit helper builds deterministic evidence without writing audit rows", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const evaluation = evaluateMvpDCsvExportPolicy({
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-audit-helper",
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
    fields: ["row_id", "work_email"],
    rows: [
      {
        row_id: "csv-export-row-audit-helper",
        work_email: "csv.export.audit.helper@example.test",
      },
    ],
  });
  assert.equal(evaluation.outcome, "allowed");
  if (evaluation.outcome !== "allowed") {
    return;
  }

  const evidence = buildMvpDCsvExportAuditEvidence(
    db,
    evaluation.request,
    [
      "row_id,work_email",
      "csv-export-row-audit-helper,c***@example.test",
      "",
    ].join("\n"),
  );

  assert.match(evidence.auditEventId, /^audit-event-csv-export-/);
  assert.match(evidence.evidenceHash, /^[a-f0-9]{64}$/u);
  assert.equal(evidence.rowCount, 1);
  assert.equal(
    evidence.evidenceSubjectId,
    [
      "mvp-d-synthetic-csv-evidence",
      "fields-row_id+work_email",
      "rows-1",
      `masking-${mvpDCsvExportMaskingProfile}`,
      `sha256-${evidence.evidenceHash}`,
    ].join("-"),
  );
  assert.deepEqual(
    normalizeRows(db.prepare("SELECT * FROM audit_event").all()),
    [],
    "audit helper must not persist accepted download evidence by itself",
  );
});

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
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
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
  assert.match(result.audit.auditEventId, /^audit-event-csv-export-/);
  assert.match(result.audit.evidenceHash, /^[a-f0-9]{64}$/u);
  assert.equal(result.audit.maskingProfile, mvpDCsvExportMaskingProfile);
  assert.equal(result.audit.rowCount, 1);
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
      "# hrcore_export_surface,mvp_d_bounded_synthetic_csv",
      "# readiness,bounded_synthetic_only_not_production_ready",
      "# scope,repo_owned_synthetic_mvp_d_csv",
      `# audit_event_id,${result.audit.auditEventId}`,
      "# correlation_id,csv-export-correlation-001",
      "# requested_by,operator-mvp-d-csv-export",
      "# requested_at,2026-06-02T22:00:00+09:00",
      `# evidence_sha256,${result.audit.evidenceHash}`,
      "# row_count,1",
      "# masking_profile,work_email_local_part_masked_synthetic_only",
      '# exported_fields,"row_id,lifecycle_type,display_name,work_email,effective_date"',
      "",
      "row_id,lifecycle_type,display_name,work_email,effective_date",
      "csv-export-row-001,onboarding,CSV Export Synthetic One,c***@example.test,2026-07-01",
      "",
    ].join("\n"),
  );

  const auditRows = normalizeRows(
    db
      .prepare(
        `
          SELECT
            id,
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
  );
  assert.equal(auditRows.length, 1);
  assert.deepEqual(auditRows[0], {
    id: result.audit.auditEventId,
    actor_id: "operator-mvp-d-csv-export",
    action: "mvp_d.csv_export.synthetic_download_intent",
    subject_table: "lifecycle_event",
    subject_id: [
      "mvp-d-synthetic-csv-evidence",
      "fields-row_id+lifecycle_type+display_name+work_email+effective_date",
      "rows-1",
      `masking-${mvpDCsvExportMaskingProfile}`,
      `sha256-${result.audit.evidenceHash}`,
    ].join("-"),
    occurred_at: "2026-06-02T22:00:00+09:00",
    poc_marker: "synthetic_poc",
    correlation_id: "csv-export-correlation-001",
  });
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
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
    fields: ["row_id"],
    rows: [{ row_id: "csv-export-row-denied" }],
  } as const;

  for (const deniedInput of [
    { ...baseline, fields: ["raw_payload"] },
    { ...baseline, fields: ["my_number"] },
    { ...baseline, fields: ["live_provider_payload"] },
    { ...baseline, fields: ["unsupported_field"] },
    { ...baseline, permissions: [] },
    { ...baseline, permissions: [mvpDCsvExportRequiredPermission] },
    { ...baseline, permissions: [mvpDCsvExportDownloadPermission] },
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
    {
      ...baseline,
      rows: [
        {
          row_id: "csv-export-row-denied",
          display_name: "unrequested allowed key",
        },
      ],
    },
    {
      ...baseline,
      rows: [
        {
          row_id: "csv-export-row-denied",
          " row_id ": "csv-export-row-denied-shadow",
        },
      ],
    },
    {
      ...baseline,
      rows: [
        {
          row_id: "csv-export-row-denied",
          unclassified_export_payload: "synthetic",
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

test("MVP-D bounded synthetic CSV export rejects review row-key regressions before auditing", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const baseline: MvpDCsvExportInput = {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-review-regression",
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
    fields: ["row_id"],
    rows: [{ row_id: "csv-export-row-review-regression" }],
  };

  const rowKeyRegressionCases: ReadonlyArray<{
    name: string;
    input: MvpDCsvExportInput;
  }> = [
    {
      name: "unclassified individual-number alias",
      input: {
        ...baseline,
        rows: [
          {
            row_id: "csv-export-row-review-regression",
            individual_number: "synthetic",
          },
        ],
      },
    },
    {
      name: "unclassified medical-history alias",
      input: {
        ...baseline,
        rows: [
          {
            row_id: "csv-export-row-review-regression",
            medical_history: "synthetic",
          },
        ],
      },
    },
    {
      name: "untyped metadata side channel",
      input: {
        ...baseline,
        rows: [
          {
            row_id: "csv-export-row-review-regression",
            metadata: "synthetic",
          },
        ],
      },
    },
    {
      name: "whitespace-padded duplicate of selected row key",
      input: {
        ...baseline,
        rows: [
          {
            row_id: "csv-export-row-review-regression",
            " row_id ": "csv-export-row-review-regression-shadow",
          },
        ],
      },
    },
  ];

  for (const { name, input } of rowKeyRegressionCases) {
    await t.test(name, () => {
      assertDeniedWithoutAudit(db, input);
    });
  }
});

test("MVP-D bounded synthetic CSV export requires both export and download permissions before auditing", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const baseline: MvpDCsvExportInput = {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-permission-regression",
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
    fields: ["row_id"],
    rows: [{ row_id: "csv-export-row-permission-regression" }],
  };

  const permissionRegressionCases: ReadonlyArray<{
    name: string;
    input: MvpDCsvExportInput;
  }> = [
    {
      name: "missing both permissions",
      input: { ...baseline, permissions: [] },
    },
    {
      name: "missing download permission",
      input: {
        ...baseline,
        permissions: [mvpDCsvExportRequiredPermission],
      },
    },
    {
      name: "missing export permission",
      input: {
        ...baseline,
        permissions: [mvpDCsvExportDownloadPermission],
      },
    },
  ];

  for (const { name, input } of permissionRegressionCases) {
    await t.test(name, () => {
      assertDeniedWithoutAudit(db, input);
    });
  }
});

test("MVP-D bounded synthetic CSV export neutralizes spreadsheet formulas and gives each download a unique audit id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const input = {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-02T22:00:00+09:00",
    correlationId: "csv-export-correlation-repeatable",
    permissions: [
      mvpDCsvExportRequiredPermission,
      mvpDCsvExportDownloadPermission,
    ],
    fields: ["row_id", "display_name", "target_manager_reference"],
    rows: [
      {
        row_id: "csv-export-row-formula",
        display_name: '=HYPERLINK("https://example.test")',
        target_manager_reference: "+SUM(A1:A2)",
      },
    ],
  } as const;

  const first = exportSyntheticLifecycleCsv(db, input);
  const second = exportSyntheticLifecycleCsv(db, input);

  assert.notEqual(first.audit.auditEventId, second.audit.auditEventId);
  assert.ok(
    first.csv.includes(
      'csv-export-row-formula,"\'=HYPERLINK(""https://example.test"")",\'+SUM(A1:A2)',
    ),
  );
  assert.ok(first.csv.includes(`# audit_event_id,${first.audit.auditEventId}`));
  assert.ok(first.csv.includes("# requested_by,operator-mvp-d-csv-export"));
  assert.ok(first.csv.includes("# requested_at,2026-06-02T22:00:00+09:00"));
  assert.ok(
    first.csv.includes(`# masking_profile,${mvpDCsvExportMaskingProfile}`),
  );
  assert.ok(
    second.csv.includes(`# audit_event_id,${second.audit.auditEventId}`),
  );
  assert.equal(first.audit.evidenceHash, second.audit.evidenceHash);

  const rows = normalizeRows(
    db
      .prepare(
        `
          SELECT id, subject_id, correlation_id
          FROM audit_event
          WHERE correlation_id = 'csv-export-correlation-repeatable'
          ORDER BY id
        `,
      )
      .all(),
  );
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0]?.id, rows[1]?.id);
  assert.equal(
    rows[0]?.subject_id,
    [
      "mvp-d-synthetic-csv-evidence",
      "fields-row_id+display_name+target_manager_reference",
      "rows-1",
      `masking-${mvpDCsvExportMaskingProfile}`,
      `sha256-${first.audit.evidenceHash}`,
    ].join("-"),
  );
  assert.equal(rows[0]?.subject_id, rows[1]?.subject_id);
});

function assertDeniedWithoutAudit(
  db: Parameters<typeof exportSyntheticLifecycleCsv>[0],
  input: MvpDCsvExportInput,
): void {
  assert.throws(
    () => exportSyntheticLifecycleCsv(db, input),
    /CSV export request is outside the bounded synthetic MVP-D policy/,
  );

  assert.deepEqual(
    normalizeRows(db.prepare("SELECT * FROM audit_event").all?.() ?? []),
    [],
    "denied export attempts must not leave accepted download evidence",
  );
}
