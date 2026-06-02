import assert from "node:assert/strict";
import test from "node:test";

import {
  dryRunSyntheticLifecycleCsvImport,
  mvpDCsvImportTemplateColumns,
} from "./csv-import-contract.js";
import {
  exportSyntheticLifecycleCsv,
  mvpDCsvExportRequiredPermission,
} from "./csv-export-policy.js";
import {
  recordLocalOpsFailureDecision,
  readLocalOpsJobStatus,
  recordLocalOpsOperatorDecision,
} from "./local-ops-job-status.js";
import {
  MvpDCsvOpsDlqTraceabilityError,
  verifyMvpDCsvOpsDlqTraceability,
  type MvpDDeniedCsvExportGuardEvidence,
} from "./mvp-d-csv-ops-dlq-traceability.js";
import {
  normalizeRow,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

function csv(lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

function mixedDryRunCsvInput(): string {
  return csv([
    mvpDCsvImportTemplateColumns.join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-trace-applied-001",
      "termination",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-row-trace-applied-001",
      "CSV Trace Applied",
      "2026-08-31",
      "",
      "",
      "",
      "",
      "assignment-current-csv-row-trace-applied-001",
      "",
      "",
      "",
      "resignation",
    ].join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-trace-retry-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-row-trace-retry-001",
      "CSV Trace Retry",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-csv-row-trace-retry-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "team_change",
    ].join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-trace-replay-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-row-trace-replay-001",
      "CSV Trace Replay",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-csv-row-trace-replay-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "team_change",
    ].join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-trace-ignore-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-row-trace-ignore-001",
      "CSV Trace Ignore",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-csv-row-trace-ignore-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "team_change",
    ].join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-trace-close-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-row-trace-close-001",
      "CSV Trace Close",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-csv-row-trace-close-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "team_change",
    ].join(","),
    [
      "mvp_d_lifecycle_support_v1",
      "csv-row-trace-rejected-001",
      "transfer",
      "repo_owned_synthetic_mvp_d_csv",
      "person-csv-row-trace-rejected-001",
      "CSV Trace Rejected",
      "2026-07-15",
      "",
      "",
      "",
      "",
      "assignment-current-csv-row-trace-rejected-001",
      "organization-product",
      "department-product",
      "manager-product-001",
      "unsupported_reason",
    ].join(","),
  ]);
}

