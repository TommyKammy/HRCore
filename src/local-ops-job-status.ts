import {
  encodeStableKey,
  isSingleSqlChange,
} from "./onboarding-transaction-request-shared.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

export const localOpsJobReadiness =
  "bounded_synthetic_only_not_production_ready";

export type LocalOpsJobWorkflow = "csv_import" | "onboarding_apply";
export type LocalOpsOperatorDecision =
  | "acknowledge_failure"
  | "escalate_for_manual_review";

export interface ReadLocalOpsJobStatusInput {
  workflow: LocalOpsJobWorkflow;
  correlationId: string;
}

export interface LocalOpsJobStatus {
  workflow: LocalOpsJobWorkflow;
  correlationId: string;
  scope: "repo_owned_synthetic_mvp_d";
  readiness: typeof localOpsJobReadiness;
  status: "applied" | "failed" | "completed" | "empty";
  evidenceVersion: string;
  operatorEvidence: {
    actorId: string;
    recordedAt: string;
    correlationId: string;
  };
  counts: {
    attempted: number;
    applied: number;
    failed: number;
    skipped: number;
  };
  rows: LocalOpsJobRowEvidence[];
}

export interface LocalOpsJobRowEvidence {
  rowId: string;
  lifecycleType: string;
  status: string;
  correlationId: string;
  decidedAt: string;
  transactionRequestId: string | null;
  lifecycleEventId: string | null;
  errorMessage: string | null;
}

export interface RecordLocalOpsOperatorDecisionInput extends ReadLocalOpsJobStatusInput {
  decision: LocalOpsOperatorDecision;
  reason: string;
  decidedAt: string;
  decidedBy: string;
  decisionCorrelationId: string;
  expectedEvidenceVersion: string;
}

export interface LocalOpsOperatorDecisionResult {
  auditEventId: string;
  action: string;
  correlationId: string;
  evidenceVersion: string;
}

type CsvImportJobRow = {
  id: string;
  correlation_id: string;
  status_code: string;
  requested_at: string;
  requested_by: string;
  accepted_rows: number;
  failed_rows: number;
};

type CsvImportOutcomeRow = {
  row_id: string;
  lifecycle_type: string;
  status_code: string;
  transaction_request_id: string | null;
  lifecycle_event_id: string | null;
  error_message: string | null;
  correlation_id: string;
  decided_at: string;
};

type OnboardingApplyJobRunRow = {
  correlation_id: string;
  worker_id: string;
  started_at: string;
  effective_date: string;
  attempted: number;
  applied: number;
  failed: number;
  skipped: number;
};

type OnboardingApplyAttemptRow = {
  transaction_request_id: string;
  status_code: string;
  attempted_at: string;
  worker_id: string;
  correlation_id: string;
  error_message: string | null;
};

const repoOwnedSyntheticScope = "repo_owned_synthetic_mvp_d";
const operatorDecisionActionPrefix = "mvp_d.ops_job.operator_decision";

export function readLocalOpsJobStatus(
  db: OnboardingTransactionRequestDatabase,
  input: ReadLocalOpsJobStatusInput,
): LocalOpsJobStatus {
  const command = normalizeStatusInput(input);

  if (command.workflow === "csv_import") {
    return readCsvImportOpsJobStatus(db, command.correlationId);
  }

  return readOnboardingApplyOpsJobStatus(db, command.correlationId);
}

