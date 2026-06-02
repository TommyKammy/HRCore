import assert from "node:assert/strict";
import test from "node:test";

import {
  applySyntheticLifecycleCsvImport,
  dryRunSyntheticLifecycleCsvImport,
  mvpDCsvImportTemplateColumns,
} from "./csv-import-contract.js";
import {
  recordLocalOpsFailureDecision,
  readLocalOpsJobStatus,
  recordLocalOpsOperatorDecision,
  rejectBroadLocalOpsJobSearch,
} from "./local-ops-job-status.js";
import {
  applyDueOnboardingTransactionRequests,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
} from "./onboarding-transaction-request.js";
import { buildWorkerAttemptCorrelationId } from "./onboarding-transaction-request-ids.js";
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

test("MVP-D local ops job status matches onboarding apply attempt correlations", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  saveOnboardingTransactionRequest(
    db,
    createOnboardingTransactionRequestFixture(),
  );
  decideOnboardingTransactionRequest(db, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: "correlation-onboarding-approval-001",
  });

  const workerCorrelationId = "correlation-local-ops-onboarding-apply-run-001";
  const attemptedAt = "2026-06-01T00:00:00Z";
  assert.deepEqual(
    applyDueOnboardingTransactionRequests(db, {
      now: attemptedAt,
      workerId: "worker-local-ops-onboarding-apply-001",
      correlationId: workerCorrelationId,
    }),
    {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId: workerCorrelationId,
      results: [
        {
          transactionRequestId: "transaction-request-onboarding-001",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-onboarding-001-apply",
        },
      ],
    },
  );

  const status = readLocalOpsJobStatus(db, {
    workflow: "onboarding_apply",
    correlationId: workerCorrelationId,
  });

  assert.equal(status.workflow, "onboarding_apply");
  assert.equal(status.status, "completed");
  assert.deepEqual(status.operatorEvidence, {
    actorId: "worker-local-ops-onboarding-apply-001",
    recordedAt: attemptedAt,
    correlationId: workerCorrelationId,
  });
  assert.deepEqual(status.counts, {
    attempted: 1,
    applied: 1,
    failed: 0,
    skipped: 0,
  });
  assert.deepEqual(status.rows, [
    {
      rowId: "transaction-request-onboarding-001",
      lifecycleType: "onboarding",
      status: "applied",
      correlationId: buildWorkerAttemptCorrelationId(
        workerCorrelationId,
        "transaction-request-onboarding-001",
      ),
      decidedAt: attemptedAt,
      transactionRequestId: "transaction-request-onboarding-001",
      lifecycleEventId: null,
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

test("MVP-D local ops failure decisions are reasoned, idempotent, and fail closed", async (t) => {
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
      'csv-import-job-dlq-guard-001',
      'csv-import-dlq-guard-001',
      'fingerprint-csv-import-dlq-guard-001',
      'mvp_d_lifecycle_support_v1',
      'repo_owned_synthetic_mvp_d_csv',
      'failed',
      '2026-06-03T10:00:00+09:00',
      'operator-mvp-d-csv-import',
      1,
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
    VALUES
      (
        'csv-import-row-outcome-dlq-failed-001',
        'csv-import-job-dlq-guard-001',
        'csv-row-dlq-failed-001',
        'transfer',
        'failed',
        NULL,
        NULL,
        'fingerprint-csv-row-dlq-failed-001',
        'synthetic transfer target missing',
        'csv-import-row-outcome-correlation-dlq-failed-001',
        '2026-06-03T10:00:00+09:00'
      ),
      (
        'csv-import-row-outcome-dlq-applied-001',
        'csv-import-job-dlq-guard-001',
        'csv-row-dlq-applied-001',
        'termination',
        'applied',
        'csv-import-transaction-request-csv-row-dlq-applied-001',
        'csv-import-lifecycle-event-csv-row-dlq-applied-001',
        'fingerprint-csv-row-dlq-applied-001',
        NULL,
        'csv-import-row-outcome-correlation-dlq-applied-001',
        '2026-06-03T10:00:00+09:00'
      );
  `);

  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-guard-001",
  });
  assert.equal(status.status, "failed");

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-failed-001",
        decision: "replay",
        reason: " ",
        decidedAt: "2026-06-03T10:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-missing-reason",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops failure decision requires a reason/,
  );

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-failed-001",
        decision: "ignore",
        reason: "operator reviewed synthetic failure",
        decidedAt: "2026-06-03T10:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-stale",
        expectedEvidenceVersion: "local-ops-evidence-stale",
      }),
    /local ops failure decision requires current evidence/,
  );

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-applied-001",
        decision: "replay",
        reason: "successful rows must not replay",
        decidedAt: "2026-06-03T10:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-applied",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops failure decision requires a failed row/,
  );

  const firstReplay = recordLocalOpsFailureDecision(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-guard-001",
    rowId: "csv-row-dlq-failed-001",
    decision: "replay",
    reason: "synthetic target is now available",
    decidedAt: "2026-06-03T10:05:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "dlq-decision-correlation-replay-001",
    expectedEvidenceVersion: status.evidenceVersion,
  });
  const duplicateReplay = recordLocalOpsFailureDecision(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-guard-001",
    rowId: "csv-row-dlq-failed-001",
    decision: "replay",
    reason: "synthetic target is now available",
    decidedAt: "2026-06-03T10:05:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "dlq-decision-correlation-replay-001",
    expectedEvidenceVersion: status.evidenceVersion,
  });
  assert.deepEqual(duplicateReplay, firstReplay);

  assert.throws(
    () =>
      db
        .prepare(
          `
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
              'local-ops-failure-decision-raw-duplicate-replay',
              'csv_import',
              'repo_owned_synthetic_mvp_d_csv_failure',
              'csv-import-dlq-guard-001',
              'csv-row-dlq-failed-001',
              'replay',
              'replayed',
              0,
              ?,
              'raw duplicate replay must be rejected durably',
              '2026-06-03T10:05:30+09:00',
              'operator-mvp-d-csv-import',
              'dlq-decision-correlation-replay-raw-duplicate',
              'audit-event-local-ops-failure-raw-duplicate-replay',
              '2026-06-03T10:05:30+09:00'
            )
          `,
        )
        .run(status.evidenceVersion),
    /UNIQUE constraint failed/,
  );

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-failed-001",
        decision: "replay",
        reason: "second replay must be blocked",
        decidedAt: "2026-06-03T10:06:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-replay-002",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops failure decision rejects duplicate replay/,
  );

  for (const retryNumber of [1, 2, 3] as const) {
    assert.equal(
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-failed-001",
        decision: "retry",
        reason: `bounded synthetic retry attempt ${retryNumber}`,
        decidedAt: `2026-06-03T10:1${retryNumber}:00+09:00`,
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: `dlq-decision-correlation-retry-00${retryNumber}`,
        expectedEvidenceVersion: status.evidenceVersion,
      }).retryCount,
      retryNumber,
    );
  }

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-failed-001",
        decision: "retry",
        reason: "fourth retry must be blocked",
        decidedAt: "2026-06-03T10:14:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-retry-004",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops failure decision retry limit exceeded/,
  );

  const closeDecision = recordLocalOpsFailureDecision(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-guard-001",
    rowId: "csv-row-dlq-failed-001",
    decision: "close",
    reason: "synthetic failure handling complete",
    decidedAt: "2026-06-03T10:20:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "dlq-decision-correlation-close-001",
    expectedEvidenceVersion: status.evidenceVersion,
  });
  assert.equal(closeDecision.failureStatus, "closed");

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-guard-001",
        rowId: "csv-row-dlq-failed-001",
        decision: "retry",
        reason: "closed synthetic failures must stay terminal",
        decidedAt: "2026-06-03T10:21:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-after-close-001",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops failure decision rejects terminal failure state/,
  );

  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT
              decision,
              failure_status,
              retry_count,
              reason,
              decision_correlation_id
            FROM local_ops_failure_decision
            ORDER BY decided_at, decision_correlation_id
          `,
        )
        .all(),
    ),
    [
      {
        decision: "replay",
        failure_status: "replayed",
        retry_count: 0,
        reason: "synthetic target is now available",
        decision_correlation_id: "dlq-decision-correlation-replay-001",
      },
      {
        decision: "retry",
        failure_status: "open",
        retry_count: 1,
        reason: "bounded synthetic retry attempt 1",
        decision_correlation_id: "dlq-decision-correlation-retry-001",
      },
      {
        decision: "retry",
        failure_status: "open",
        retry_count: 2,
        reason: "bounded synthetic retry attempt 2",
        decision_correlation_id: "dlq-decision-correlation-retry-002",
      },
      {
        decision: "retry",
        failure_status: "open",
        retry_count: 3,
        reason: "bounded synthetic retry attempt 3",
        decision_correlation_id: "dlq-decision-correlation-retry-003",
      },
      {
        decision: "close",
        failure_status: "closed",
        retry_count: 3,
        reason: "synthetic failure handling complete",
        decision_correlation_id: "dlq-decision-correlation-close-001",
      },
    ],
  );
});

