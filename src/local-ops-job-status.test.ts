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
import { encodeStableKey } from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingTransactionRequestDatabase,
  SqlValue,
} from "./onboarding-transaction-request-types.js";

type SchemaBackedDatabase = NonNullable<
  Awaited<ReturnType<typeof openSchemaBackedDatabase>>
>;

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

function seedFailedCsvImportJob(
  db: OnboardingTransactionRequestDatabase,
  input: {
    jobId: string;
    correlationId: string;
    rowId: string;
    requestedAt: string;
  },
): void {
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
      '${input.jobId}',
      '${input.correlationId}',
      'fingerprint-${input.jobId}',
      'mvp_d_lifecycle_support_v1',
      'repo_owned_synthetic_mvp_d_csv',
      'failed',
      '${input.requestedAt}',
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
      'csv-import-row-outcome-${input.rowId}',
      '${input.jobId}',
      '${input.rowId}',
      'transfer',
      'failed',
      NULL,
      NULL,
      'fingerprint-${input.rowId}',
      'synthetic transfer target missing',
      'csv-import-row-outcome-correlation-${input.rowId}',
      '${input.requestedAt}'
    );
  `);
}

function insertRawFailureDecisionEvidence(
  db: OnboardingTransactionRequestDatabase,
  input: {
    workflow: "csv_import";
    correlationId: string;
    rowId: string;
    decision: "retry" | "replay" | "ignore" | "close";
    failureStatus: "open" | "replayed" | "ignored" | "closed";
    retryCount: number;
    evidenceVersion: string;
    reason: string;
    decidedAt: string;
    decidedBy: string;
    decisionCorrelationId: string;
  },
): { auditEventId: string; decisionId: string } {
  const decisionId = `local-ops-failure-decision-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.rowId,
    input.decision,
    input.decisionCorrelationId,
  ])}`;
  const auditEventId = `audit-event-local-ops-failure-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.rowId,
    input.decision,
    input.decisionCorrelationId,
  ])}`;
  const action = `mvp_d.ops_job.failure_decision.${input.workflow}.${input.decision}`;
  const subjectId = `local-ops-failure-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.rowId,
    input.evidenceVersion,
  ])}`;

  db.prepare(
    `
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
      VALUES (?, ?, ?, 'lifecycle_event', ?, ?, 'synthetic_poc', ?)
    `,
  ).run(
    auditEventId,
    input.decidedBy,
    action,
    subjectId,
    input.decidedAt,
    input.decisionCorrelationId,
  );
  db.prepare(
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
        ?,
        ?,
        'repo_owned_synthetic_mvp_d_csv_failure',
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `,
  ).run(
    decisionId,
    input.workflow,
    input.correlationId,
    input.rowId,
    input.decision,
    input.failureStatus,
    input.retryCount,
    input.evidenceVersion,
    input.reason,
    input.decidedAt,
    input.decidedBy,
    input.decisionCorrelationId,
    auditEventId,
    input.decidedAt,
  );

  return { auditEventId, decisionId };
}