test("MVP-D CSV/Ops/DLQ traceability verifier covers bounded synthetic success, rejection, denied export, operator action, and DLQ paths", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const jobCorrelationId = "csv-import-trace-job-001";
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
      'csv-import-job-trace-001',
      '${jobCorrelationId}',
      'fingerprint-csv-import-job-trace-001',
      'mvp_d_lifecycle_support_v1',
      'repo_owned_synthetic_mvp_d_csv',
      'failed',
      '2026-06-03T12:00:00+09:00',
      'operator-mvp-d-csv-import',
      1,
      4
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
    VALUES
      (
        'csv-import-row-outcome-trace-applied-001',
        'csv-import-job-trace-001',
        'csv-row-trace-applied-001',
        'termination',
        'applied',
        'csv-import-transaction-request-csv-row-trace-applied-001',
        'csv-import-lifecycle-event-csv-row-trace-applied-001',
        'fingerprint-csv-row-trace-applied-001',
        NULL,
        'csv-import-row-outcome-correlation-trace-applied-001',
        '2026-06-03T12:00:00+09:00'
      ),
      (
        'csv-import-row-outcome-trace-retry-001',
        'csv-import-job-trace-001',
        'csv-row-trace-retry-001',
        'transfer',
        'failed',
        NULL,
        NULL,
        'fingerprint-csv-row-trace-retry-001',
        'synthetic transfer target missing',
        'csv-import-row-outcome-correlation-trace-retry-001',
        '2026-06-03T12:00:00+09:00'
      ),
      (
        'csv-import-row-outcome-trace-replay-001',
        'csv-import-job-trace-001',
        'csv-row-trace-replay-001',
        'transfer',
        'failed',
        NULL,
        NULL,
        'fingerprint-csv-row-trace-replay-001',
        'synthetic transfer target missing',
        'csv-import-row-outcome-correlation-trace-replay-001',
        '2026-06-03T12:00:00+09:00'
      ),
      (
        'csv-import-row-outcome-trace-ignore-001',
        'csv-import-job-trace-001',
        'csv-row-trace-ignore-001',
        'transfer',
        'failed',
        NULL,
        NULL,
        'fingerprint-csv-row-trace-ignore-001',
        'synthetic transfer target missing',
        'csv-import-row-outcome-correlation-trace-ignore-001',
        '2026-06-03T12:00:00+09:00'
      ),
      (
        'csv-import-row-outcome-trace-close-001',
        'csv-import-job-trace-001',
        'csv-row-trace-close-001',
        'transfer',
        'failed',
        NULL,
        NULL,
        'fingerprint-csv-row-trace-close-001',
        'synthetic transfer target missing',
        'csv-import-row-outcome-correlation-trace-close-001',
        '2026-06-03T12:00:00+09:00'
      );
  `);

  const dryRun = dryRunSyntheticLifecycleCsvImport(mixedDryRunCsvInput());
  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
  });
  assert.equal(status.counts.applied, 1);
  assert.equal(status.counts.failed, 4);

  recordLocalOpsOperatorDecision(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
    decision: "acknowledge_failure",
    reason: "bounded synthetic traceability failure reviewed",
    decidedAt: "2026-06-03T12:01:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "ops-decision-correlation-trace-001",
    expectedEvidenceVersion: status.evidenceVersion,
  });
  for (const [decision, rowId, decidedAt] of [
    ["retry", "csv-row-trace-retry-001", "2026-06-03T12:02:00+09:00"],
    ["replay", "csv-row-trace-replay-001", "2026-06-03T12:03:00+09:00"],
    ["ignore", "csv-row-trace-ignore-001", "2026-06-03T12:04:00+09:00"],
    ["close", "csv-row-trace-close-001", "2026-06-03T12:05:00+09:00"],
  ] as const) {
    recordLocalOpsFailureDecision(db, {
      workflow: "csv_import",
      correlationId: jobCorrelationId,
      rowId,
      decision,
      reason: `bounded synthetic ${decision} decision`,
      decidedAt,
      decidedBy: "operator-mvp-d-csv-import",
      decisionCorrelationId: `dlq-decision-correlation-trace-${decision}-001`,
      expectedEvidenceVersion: status.evidenceVersion,
    });
  }

  const deniedExport = captureDeniedExportEvidence(db);
  const trace = verifyMvpDCsvOpsDlqTraceability(db, {
    dryRun,
    appliedJobCorrelationId: jobCorrelationId,
    deniedExport,
    requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
  });

  assert.equal(trace.readiness, "bounded_synthetic_only_not_production_ready");
  assert.deepEqual(trace.dryRun.acceptedRowIds, [
    "csv-row-trace-applied-001",
    "csv-row-trace-retry-001",
    "csv-row-trace-replay-001",
    "csv-row-trace-ignore-001",
    "csv-row-trace-close-001",
  ]);
  assert.deepEqual(trace.dryRun.rejectedRowIds, ["csv-row-trace-rejected-001"]);
  assert.deepEqual(
    trace.failureDecisions.map((decision) => decision.decision),
    ["retry", "replay", "ignore", "close"],
  );
  assert.equal(trace.deniedExport.auditEventCountAfter, 0);

  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun: { ...dryRun, diffs: dryRun.diffs.slice(1) },
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires dry-run diff evidence for every accepted row",
  );

  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun: {
          ...dryRun,
          diffs: dryRun.diffs.map((diff, index) =>
            index === 0
              ? {
                  ...diff,
                  evidence: {
                    ...diff.evidence,
                    correlationId: "fabricated-dry-run-correlation",
                  },
                }
              : diff,
          ),
        },
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires deterministic dry-run diff evidence",
  );

  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun: {
          ...dryRun,
          acceptedRows: dryRun.acceptedRows.map((row, index) =>
            index === 0 ? { ...row, rowId: "csv-row-trace-other-001" } : row,
          ),
          diffs: dryRun.diffs.map((diff, index) =>
            index === 0
              ? {
                  ...diff,
                  rowId: "csv-row-trace-other-001",
                  evidence: {
                    ...diff.evidence,
                    correlationId: "csv-import-csv-row-trace-other-001",
                  },
                }
              : diff,
          ),
        },
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires dry-run rows to match CSV job row outcomes",
  );

  db.exec(`
    INSERT INTO audit_event (
      id,
      actor_id,
      action,
      subject_table,
      subject_id,
      occurred_at,
      poc_marker,
      correlation_id
    )
    VALUES (
      'audit-event-csv-export-denied-prior-download',
      'operator-mvp-d-csv-export',
      'mvp_d.csv_export.synthetic_download_intent',
      'lifecycle_event',
      'csv-export-denied-trace-row-001',
      '2026-06-03T12:06:00+09:00',
      'synthetic_poc',
      'csv-export-denied-trace-001'
    );
  `);
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires denied export guard evidence without audit writes",
  );
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport: {
          ...deniedExport,
          auditEventCountBefore: 1,
          auditEventCountAfter: 1,
        },
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires denied export guard evidence without audit writes",
  );
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport: {
          ...deniedExport,
          requestedAt: "not-a-timestamp",
        },
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires denied export timestamp evidence",
  );
  db.exec(`
    DELETE FROM audit_event
    WHERE id = 'audit-event-csv-export-denied-prior-download';
  `);

  const operatorAuditEvent = db
    .prepare(
      `
        SELECT id
        FROM audit_event
        WHERE correlation_id = 'ops-decision-correlation-trace-001'
        LIMIT 1
      `,
    )
    .get() as { id: string } | undefined;
  assert.ok(operatorAuditEvent);
  const operatorAuditEventId = operatorAuditEvent.id;
  db.prepare(
    `
      UPDATE audit_event
      SET id = 'audit-event-local-ops-other-job'
      WHERE id = ?
    `,
  ).run(operatorAuditEventId);
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires operator action evidence",
  );
  db.prepare(
    `
      UPDATE audit_event
      SET id = ?
      WHERE id = 'audit-event-local-ops-other-job'
    `,
  ).run(operatorAuditEventId);

  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-applied-001'
    WHERE decision = 'retry';
  `);
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires DLQ decisions to match failed CSV row outcomes",
  );
  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-retry-001'
    WHERE decision = 'retry';
  `);

  db.exec(`
    INSERT INTO audit_event (
      id,
      actor_id,
      action,
      subject_table,
      subject_id,
      occurred_at,
      poc_marker,
      correlation_id
    )
    VALUES (
      'audit-event-local-ops-failure-orphan-row',
      'operator-mvp-d-csv-import',
      'mvp_d.ops_job.failure_decision.csv_import.retry',
      'lifecycle_event',
      'local-ops-failure-orphan-row',
      '2026-06-03T12:06:00+09:00',
      'synthetic_poc',
      'dlq-decision-correlation-trace-orphan-001'
    );
    INSERT INTO local_ops_failure_decision (
      id,
      workflow,
      source_type,
      job_correlation_id,
      row_id,
      decision,
      failure_status,
      retry_count,
      evidence_version,
      reason,
      decided_at,
      decided_by,
      decision_correlation_id,
      audit_event_id,
      created_at
    )
    VALUES (
      'local-ops-failure-decision-orphan-row',
      'csv_import',
      'repo_owned_synthetic_mvp_d_csv_failure',
      '${jobCorrelationId}',
      'csv-row-trace-orphan-001',
      'retry',
      'open',
      0,
      '${status.evidenceVersion}',
      'bounded synthetic orphan retry decision',
      '2026-06-03T12:06:00+09:00',
      'operator-mvp-d-csv-import',
      'dlq-decision-correlation-trace-orphan-001',
      'audit-event-local-ops-failure-orphan-row',
      '2026-06-03T12:06:00+09:00'
    );
  `);
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires DLQ decisions to match failed CSV row outcomes",
  );
  db.exec(`
    DELETE FROM local_ops_failure_decision
    WHERE id = 'local-ops-failure-decision-orphan-row';
    DELETE FROM audit_event
    WHERE id = 'audit-event-local-ops-failure-orphan-row';
  `);

  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-retry-001'
    WHERE decision = 'close';
  `);
  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    "MVP-D trace requires DLQ decision evidence for every failed CSV row",
  );
  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-close-001'
    WHERE decision = 'close';
  `);

  db.exec(`
    UPDATE audit_event
    SET correlation_id = 'dlq-decision-correlation-trace-close-mismatched'
    WHERE correlation_id = 'dlq-decision-correlation-trace-close-001';
  `);
  assert.throws(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay", "ignore", "close"],
      }),
    MvpDCsvOpsDlqTraceabilityError,
  );
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT count(*) AS count
            FROM audit_event
            WHERE action = 'mvp_d.csv_export.synthetic_download_intent'
          `,
        )
        .get(),
    ),
    { count: 0 },
    "denied export guard evidence must not create synthetic download audit rows",
  );
});