export function recordLocalOpsOperatorDecision(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsOperatorDecisionInput,
): LocalOpsOperatorDecisionResult {
  const command = normalizeOperatorDecisionInput(input);
  const current = readLocalOpsJobStatus(db, command);
  if (current.evidenceVersion !== command.expectedEvidenceVersion) {
    throw new Error(
      "local ops job operator decision requires current evidence",
    );
  }
  if (current.status !== "failed") {
    throw new Error(
      "local ops job operator decision requires a failed local job",
    );
  }
  if (
    command.workflow !== "csv_import" ||
    !(
      command.decision === "acknowledge_failure" ||
      command.decision === "escalate_for_manual_review"
    )
  ) {
    throwUnsupportedOperatorTransition();
  }

  const action = `${operatorDecisionActionPrefix}.${command.workflow}.${command.decision}`;
  const auditEventId = buildOperatorDecisionAuditEventId(command);
  const subjectId = buildOperatorDecisionSubjectId(command);
  const result = db
    .prepare(
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
        ON CONFLICT(id) DO NOTHING
      `,
    )
    .run(
      auditEventId,
      command.decidedBy,
      action,
      subjectId,
      command.decidedAt,
      command.decisionCorrelationId,
    );

  if (!isSingleSqlChange(result)) {
    const existing = db
      .prepare(
        `
          SELECT
            actor_id,
            action,
            subject_id,
            occurred_at,
            correlation_id
          FROM audit_event
          WHERE id = ?
          LIMIT 1
        `,
      )
      .get(auditEventId) as
      | {
          actor_id: string;
          action: string;
          subject_id: string;
          occurred_at: string;
          correlation_id: string | null;
        }
      | undefined;

    if (
      !existing ||
      existing.actor_id !== command.decidedBy ||
      existing.action !== action ||
      existing.subject_id !== subjectId ||
      existing.occurred_at !== command.decidedAt ||
      existing.correlation_id !== command.decisionCorrelationId
    ) {
      throw new Error(
        "local ops job operator decision conflicts with existing evidence",
      );
    }
  }

  return {
    auditEventId,
    action,
    correlationId: command.decisionCorrelationId,
    evidenceVersion: current.evidenceVersion,
  };
}

export function rejectBroadLocalOpsJobSearch(input: {
  workflow?: string;
  correlationId?: string;
}): never {
  const workflow = input.workflow?.trim() ?? "";
  const correlationId = input.correlationId?.trim() ?? "";
  if (workflow.length === 0 || correlationId.length === 0) {
    throw new Error(
      "local ops job status requires explicit workflow and correlation id",
    );
  }

  throw new Error("local ops job status does not support broad audit search");
}

function readCsvImportOpsJobStatus(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): LocalOpsJobStatus {
  const job = db
    .prepare(
      `
        SELECT
          id,
          correlation_id,
          status_code,
          requested_at,
          requested_by,
          accepted_rows,
          failed_rows
        FROM csv_import_job
        WHERE correlation_id = ?
        LIMIT 1
      `,
    )
    .get(correlationId) as CsvImportJobRow | undefined;

  if (!job) {
    throw new Error("local ops job status requires an existing CSV import job");
  }

  const statement = db.prepare(
    `
      SELECT
        row_id,
        lifecycle_type,
        status_code,
        transaction_request_id,
        lifecycle_event_id,
        error_message,
        correlation_id,
        decided_at
      FROM csv_import_row_outcome
      WHERE job_id = ?
      ORDER BY decided_at, row_id
    `,
  );
  if (!statement.all) {
    throw new Error("local ops job status requires query-all support");
  }

  const outcomes = statement.all(job.id) as CsvImportOutcomeRow[];
  const failed = outcomes.filter((outcome) => outcome.status_code === "failed");
  const applied = outcomes.filter(
    (outcome) =>
      outcome.status_code === "applied" || outcome.status_code === "idempotent",
  );

  return {
    workflow: "csv_import",
    correlationId: job.correlation_id,
    scope: repoOwnedSyntheticScope,
    readiness: localOpsJobReadiness,
    status: job.status_code === "failed" ? "failed" : "applied",
    evidenceVersion: buildEvidenceVersion([
      "csv_import",
      job.id,
      job.status_code,
      String(job.accepted_rows),
      String(job.failed_rows),
      ...outcomes.map((outcome) =>
        [
          outcome.row_id,
          outcome.status_code,
          outcome.correlation_id,
          outcome.decided_at,
        ].join(":"),
      ),
    ]),
    operatorEvidence: {
      actorId: job.requested_by,
      recordedAt: job.requested_at,
      correlationId: job.correlation_id,
    },
    counts: {
      attempted: outcomes.length,
      applied: applied.length,
      failed: failed.length,
      skipped: 0,
    },
    rows: outcomes.map((outcome) => ({
      rowId: outcome.row_id,
      lifecycleType: outcome.lifecycle_type,
      status: outcome.status_code,
      correlationId: outcome.correlation_id,
      decidedAt: outcome.decided_at,
      transactionRequestId: outcome.transaction_request_id,
      lifecycleEventId: outcome.lifecycle_event_id,
      errorMessage: outcome.error_message,
    })),
  };
}

function readOnboardingApplyOpsJobStatus(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): LocalOpsJobStatus {
  const run = db
    .prepare(
      `
        SELECT
          correlation_id,
          worker_id,
          started_at,
          effective_date,
          attempted,
          applied,
          failed,
          skipped
        FROM onboarding_apply_job_run
        WHERE correlation_id = ?
        LIMIT 1
      `,
    )
    .get(correlationId) as OnboardingApplyJobRunRow | undefined;

  if (!run) {
    throw new Error(
      "local ops job status requires an existing onboarding apply job run",
    );
  }

  const statement = db.prepare(
    `
      SELECT
        transaction_request_id,
        status_code,
        attempted_at,
        worker_id,
        correlation_id,
        error_message
      FROM onboarding_apply_job_attempt
      WHERE correlation_id >= ?
        AND correlation_id < ?
      ORDER BY attempted_at, transaction_request_id
    `,
  );
  if (!statement.all) {
    throw new Error("local ops job status requires query-all support");
  }

  const prefix = `${run.correlation_id}:transaction_request:`;
  const attempts = (
    statement.all(prefix, `${prefix}\uffff`) as OnboardingApplyAttemptRow[]
  ).filter((attempt) => attempt.correlation_id.startsWith(prefix));

  return {
    workflow: "onboarding_apply",
    correlationId: run.correlation_id,
    scope: repoOwnedSyntheticScope,
    readiness: localOpsJobReadiness,
    status:
      run.failed > 0 ? "failed" : run.attempted === 0 ? "empty" : "completed",
    evidenceVersion: buildEvidenceVersion([
      "onboarding_apply",
      run.correlation_id,
      run.worker_id,
      run.started_at,
      run.effective_date,
      String(run.attempted),
      String(run.applied),
      String(run.failed),
      String(run.skipped),
      ...attempts.map((attempt) =>
        [
          attempt.transaction_request_id,
          attempt.status_code,
          attempt.correlation_id,
          attempt.attempted_at,
        ].join(":"),
      ),
    ]),
    operatorEvidence: {
      actorId: run.worker_id,
      recordedAt: run.started_at,
      correlationId: run.correlation_id,
    },
    counts: {
      attempted: run.attempted,
      applied: run.applied,
      failed: run.failed,
      skipped: run.skipped,
    },
    rows: attempts.map((attempt) => ({
      rowId: attempt.transaction_request_id,
      lifecycleType: "onboarding",
      status: attempt.status_code,
      correlationId: attempt.correlation_id,
      decidedAt: attempt.attempted_at,
      transactionRequestId: attempt.transaction_request_id,
      lifecycleEventId: null,
      errorMessage: attempt.error_message,
    })),
  };
}

function normalizeStatusInput(
  input: ReadLocalOpsJobStatusInput,
): ReadLocalOpsJobStatusInput {
  const workflow = input.workflow.trim();
  const correlationId = input.correlationId.trim();
  if (!isLocalOpsJobWorkflow(workflow) || correlationId.length === 0) {
    rejectBroadLocalOpsJobSearch(input);
  }

  return { workflow, correlationId };
}

function normalizeOperatorDecisionInput(
  input: RecordLocalOpsOperatorDecisionInput,
): RecordLocalOpsOperatorDecisionInput {
  const status = normalizeStatusInput(input);
  const reason = input.reason.trim();
  const decidedAt = input.decidedAt.trim();
  const decidedBy = input.decidedBy.trim();
  const decisionCorrelationId = input.decisionCorrelationId.trim();
  const expectedEvidenceVersion = input.expectedEvidenceVersion.trim();

  if (reason.length === 0) {
    throw new Error("local ops job operator decision requires a reason");
  }
  if (decidedAt.length === 0 || !decidedAt.includes("T")) {
    throw new Error(
      "local ops job operator decision requires an ISO timestamp",
    );
  }
  if (decidedBy.length === 0 || decisionCorrelationId.length === 0) {
    throw new Error(
      "local ops job operator decision requires actor and correlation evidence",
    );
  }
  if (expectedEvidenceVersion.length === 0) {
    throw new Error(
      "local ops job operator decision requires current evidence",
    );
  }

  return {
    ...input,
    ...status,
    reason,
    decidedAt,
    decidedBy,
    decisionCorrelationId,
    expectedEvidenceVersion,
  };
}

function isLocalOpsJobWorkflow(
  workflow: string,
): workflow is LocalOpsJobWorkflow {
  return workflow === "csv_import" || workflow === "onboarding_apply";
}

function buildEvidenceVersion(parts: string[]): string {
  return `local-ops-evidence-${encodeStableKey(parts)}`;
}

function buildOperatorDecisionAuditEventId(
  input: RecordLocalOpsOperatorDecisionInput,
): string {
  return `audit-event-local-ops-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.decision,
    input.decisionCorrelationId,
  ])}`;
}

function buildOperatorDecisionSubjectId(
  input: RecordLocalOpsOperatorDecisionInput,
): string {
  return `local-ops-job-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.decision,
    input.expectedEvidenceVersion,
    input.reason,
  ])}`;
}

function throwUnsupportedOperatorTransition(): never {
  throw new Error(
    "local ops job operator decision rejects unsupported transition",
  );
}