function withConcurrentLocalOpsFailureDecision(
  db: SchemaBackedDatabase,
  hooks: {
    afterMissingDecisionRead?: () => void;
    afterRetryCountRead?: () => void;
    beforeFailureDecisionSavepoint?: () => void;
    beforeFailureDecisionInsert?: () => void;
  },
): OnboardingTransactionRequestDatabase {
  return {
    exec(sql: string): unknown {
      if (sql === "SAVEPOINT local_ops_failure_decision") {
        hooks.beforeFailureDecisionSavepoint?.();
      }
      return db.exec(sql);
    },
    prepare(sql: string) {
      const statement = db.prepare(sql);
      return {
        get(...values: SqlValue[]): Record<string, unknown> | undefined {
          const row = statement.get(...values) as
            | Record<string, unknown>
            | undefined;
          if (!row && sql.includes("WHERE decision.id = ?")) {
            hooks.afterMissingDecisionRead?.();
          }
          if (
            sql.includes("SELECT count(*) AS count") &&
            sql.includes("decision = 'retry'")
          ) {
            hooks.afterRetryCountRead?.();
          }
          return row;
        },
        all(...values: SqlValue[]): Record<string, unknown>[] {
          return statement.all(...values) as Record<string, unknown>[];
        },
        run(...values: SqlValue[]): unknown {
          if (sql.includes("INSERT INTO local_ops_failure_decision (")) {
            hooks.beforeFailureDecisionInsert?.();
          }
          return statement.run(...values);
        },
      };
    },
  };
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
    /local ops failure decision rejects duplicate replay/,
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
              'local-ops-failure-decision-raw-fourth-retry',
              'csv_import',
              'repo_owned_synthetic_mvp_d_csv_failure',
              'csv-import-dlq-guard-001',
              'csv-row-dlq-failed-001',
              'retry',
              'open',
              3,
              ?,
              'raw fourth retry must be rejected durably',
              '2026-06-03T10:14:30+09:00',
              'operator-mvp-d-csv-import',
              'dlq-decision-correlation-retry-raw-fourth',
              'audit-event-local-ops-failure-raw-fourth-retry',
              '2026-06-03T10:14:30+09:00'
            )
          `,
        )
        .run(status.evidenceVersion),
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
              'local-ops-failure-decision-raw-ignore-open-status',
              'csv_import',
              'repo_owned_synthetic_mvp_d_csv_failure',
              'csv-import-dlq-guard-001',
              'csv-row-dlq-failed-002',
              'ignore',
              'open',
              0,
              ?,
              'raw ignore must not bypass terminal state',
              '2026-06-03T10:19:00+09:00',
              'operator-mvp-d-csv-import',
              'dlq-decision-correlation-raw-ignore-open',
              'audit-event-local-ops-failure-raw-ignore-open',
              '2026-06-03T10:19:00+09:00'
            )
          `,
        )
        .run(status.evidenceVersion),
    /local ops failure decision requires consistent failure status/,
  );

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
              'local-ops-failure-decision-raw-after-close',
              'csv_import',
              'repo_owned_synthetic_mvp_d_csv_failure',
              'csv-import-dlq-guard-001',
              'csv-row-dlq-failed-001',
              'retry',
              'open',
              3,
              ?,
              'raw retry after close must be rejected durably',
              '2026-06-03T10:20:30+09:00',
              'operator-mvp-d-csv-import',
              'dlq-decision-correlation-raw-after-close',
              'audit-event-local-ops-failure-raw-after-close',
              '2026-06-03T10:20:30+09:00'
            )
          `,
        )
        .run(status.evidenceVersion),
    /local ops failure decision rejects terminal failure state/,
  );

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

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-idempotent-001",
        rowId: "csv-row-dlq-idempotent-001",
        decision: "replay",
        reason: "second replay stays blocked after row applied",
        decidedAt: "2026-06-03T11:11:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-idempotent-replay-002",
        expectedEvidenceVersion: status.evidenceVersion,
      }),
    /local ops failure decision rejects duplicate replay/,
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

test("MVP-D local ops failure decisions return exact races before prior-state guards", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  seedFailedCsvImportJob(db, {
    jobId: "csv-import-job-dlq-prior-race-replay-001",
    correlationId: "csv-import-dlq-prior-race-replay-001",
    rowId: "csv-row-dlq-prior-race-replay-001",
    requestedAt: "2026-06-03T11:20:00+09:00",
  });
  const replayStatus = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-prior-race-replay-001",
  });

  let replayIds:
    | ReturnType<typeof insertRawFailureDecisionEvidence>
    | undefined;
  const replayRaceDb = withConcurrentLocalOpsFailureDecision(db, {
    afterMissingDecisionRead: () => {
      if (replayIds) {
        return;
      }
      replayIds = insertRawFailureDecisionEvidence(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-prior-race-replay-001",
        rowId: "csv-row-dlq-prior-race-replay-001",
        decision: "replay",
        failureStatus: "replayed",
        retryCount: 0,
        evidenceVersion: replayStatus.evidenceVersion,
        reason: "replay committed after the first exact decision read",
        decidedAt: "2026-06-03T11:21:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-prior-race-replay-001",
      });
    },
  });

  assert.deepEqual(
    recordLocalOpsFailureDecision(replayRaceDb, {
      workflow: "csv_import",
      correlationId: "csv-import-dlq-prior-race-replay-001",
      rowId: "csv-row-dlq-prior-race-replay-001",
      decision: "replay",
      reason: "replay committed after the first exact decision read",
      decidedAt: "2026-06-03T11:21:00+09:00",
      decidedBy: "operator-mvp-d-csv-import",
      decisionCorrelationId: "dlq-decision-correlation-prior-race-replay-001",
      expectedEvidenceVersion: replayStatus.evidenceVersion,
    }),
    {
      decisionId: replayIds?.decisionId,
      auditEventId: replayIds?.auditEventId,
      action: "mvp_d.ops_job.failure_decision.csv_import.replay",
      correlationId: "dlq-decision-correlation-prior-race-replay-001",
      evidenceVersion: replayStatus.evidenceVersion,
      failureStatus: "replayed",
      retryCount: 0,
    },
  );

  seedFailedCsvImportJob(db, {
    jobId: "csv-import-job-dlq-prior-race-close-001",
    correlationId: "csv-import-dlq-prior-race-close-001",
    rowId: "csv-row-dlq-prior-race-close-001",
    requestedAt: "2026-06-03T11:30:00+09:00",
  });
  const closeStatus = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-prior-race-close-001",
  });

  let closeIds: ReturnType<typeof insertRawFailureDecisionEvidence> | undefined;
  const closeRaceDb = withConcurrentLocalOpsFailureDecision(db, {
    afterMissingDecisionRead: () => {
      if (closeIds) {
        return;
      }
      closeIds = insertRawFailureDecisionEvidence(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-prior-race-close-001",
        rowId: "csv-row-dlq-prior-race-close-001",
        decision: "close",
        failureStatus: "closed",
        retryCount: 0,
        evidenceVersion: closeStatus.evidenceVersion,
        reason: "close committed after the first exact decision read",
        decidedAt: "2026-06-03T11:31:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-prior-race-close-001",
      });
    },
  });

  assert.deepEqual(
    recordLocalOpsFailureDecision(closeRaceDb, {
      workflow: "csv_import",
      correlationId: "csv-import-dlq-prior-race-close-001",
      rowId: "csv-row-dlq-prior-race-close-001",
      decision: "close",
      reason: "close committed after the first exact decision read",
      decidedAt: "2026-06-03T11:31:00+09:00",
      decidedBy: "operator-mvp-d-csv-import",
      decisionCorrelationId: "dlq-decision-correlation-prior-race-close-001",
      expectedEvidenceVersion: closeStatus.evidenceVersion,
    }),
    {
      decisionId: closeIds?.decisionId,
      auditEventId: closeIds?.auditEventId,
      action: "mvp_d.ops_job.failure_decision.csv_import.close",
      correlationId: "dlq-decision-correlation-prior-race-close-001",
      evidenceVersion: closeStatus.evidenceVersion,
      failureStatus: "closed",
      retryCount: 0,
    },
  );
});

test("MVP-D local ops failure decisions recover committed insert races", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  seedFailedCsvImportJob(db, {
    jobId: "csv-import-job-dlq-race-001",
    correlationId: "csv-import-dlq-race-001",
    rowId: "csv-row-dlq-race-001",
    requestedAt: "2026-06-03T12:00:00+09:00",
  });
  const status = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-race-001",
  });

  let insertedCommittedDuplicate = false;
  const sameDecisionDb = withConcurrentLocalOpsFailureDecision(db, {
    afterMissingDecisionRead: () => {
      if (insertedCommittedDuplicate) {
        return;
      }
      insertedCommittedDuplicate = true;
      insertRawFailureDecisionEvidence(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-race-001",
        rowId: "csv-row-dlq-race-001",
        decision: "retry",
        failureStatus: "open",
        retryCount: 1,
        evidenceVersion: status.evidenceVersion,
        reason: "retry committed by a racing local ops caller",
        decidedAt: "2026-06-03T12:05:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-race-retry-001",
      });
    },
  });

  assert.deepEqual(
    recordLocalOpsFailureDecision(sameDecisionDb, {
      workflow: "csv_import",
      correlationId: "csv-import-dlq-race-001",
      rowId: "csv-row-dlq-race-001",
      decision: "retry",
      reason: "retry committed by a racing local ops caller",
      decidedAt: "2026-06-03T12:05:00+09:00",
      decidedBy: "operator-mvp-d-csv-import",
      decisionCorrelationId: "dlq-decision-correlation-race-retry-001",
      expectedEvidenceVersion: status.evidenceVersion,
    }),
    {
      decisionId:
        "local-ops-failure-decision-WyJjc3ZfaW1wb3J0IiwiY3N2LWltcG9ydC1kbHEtcmFjZS0wMDEiLCJjc3Ytcm93LWRscS1yYWNlLTAwMSIsInJldHJ5IiwiZGxxLWRlY2lzaW9uLWNvcnJlbGF0aW9uLXJhY2UtcmV0cnktMDAxIl0",
      auditEventId:
        "audit-event-local-ops-failure-WyJjc3ZfaW1wb3J0IiwiY3N2LWltcG9ydC1kbHEtcmFjZS0wMDEiLCJjc3Ytcm93LWRscS1yYWNlLTAwMSIsInJldHJ5IiwiZGxxLWRlY2lzaW9uLWNvcnJlbGF0aW9uLXJhY2UtcmV0cnktMDAxIl0",
      action: "mvp_d.ops_job.failure_decision.csv_import.retry",
      correlationId: "dlq-decision-correlation-race-retry-001",
      evidenceVersion: status.evidenceVersion,
      failureStatus: "open",
      retryCount: 1,
    },
  );

  let insertedRetryAttemptCollision = false;
  const retryCollisionDb = withConcurrentLocalOpsFailureDecision(db, {
    afterRetryCountRead: () => {
      if (insertedRetryAttemptCollision) {
        return;
      }
      insertedRetryAttemptCollision = true;
      insertRawFailureDecisionEvidence(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-race-001",
        rowId: "csv-row-dlq-race-001",
        decision: "retry",
        failureStatus: "open",
        retryCount: 2,
        evidenceVersion: status.evidenceVersion,
        reason: "second retry committed by a racing local ops caller",
        decidedAt: "2026-06-03T12:06:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-race-retry-002",
      });
    },
  });

  const recomputedRetry = recordLocalOpsFailureDecision(retryCollisionDb, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-race-001",
    rowId: "csv-row-dlq-race-001",
    decision: "retry",
    reason: "third retry recomputes after a racing retry insert",
    decidedAt: "2026-06-03T12:07:00+09:00",
    decidedBy: "operator-mvp-d-csv-import",
    decisionCorrelationId: "dlq-decision-correlation-race-retry-003",
    expectedEvidenceVersion: status.evidenceVersion,
  });
  assert.equal(recomputedRetry.retryCount, 3);

  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT retry_count, decision_correlation_id
            FROM local_ops_failure_decision
            WHERE job_correlation_id = 'csv-import-dlq-race-001'
              AND decision = 'retry'
            ORDER BY retry_count
          `,
        )
        .all(),
    ),
    [
      {
        retry_count: 1,
        decision_correlation_id: "dlq-decision-correlation-race-retry-001",
      },
      {
        retry_count: 2,
        decision_correlation_id: "dlq-decision-correlation-race-retry-002",
      },
      {
        retry_count: 3,
        decision_correlation_id: "dlq-decision-correlation-race-retry-003",
      },
    ],
  );
});