function captureDeniedExportEvidence(
  db: NonNullable<Awaited<ReturnType<typeof openSchemaBackedDatabase>>>,
): MvpDDeniedCsvExportGuardEvidence {
  const correlationId = "csv-export-denied-trace-001";
  const before = countDeniedExportAuditRows(db, correlationId);
  let errorMessage = "";
  assert.throws(
    () =>
      exportSyntheticLifecycleCsv(db, {
        scope: "repo_owned_synthetic_mvp_d_csv",
        requestedBy: "operator-mvp-d-csv-export",
        requestedAt: "2026-06-03T12:06:00+09:00",
        correlationId,
        permissions: [mvpDCsvExportRequiredPermission],
        fields: ["row_id"],
        rows: [{ row_id: "csv-export-denied-trace-row-001" }],
      }),
    (error) => {
      errorMessage = error instanceof Error ? error.message : "";
      return (
        errorMessage ===
        "CSV export request is outside the bounded synthetic MVP-D policy"
      );
    },
  );

  return {
    scope: "repo_owned_synthetic_mvp_d_csv",
    requestedBy: "operator-mvp-d-csv-export",
    requestedAt: "2026-06-03T12:06:00+09:00",
    correlationId,
    errorMessage,
    auditEventCountBefore: before,
    auditEventCountAfter: countDeniedExportAuditRows(db, correlationId),
  };
}

function countDeniedExportAuditRows(
  db: NonNullable<Awaited<ReturnType<typeof openSchemaBackedDatabase>>>,
  correlationId: string,
): number {
  const row = db
    .prepare(
      `
        SELECT count(*) AS count
        FROM audit_event
        WHERE action = 'mvp_d.csv_export.synthetic_download_intent'
          AND correlation_id = ?
      `,
    )
    .get(correlationId) as { count: number | bigint };
  return Number(row.count);
}

function assertTraceThrows(fn: () => void, message: string): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof MvpDCsvOpsDlqTraceabilityError);
    assert.equal(error.message, message);
    return true;
  });
}
