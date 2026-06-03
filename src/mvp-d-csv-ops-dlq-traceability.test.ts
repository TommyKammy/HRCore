import assert from "node:assert/strict";
import test from "node:test";

import {
  dryRunSyntheticLifecycleCsvImport,
  mvpDCsvImportTemplateColumns,
  type MvpDCsvImportDryRunResult,
} from "./csv-import-contract.js";
import {
  exportSyntheticLifecycleCsv,
  mvpDCsvExportRequiredPermission,
} from "./csv-export-policy.js";
import {
  recordLocalOpsFailureDecision,
  readLocalOpsJobStatus,
  recordLocalOpsOperatorDecision,
  type LocalOpsFailureDecision,
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

type TestDatabase = NonNullable<
  Awaited<ReturnType<typeof openSchemaBackedDatabase>>
>;

const traceJobCorrelationId = "csv-import-trace-job-001";
const requiredTraceDlqDecisions = [
  "retry",
  "replay",
  "ignore",
  "close",
] as const satisfies readonly LocalOpsFailureDecision[];

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

  const { dryRun, initialEvidenceVersion, jobCorrelationId } =
    seedMvpDCsvOpsDlqTraceFixture(db);
  const deniedExport = captureDeniedExportEvidence(db);
  const trace = verifyRequiredMvpDTrace(db, {
    dryRun,
    appliedJobCorrelationId: jobCorrelationId,
    deniedExport,
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
    [...requiredTraceDlqDecisions],
  );
  assert.equal(trace.deniedExport.auditEventCountAfter, 0);

  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: ["retry", "replay"],
      }),
    "MVP-D trace requires complete DLQ decision requirements",
  );

  assertTraceThrows(
    () =>
      verifyMvpDCsvOpsDlqTraceability(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
        requiredFailureDecisions: [],
      }),
    "MVP-D trace requires complete DLQ decision requirements",
  );

  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun: { ...dryRun, diffs: dryRun.diffs.slice(1) },
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires dry-run diff evidence for every accepted row",
  );

  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun: withAdditionalAcceptedDryRunRow(
          dryRun,
          "csv-row-trace-undecided-001",
        ),
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires dry-run rows to match CSV job row outcomes",
  );

  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
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
      }),
    "MVP-D trace requires deterministic dry-run diff evidence",
  );

  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun: {
          ...dryRun,
          diffs: dryRun.diffs.map((diff, index) =>
            index === 0
              ? {
                  ...diff,
                  evidence: {
                    ...diff.evidence,
                    rowFingerprint:
                      "synthetic-review-mismatched-row-fingerprint",
                  },
                }
              : diff,
          ),
        },
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires dry-run row fingerprints to match CSV job outcomes",
  );

  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun: {
          ...dryRun,
          rejectedRows: dryRun.rejectedRows.map((row, index) =>
            index === 0 ? { ...row, reasons: [""] } : row,
          ),
        },
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires rejected import reasons",
  );

  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
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
      }),
    "MVP-D trace requires dry-run rows to match CSV job row outcomes",
  );

  db.exec(`
    UPDATE csv_import_job
    SET status_code = 'applied'
    WHERE correlation_id = '${jobCorrelationId}';
  `);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires failed local Ops status evidence",
  );
  db.exec(`
    UPDATE csv_import_job
    SET status_code = 'failed'
    WHERE correlation_id = '${jobCorrelationId}';
  `);

  insertPriorDeniedExportAuditRow(db);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires denied export guard evidence without audit writes",
  );
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport: {
          ...deniedExport,
          correlationId: ` ${deniedExport.correlationId} `,
        },
      }),
    "MVP-D trace requires denied export guard evidence without audit writes",
  );
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport: {
          ...deniedExport,
          auditEventCountBefore: 1,
          auditEventCountAfter: 1,
        },
      }),
    "MVP-D trace requires denied export guard evidence without audit writes",
  );
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport: {
          ...deniedExport,
          requestedAt: "not-a-timestamp",
        },
      }),
    "MVP-D trace requires denied export timestamp evidence",
  );
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport: {
          ...deniedExport,
          requestedAt: "",
        },
      }),
    "MVP-D trace requires denied export timestamp evidence",
  );
  db.exec(`
    DELETE FROM audit_event
    WHERE id = 'audit-event-csv-export-denied-prior-download';
  `);

  const operatorAuditEventId = readOperatorDecisionAuditEventId(db);
  db.prepare(
    `
      UPDATE audit_event
      SET id = 'audit-event-local-ops-other-job'
      WHERE id = ?
    `,
  ).run(operatorAuditEventId);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
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
    UPDATE csv_import_row_outcome
    SET error_message = 'synthetic transfer target changed after operator review'
    WHERE row_id = 'csv-row-trace-retry-001';
  `);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires operator action evidence",
  );
  const statusAfterOperatorEvidenceDrift = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
  });
  recordLocalOpsOperatorDecision(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
    decision: "acknowledge_failure",
    reason: "bounded synthetic traceability failure re-reviewed",
    decidedAt: "2026-06-03T12:01:30+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "ops-decision-correlation-trace-refreshed-001",
    expectedEvidenceVersion: statusAfterOperatorEvidenceDrift.evidenceVersion,
  });
  updateFailureDecisionEvidenceVersion(
    db,
    jobCorrelationId,
    statusAfterOperatorEvidenceDrift.evidenceVersion,
  );
  const refreshedOperatorTrace = verifyRequiredMvpDTrace(db, {
    dryRun,
    appliedJobCorrelationId: jobCorrelationId,
    deniedExport,
  });
  assert.deepEqual(
    refreshedOperatorTrace.operatorActions.map(
      (action) => action.correlationId,
    ),
    ["ops-decision-correlation-trace-refreshed-001"],
  );
  db.exec(`
    UPDATE csv_import_row_outcome
    SET error_message = 'synthetic transfer target missing'
    WHERE row_id = 'csv-row-trace-retry-001';
  `);
  updateFailureDecisionEvidenceVersion(
    db,
    jobCorrelationId,
    initialEvidenceVersion,
  );

  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-applied-001'
    WHERE decision = 'retry';
  `);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires DLQ decisions to match failed CSV row outcomes",
  );
  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-retry-001'
    WHERE decision = 'retry';
  `);

  insertOrphanDlqFailureDecision(db, jobCorrelationId, initialEvidenceVersion);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
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
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires DLQ decision evidence for every failed CSV row",
  );
  db.exec(`
    UPDATE local_ops_failure_decision
    SET row_id = 'csv-row-trace-close-001'
    WHERE decision = 'close';
  `);

  insertUndecidedFailedCsvOutcome(db, dryRun);
  const statusWithUndecidedFailure = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
  });
  db.prepare(
    `
      UPDATE audit_event
      SET subject_id = ?
      WHERE correlation_id = 'ops-decision-correlation-trace-001'
    `,
  ).run(
    `local-ops-job-${statusWithUndecidedFailure.evidenceVersion}-review-refresh`,
  );
  updateFailureDecisionEvidenceVersion(
    db,
    jobCorrelationId,
    statusWithUndecidedFailure.evidenceVersion,
  );
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun: withAdditionalAcceptedDryRunRow(
          dryRun,
          "csv-row-trace-undecided-001",
        ),
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires DLQ decision evidence for every failed CSV row",
  );
  db.exec(`
    DELETE FROM csv_import_row_outcome
    WHERE id = 'csv-import-row-outcome-trace-undecided-001';
  `);
  db.prepare(
    `
      UPDATE audit_event
      SET subject_id = ?
      WHERE correlation_id = 'ops-decision-correlation-trace-001'
    `,
  ).run(`local-ops-job-${initialEvidenceVersion}-review-restore`);
  updateFailureDecisionEvidenceVersion(
    db,
    jobCorrelationId,
    initialEvidenceVersion,
  );

  db.exec(`
    UPDATE local_ops_failure_decision
    SET evidence_version = 'local-ops-evidence-stale-review'
    WHERE decision = 'replay';
  `);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires DLQ decision evidence for every failed CSV row",
  );
  db.exec(`
    UPDATE local_ops_failure_decision
    SET evidence_version = '${initialEvidenceVersion}'
    WHERE decision = 'replay';
  `);

  db.exec(`
    UPDATE local_ops_failure_decision
    SET evidence_version = 'local-ops-evidence-stale-review'
    WHERE decision = 'retry'
      AND decision_correlation_id = 'dlq-decision-correlation-trace-retry-001';
  `);
  assertTraceThrows(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
      }),
    "MVP-D trace requires DLQ decision evidence for every failed CSV row",
  );
  recordLocalOpsFailureDecision(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
    rowId: "csv-row-trace-retry-001",
    decision: "retry",
    reason: "bounded synthetic retry decision after evidence refresh",
    decidedAt: "2026-06-03T12:02:30+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "dlq-decision-correlation-trace-retry-refreshed-001",
    expectedEvidenceVersion: initialEvidenceVersion,
  });
  const refreshedDlqTrace = verifyRequiredMvpDTrace(db, {
    dryRun,
    appliedJobCorrelationId: jobCorrelationId,
    deniedExport,
  });
  assert.ok(
    refreshedDlqTrace.failureDecisions.some(
      (decision) =>
        decision.decision === "retry" &&
        decision.decisionCorrelationId ===
          "dlq-decision-correlation-trace-retry-refreshed-001",
    ),
  );

  db.exec(`
    UPDATE audit_event
    SET correlation_id = 'dlq-decision-correlation-trace-close-mismatched'
    WHERE correlation_id = 'dlq-decision-correlation-trace-close-001';
  `);
  assert.throws(
    () =>
      verifyRequiredMvpDTrace(db, {
        dryRun,
        appliedJobCorrelationId: jobCorrelationId,
        deniedExport,
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

function seedMvpDCsvOpsDlqTraceFixture(db: TestDatabase): {
  dryRun: MvpDCsvImportDryRunResult;
  initialEvidenceVersion: string;
  jobCorrelationId: string;
} {
  const jobCorrelationId = traceJobCorrelationId;
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
  for (const diff of dryRun.diffs) {
    db.prepare(
      `
        UPDATE csv_import_row_outcome
        SET row_fingerprint = ?
        WHERE row_id = ?
      `,
    ).run(diff.evidence.rowFingerprint, diff.rowId);
  }
  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
  });
  assert.equal(status.counts.applied, 1);
  assert.equal(status.counts.failed, 4);

  recordInitialMvpDOperatorAndDlqDecisions(
    db,
    jobCorrelationId,
    status.evidenceVersion,
  );

  return {
    dryRun,
    initialEvidenceVersion: status.evidenceVersion,
    jobCorrelationId,
  };
}

function recordInitialMvpDOperatorAndDlqDecisions(
  db: TestDatabase,
  jobCorrelationId: string,
  evidenceVersion: string,
): void {
  recordLocalOpsOperatorDecision(db, {
    workflow: "csv_import",
    correlationId: jobCorrelationId,
    decision: "acknowledge_failure",
    reason: "bounded synthetic traceability failure reviewed",
    decidedAt: "2026-06-03T12:01:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "ops-decision-correlation-trace-001",
    expectedEvidenceVersion: evidenceVersion,
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
      expectedEvidenceVersion: evidenceVersion,
    });
  }
}

function verifyRequiredMvpDTrace(
  db: TestDatabase,
  input: {
    dryRun: MvpDCsvImportDryRunResult;
    appliedJobCorrelationId: string;
    deniedExport: MvpDDeniedCsvExportGuardEvidence;
  },
) {
  return verifyMvpDCsvOpsDlqTraceability(db, {
    ...input,
    requiredFailureDecisions: requiredTraceDlqDecisions,
  });
}

function withAdditionalAcceptedDryRunRow(
  dryRun: MvpDCsvImportDryRunResult,
  rowId: string,
): MvpDCsvImportDryRunResult {
  return {
    ...dryRun,
    acceptedRows: [
      ...dryRun.acceptedRows,
      {
        ...dryRun.acceptedRows[1]!,
        rowId,
      },
    ],
    diffs: [
      ...dryRun.diffs,
      {
        ...dryRun.diffs[1]!,
        rowId,
        evidence: {
          ...dryRun.diffs[1]!.evidence,
          correlationId: `csv-import-${rowId}`,
        },
      },
    ],
  };
}

function insertPriorDeniedExportAuditRow(db: TestDatabase): void {
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
}

function readOperatorDecisionAuditEventId(db: TestDatabase): string {
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
  return operatorAuditEvent.id;
}

function updateFailureDecisionEvidenceVersion(
  db: TestDatabase,
  jobCorrelationId: string,
  evidenceVersion: string,
): void {
  db.prepare(
    `
      UPDATE local_ops_failure_decision
      SET evidence_version = ?
      WHERE job_correlation_id = ?
    `,
  ).run(evidenceVersion, jobCorrelationId);
}

function insertOrphanDlqFailureDecision(
  db: TestDatabase,
  jobCorrelationId: string,
  evidenceVersion: string,
): void {
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
      '${evidenceVersion}',
      'bounded synthetic orphan retry decision',
      '2026-06-03T12:06:00+09:00',
      'operator-mvp-d-csv-import',
      'dlq-decision-correlation-trace-orphan-001',
      'audit-event-local-ops-failure-orphan-row',
      '2026-06-03T12:06:00+09:00'
    );
  `);
}

function insertUndecidedFailedCsvOutcome(
  db: TestDatabase,
  dryRun: MvpDCsvImportDryRunResult,
): void {
  db.exec(`
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
      'csv-import-row-outcome-trace-undecided-001',
      'csv-import-job-trace-001',
      'csv-row-trace-undecided-001',
      'transfer',
      'failed',
      NULL,
      NULL,
      '${rowFingerprintFor(dryRun, "csv-row-trace-retry-001")}',
      'synthetic transfer target missing',
      'csv-import-row-outcome-correlation-trace-undecided-001',
      '2026-06-03T12:00:00+09:00'
    );
  `);
}

function captureDeniedExportEvidence(
  db: TestDatabase,
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
  db: TestDatabase,
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

function rowFingerprintFor(
  dryRun: MvpDCsvImportDryRunResult,
  rowId: string,
): string {
  const diff = dryRun.diffs.find((candidate) => candidate.rowId === rowId);
  assert.ok(diff);
  return diff.evidence.rowFingerprint;
}

function assertTraceThrows(fn: () => void, message: string): void {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof MvpDCsvOpsDlqTraceabilityError);
    assert.equal(error.message, message);
    return true;
  });
}