test("MVP-D local ops failure decisions enforce replay and ignore races durably", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  seedFailedCsvImportJob(db, {
    jobId: "csv-import-job-dlq-replay-race-001",
    correlationId: "csv-import-dlq-replay-race-001",
    rowId: "csv-row-dlq-replay-race-001",
    requestedAt: "2026-06-03T12:30:00+09:00",
  });
  const replayRaceStatus = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-replay-race-001",
  });

  let insertedReplayRace = false;
  const replayRaceDb = withConcurrentLocalOpsFailureDecision(db, {
    beforeFailureDecisionSavepoint: () => {
      if (insertedReplayRace) {
        return;
      }
      insertedReplayRace = true;
      insertRawFailureDecisionEvidence(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-replay-race-001",
        rowId: "csv-row-dlq-replay-race-001",
        decision: "replay",
        failureStatus: "replayed",
        retryCount: 0,
        evidenceVersion: replayRaceStatus.evidenceVersion,
        reason: "replay committed by a racing local ops caller",
        decidedAt: "2026-06-03T12:31:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-race-replay-001",
      });
    },
  });

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(replayRaceDb, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-replay-race-001",
        rowId: "csv-row-dlq-replay-race-001",
        decision: "replay",
        reason: "second replay loses durable uniqueness race",
        decidedAt: "2026-06-03T12:31:30+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-race-replay-002",
        expectedEvidenceVersion: replayRaceStatus.evidenceVersion,
      }),
    /local ops failure decision rejects duplicate replay/,
  );
  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT decision, decision_correlation_id
            FROM local_ops_failure_decision
            WHERE job_correlation_id = 'csv-import-dlq-replay-race-001'
            ORDER BY decided_at
          `,
        )
        .all(),
    ),
    [
      {
        decision: "replay",
        decision_correlation_id: "dlq-decision-correlation-race-replay-001",
      },
    ],
  );
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT count(*) AS count
            FROM audit_event
            WHERE correlation_id = 'dlq-decision-correlation-race-replay-002'
          `,
        )
        .get(),
    ),
    { count: 0 },
  );

  seedFailedCsvImportJob(db, {
    jobId: "csv-import-job-dlq-ignore-race-001",
    correlationId: "csv-import-dlq-ignore-race-001",
    rowId: "csv-row-dlq-ignore-race-001",
    requestedAt: "2026-06-03T12:40:00+09:00",
  });
  const ignoreRaceStatus = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: "csv-import-dlq-ignore-race-001",
  });

  let insertedIgnoreRace = false;
  const ignoredFailureDb = withConcurrentLocalOpsFailureDecision(db, {
    beforeFailureDecisionSavepoint: () => {
      if (insertedIgnoreRace) {
        return;
      }
      insertedIgnoreRace = true;
      insertRawFailureDecisionEvidence(db, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-ignore-race-001",
        rowId: "csv-row-dlq-ignore-race-001",
        decision: "ignore",
        failureStatus: "ignored",
        retryCount: 0,
        evidenceVersion: ignoreRaceStatus.evidenceVersion,
        reason: "ignore committed by a racing local ops caller",
        decidedAt: "2026-06-03T12:41:00+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-race-ignore-001",
      });
    },
  });

  assert.throws(
    () =>
      recordLocalOpsFailureDecision(ignoredFailureDb, {
        workflow: "csv_import",
        correlationId: "csv-import-dlq-ignore-race-001",
        rowId: "csv-row-dlq-ignore-race-001",
        decision: "retry",
        reason: "retry loses durable ignore terminal race",
        decidedAt: "2026-06-03T12:41:30+09:00",
        decidedBy: "operator-mvp-d-csv-import",
        decisionCorrelationId: "dlq-decision-correlation-race-after-ignore-001",
        expectedEvidenceVersion: ignoreRaceStatus.evidenceVersion,
      }),
    /local ops failure decision rejects terminal failure state/,
  );
  assert.deepEqual(
    normalizeRows(
      db
        .prepare(
          `
            SELECT decision, failure_status, decision_correlation_id
            FROM local_ops_failure_decision
            WHERE job_correlation_id = 'csv-import-dlq-ignore-race-001'
            ORDER BY decided_at
          `,
        )
        .all(),
    ),
    [
      {
        decision: "ignore",
        failure_status: "ignored",
        decision_correlation_id: "dlq-decision-correlation-race-ignore-001",
      },
    ],
  );
  assert.deepEqual(
    normalizeRow(
      db
        .prepare(
          `
            SELECT count(*) AS count
            FROM audit_event
            WHERE correlation_id = 'dlq-decision-correlation-race-after-ignore-001'
          `,
        )
        .get(),
    ),
    { count: 0 },
  );
});
