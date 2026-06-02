import assert from "node:assert/strict";
import test from "node:test";

import {
  applySyntheticLifecycleCsvImport,
  dryRunSyntheticLifecycleCsvImport,
  mvpDCsvImportTemplateColumns,
} from "./csv-import-contract.js";
import {
  readLocalOpsJobStatus,
  recordLocalOpsOperatorDecision,
  rejectBroadLocalOpsJobSearch,
} from "./local-ops-job-status.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

function csv(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function terminationCsvInput(rowId: string): string {
  return csv([
    mvpDCsvImportTemplateColumns.join(","),
    [
      "mvp_d_lifecycle_support_v1",
      rowId,
      "termination",
      "repo_owned_synthetic_mvp_d_csv",
      `person-${rowId}`,
      "CSV Ops Synthetic",
      "2026-08-31",
      "",
      "",
      "",
      "",
      `assignment-current-${rowId}`,
      "",
      "",
      "",
      "resignation",
    ].join(","),
  ]);
}

test("MVP-D local ops job status exposes bounded CSV import evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  db.exec(`
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-csv-row-ops-001', 'CSV Ops Synthetic', '2026-06-01T00:00:00Z');
    INSERT INTO employment (
      id,
      person_id,
      employment_code,
      status_code,
      start_date,
      end_date
    )
    VALUES (
      'employment-csv-row-ops-001',
      'person-csv-row-ops-001',
      'EMP-CSV-OPS-001',
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
      'assignment-current-csv-row-ops-001',
      'person-csv-row-ops-001',
      'employment-csv-row-ops-001',
      'ASN-CSV-OPS-001',
      'organization-engineering',
      NULL,
      '2026-01-01',
      NULL
    );
  `);
  const csvInput = terminationCsvInput("csv-row-ops-001");
  const dryRun = dryRunSyntheticLifecycleCsvImport(csvInput);

  applySyntheticLifecycleCsvImport(db, {
    csvInput,
    dryRun,
    appliedAt: "2026-06-02T21:00:00+09:00",
    appliedBy: "operator-mvp-d-csv-import",
    correlationId: "csv-import-ops-correlation-001",
  });

  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-ops-correlation-001",
  });

  assert.equal(status.workflow, "csv_import");
  assert.equal(status.status, "applied");
  assert.equal(status.readiness, "bounded_synthetic_only_not_production_ready");
  assert.match(status.evidenceVersion, /^local-ops-evidence-/);
  assert.deepEqual(status.operatorEvidence, {
    actorId: "operator-mvp-d-csv-import",
    recordedAt: "2026-06-02T21:00:00+09:00",
    correlationId: "csv-import-ops-correlation-001",
  });
  assert.deepEqual(status.counts, {
    attempted: 1,
    applied: 1,
    failed: 0,
    skipped: 0,
  });
  assert.deepEqual(status.rows, [
    {
      rowId: "csv-row-ops-001",
      lifecycleType: "termination",
      status: "applied",
      correlationId:
        "csv-import-row-outcome-correlation-WyJjc3YtaW1wb3J0LW9wcy1jb3JyZWxhdGlvbi0wMDEiLCJjc3Ytcm93LW9wcy0wMDEiXQ",
      decidedAt: "2026-06-02T21:00:00+09:00",
      transactionRequestId: "csv-import-transaction-request-csv-row-ops-001",
      lifecycleEventId: "csv-import-lifecycle-event-csv-row-ops-001",
      errorMessage: null,
    },
  ]);
});

test("MVP-D local ops operator decisions require reason, current evidence, supported transition, and explicit lookup", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  db.exec(`
    INSERT INTO csv_import_job (
      id,
      correlation_id,
      import_fingerprint,
      template_version,
      tenant_environment_id,
      status_code,
      requested_at,
      requested_by,
      accepted_rows,
      failed_rows
    )
    VALUES (
      'csv-import-job-csv-import-ops-failed-001',
      'csv-import-ops-failed-001',
      'fingerprint-csv-import-ops-failed-001',
      'mvp_d_lifecycle_support_v1',
      'repo_owned_synthetic_mvp_d_csv',
      'failed',
      '2026-06-02T22:00:00+09:00',
      'operator-mvp-d-csv-import',
      0,
      1
    );
    INSERT INTO csv_import_row_outcome (
      id,
      job_id,
      row_id,
      lifecycle_type,
      status_code,
      transaction_request_id,
      lifecycle_event_id,
      row_fingerprint,
      error_message,
      correlation_id,
      decided_at
    )
    VALUES (
      'csv-import-row-outcome-ops-failed-001',
      'csv-import-job-csv-import-ops-failed-001',
      'csv-row-ops-failed-001',
      'transfer',
      'failed',
      NULL,
      NULL,
      'fingerprint-csv-row-ops-failed-001',
      'synthetic row conflict',
      'csv-import-row-outcome-correlation-ops-failed-001',
      '2026-06-02T22:00:00+09:00'
    );
  `);

  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-ops-failed-001",
  });
  assert.equal(status.status, "failed");

  assert.throws(
    () =>
      recordLocalOpsOperatorDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-ops-failed-001",
        decision: "acknowledge_failure",
        reason: " ",
        decidedAt: "2026-06-02T22:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "ops-decision-correlation-001",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops job operator decision requires a reason/,
  );

  assert.throws(
    () =>
      recordLocalOpsOperatorDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-ops-failed-001",
        decision: "acknowledge_failure",
        reason: "reviewed synthetic failure",
        decidedAt: "2026-06-02T22:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "ops-decision-correlation-001",
        expectedEvidenceVersion: "local-ops-evidence-stale",
      }),
    /local ops job operator decision requires current evidence/,
  );

  assert.throws(
    () =>
      recordLocalOpsOperatorDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-ops-failed-001",
        decision: "production_dlq_replay" as "acknowledge_failure",
        reason: "production DLQ action must stay blocked",
        decidedAt: "2026-06-02T22:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "ops-decision-correlation-001",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops job operator decision rejects unsupported transition/,
  );

  assert.throws(
    () => rejectBroadLocalOpsJobSearch({ workflow: "csv_import" }),
    /local ops job status requires explicit workflow and correlation id/,
  );

  const decision = recordLocalOpsOperatorDecision(db, {
    workflow: "csv_import",
    correlationId: "csv-import-ops-failed-001",
    decision: "escalate_for_manual_review",
    reason: "synthetic row conflict needs manual review",
    decidedAt: "2026-06-02T22:05:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "ops-decision-correlation-001",
    expectedEvidenceVersion: status.evidenceVersion,
  });

  assert.equal(
    decision.action,
    "mvp_d.ops_job.operator_decision.csv_import.escalate_for_manual_review",
  );
  assert.match(decision.auditEventId, /^audit-event-local-ops-/);
  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT
              actor_id,
              action,
              subject_table,
              occurred_at,
              poc_marker,
              correlation_id
            FROM audit_event
            ORDER BY id
          `,
        )
        .all(),
    ),
    [
      {
        actor_id: "operator-mvp-d-csv-import",
        action:
          "mvp_d.ops_job.operator_decision.csv_import.escalate_for_manual_review",
        subject_table: "lifecycle_event",
        occurred_at: "2026-06-02T22:05:00+09:00",
        poc_marker: "synthetic_poc",
        correlation_id: "ops-decision-correlation-001",
      },
    ],
  );
});

test("MVP-D local ops rejects production-only DLQ actions without durable writes", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  assert.throws(
    () =>
      readLocalOpsJobStatus(db, {
        workflow: "production_dlq" as "csv_import",
        correlationId: "production-dlq-001",
      }),
    /local ops job status does not support broad audit search/,
  );

  assert.deepEqual(
    normalizeRow(db.prepare("SELECT count(*) AS count FROM audit_event").get()),
    { count: 0 },
  );
});