test("MVP-D local ops failure decisions replay committed evidence before mutable status checks", async (t) => {
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
      'csv-import-job-dlq-idempotent-001',
      'csv-import-dlq-idempotent-001',
      'fingerprint-csv-import-dlq-idempotent-001',
      'mvp_d_lifecycle_support_v1',
      'repo_owned_synthetic_mvp_d_csv',
      'failed',
      '2026-06-03T11:00:00+09:00',
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
      'csv-import-row-outcome-dlq-idempotent-001',
      'csv-import-job-dlq-idempotent-001',
      'csv-row-dlq-idempotent-001',
      'transfer',
      'failed',
      NULL,
      NULL,
      'fingerprint-csv-row-dlq-idempotent-001',
      'synthetic transfer target missing',
      'csv-import-row-outcome-correlation-dlq-idempotent-001',
      '2026-06-03T11:00:00+09:00'
    );
  `);

  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-idempotent-001",
  });

  const replay = recordLocalOpsFailureDecision(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-idempotent-001",
    rowId: "csv-row-dlq-idempotent-001",
    decision: "replay",
    reason: "synthetic target is now available",
    decidedAt: "2026-06-03T11:05:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "dlq-decision-correlation-idempotent-replay-001",
    expectedEvidenceVersion: status.evidenceVersion,
  });

  db.exec(`
    UPDATE csv_import_job
    SET status_code = 'applied',
        accepted_rows = 1,
        failed_rows = 0
    WHERE id = 'csv-import-job-dlq-idempotent-001';

    UPDATE csv_import_row_outcome
    SET status_code = 'applied',
        transaction_request_id = 'csv-import-transaction-request-csv-row-dlq-idempotent-001',
        lifecycle_event_id = 'csv-import-lifecycle-event-csv-row-dlq-idempotent-001',
        error_message = NULL,
        correlation_id = 'csv-import-row-outcome-correlation-dlq-idempotent-applied-001',
        decided_at = '2026-06-03T11:10:00+09:00'
    WHERE id = 'csv-import-row-outcome-dlq-idempotent-001';
  `);

  assert.notEqual(
    readLocalOpsJobStatus(db, {
      workflow: "csv_import",
      correlationId: "csv-import-dlq-idempotent-001",
    }).evidenceVersion,
    status.evidenceVersion,
  );

  assert.deepEqual(
    recordLocalOpsFailureDecision(db, {
      workflow: "csv_import",
      correlationId: "csv-import-dlq-idempotent-001",
      rowId: "csv-row-dlq-idempotent-001",
      decision: "replay",
      reason: "synthetic target is now available",
      decidedAt: "2026-06-03T11:05:00+09:00",
      decidedBy: "operator-mvp-d-csv-import",
      decisionCorrelationId: "dlq-decision-correlation-idempotent-replay-001",
      expectedEvidenceVersion: status.evidenceVersion,
    }),
    replay,
  );

  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT count(*) AS count
            FROM local_ops_failure_decision
            WHERE job_correlation_id = 'csv-import-dlq-idempotent-001'
          `,
        )
        .get(),
    ),
    { count: 1 },
  );
});
