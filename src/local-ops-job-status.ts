import {
  buildWorkerAttemptCorrelationId,
  buildWorkerAttemptCorrelationIdSearchPrefix,
} from "./onboarding-transaction-request-ids.js";
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
export type LocalOpsFailureDecision = "retry" | "replay" | "ignore" | "close";
export type LocalOpsFailureStatus = "open" | "replayed" | "ignored" | "closed";

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

export interface RecordLocalOpsFailureDecisionInput extends ReadLocalOpsJobStatusInput {
  rowId: string;
  decision: LocalOpsFailureDecision;
  reason: string;
  decidedAt: string;
  decidedBy: string;
  decisionCorrelationId: string;
  expectedEvidenceVersion: string;
}

export interface LocalOpsFailureDecisionResult {
  decisionId: string;
  auditEventId: string;
  action: string;
  correlationId: string;
  evidenceVersion: string;
  failureStatus: LocalOpsFailureStatus;
  retryCount: number;
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

type LocalOpsFailureDecisionRow = {
  id: string;
  audit_event_id: string;
  action: string;
  evidence_version: string;
  failure_status: LocalOpsFailureStatus;
  retry_count: number;
  decided_by: string;
  decided_at: string;
  reason: string;
  decision_correlation_id: string;
};

const repoOwnedSyntheticScope = "repo_owned_synthetic_mvp_d";
const operatorDecisionActionPrefix = "mvp_d.ops_job.operator_decision";
const failureDecisionActionPrefix = "mvp_d.ops_job.failure_decision";
const maxLocalOpsFailureRetries = 3;

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

export function recordLocalOpsFailureDecision(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
): LocalOpsFailureDecisionResult {
  const command = normalizeFailureDecisionInput(input);
  if (command.workflow !== "csv_import") {
    throw new Error(
      "local ops failure decision rejects unsupported source type",
    );
  }

  ensureLocalOpsFailureDecisionTable(db);

  const action = `${failureDecisionActionPrefix}.${command.workflow}.${command.decision}`;
  const decisionId = buildFailureDecisionId(command);
  const auditEventId = buildFailureDecisionAuditEventId(command);
  const existingDecision = readMatchingLocalOpsFailureDecision(
    db,
    command,
    decisionId,
    action,
  );
  if (existingDecision) {
    return existingDecision;
  }

  const priorDecision = readMatchingOrRejectPriorLocalOpsFailureState(
    db,
    command,
    decisionId,
    action,
  );
  if (priorDecision) {
    return priorDecision;
  }

  const current = readLocalOpsJobStatus(db, command);
  if (current.evidenceVersion !== command.expectedEvidenceVersion) {
    throw new Error("local ops failure decision requires current evidence");
  }
  const failureRow = current.rows.find((row) => row.rowId === command.rowId);
  if (!failureRow || failureRow.status !== "failed") {
    throw new Error("local ops failure decision requires a failed row");
  }

  while (true) {
    const loopPriorDecision = readMatchingOrRejectPriorLocalOpsFailureState(
      db,
      command,
      decisionId,
      action,
    );
    if (loopPriorDecision) {
      return loopPriorDecision;
    }

    const priorRetryCount = countPriorLocalOpsFailureRetries(db, command);
    const retryCount =
      command.decision === "retry" ? priorRetryCount + 1 : priorRetryCount;
    if (retryCount > maxLocalOpsFailureRetries) {
      throw new Error("local ops failure decision retry limit exceeded");
    }

    const failureStatus = failureStatusForDecision(command.decision);
    const resultRow: LocalOpsFailureDecisionRow = {
      id: decisionId,
      audit_event_id: auditEventId,
      action,
      evidence_version: command.expectedEvidenceVersion,
      failure_status: failureStatus,
      retry_count: retryCount,
      decided_by: command.decidedBy,
      decided_at: command.decidedAt,
      reason: command.reason,
      decision_correlation_id: command.decisionCorrelationId,
    };

    db.exec("SAVEPOINT local_ops_failure_decision");
    try {
      insertLocalOpsFailureDecisionAuditEvent(
        db,
        command,
        action,
        auditEventId,
      );
      insertLocalOpsFailureDecision(db, command, resultRow);
      db.exec("RELEASE SAVEPOINT local_ops_failure_decision");
      return buildFailureDecisionResult(resultRow);
    } catch (error) {
      rollbackLocalOpsFailureDecisionSavepoint(db);
      const committedDecision = readMatchingLocalOpsFailureDecision(
        db,
        command,
        decisionId,
        action,
      );
      if (committedDecision) {
        return committedDecision;
      }
      const catchPriorDecision = readMatchingOrRejectPriorLocalOpsFailureState(
        db,
        command,
        decisionId,
        action,
      );
      if (catchPriorDecision) {
        return catchPriorDecision;
      }
      if (command.decision === "retry") {
        const durableRetryCount = countPriorLocalOpsFailureRetries(db, command);
        if (durableRetryCount >= maxLocalOpsFailureRetries) {
          throw new Error("local ops failure decision retry limit exceeded");
        }
        if (isRetryAttemptConflict(error)) {
          continue;
        }
      }
      throw error;
    }
  }
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

  const prefix = buildWorkerAttemptCorrelationIdSearchPrefix(
    run.correlation_id,
  );
  const attempts = (
    statement.all(prefix, `${prefix}\uffff`) as OnboardingApplyAttemptRow[]
  ).filter(
    (attempt) =>
      attempt.correlation_id ===
      buildWorkerAttemptCorrelationId(
        run.correlation_id,
        attempt.transaction_request_id,
      ),
  );

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

function normalizeFailureDecisionInput(
  input: RecordLocalOpsFailureDecisionInput,
): RecordLocalOpsFailureDecisionInput {
  const status = normalizeStatusInput(input);
  const rowId = input.rowId.trim();
  const decision = input.decision.trim();
  const reason = input.reason.trim();
  const decidedAt = input.decidedAt.trim();
  const decidedBy = input.decidedBy.trim();
  const decisionCorrelationId = input.decisionCorrelationId.trim();
  const expectedEvidenceVersion = input.expectedEvidenceVersion.trim();

  if (rowId.length === 0) {
    throw new Error("local ops failure decision requires a row id");
  }
  if (!isLocalOpsFailureDecision(decision)) {
    throw new Error(
      "local ops failure decision rejects unsupported transition",
    );
  }
  if (reason.length === 0) {
    throw new Error("local ops failure decision requires a reason");
  }
  if (decidedAt.length === 0 || !decidedAt.includes("T")) {
    throw new Error("local ops failure decision requires an ISO timestamp");
  }
  if (decidedBy.length === 0 || decisionCorrelationId.length === 0) {
    throw new Error(
      "local ops failure decision requires actor and correlation evidence",
    );
  }
  if (expectedEvidenceVersion.length === 0) {
    throw new Error("local ops failure decision requires current evidence");
  }

  return {
    ...input,
    ...status,
    rowId,
    decision,
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

function isLocalOpsFailureDecision(
  decision: string,
): decision is LocalOpsFailureDecision {
  return (
    decision === "retry" ||
    decision === "replay" ||
    decision === "ignore" ||
    decision === "close"
  );
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

function buildFailureDecisionId(
  input: RecordLocalOpsFailureDecisionInput,
): string {
  return `local-ops-failure-decision-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.rowId,
    input.decision,
    input.decisionCorrelationId,
  ])}`;
}

function buildFailureDecisionAuditEventId(
  input: RecordLocalOpsFailureDecisionInput,
): string {
  return `audit-event-local-ops-failure-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.rowId,
    input.decision,
    input.decisionCorrelationId,
  ])}`;
}

function buildFailureDecisionSubjectId(
  input: RecordLocalOpsFailureDecisionInput,
): string {
  return `local-ops-failure-${encodeStableKey([
    input.workflow,
    input.correlationId,
    input.rowId,
    input.expectedEvidenceVersion,
  ])}`;
}

function failureStatusForDecision(
  decision: LocalOpsFailureDecision,
): LocalOpsFailureStatus {
  if (decision === "replay") {
    return "replayed";
  }
  if (decision === "ignore") {
    return "ignored";
  }
  if (decision === "close") {
    return "closed";
  }

  return "open";
}

function ensureLocalOpsFailureDecisionTable(
  db: OnboardingTransactionRequestDatabase,
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS local_ops_failure_decision (
      id TEXT PRIMARY KEY,
      workflow TEXT NOT NULL,
      source_type TEXT NOT NULL,
      job_correlation_id TEXT NOT NULL,
      row_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      failure_status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      evidence_version TEXT NOT NULL,
      reason TEXT NOT NULL,
      decided_at TEXT NOT NULL,
      decided_by TEXT NOT NULL,
      decision_correlation_id TEXT NOT NULL UNIQUE,
      audit_event_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      CHECK(length(id) > 0),
      CHECK(workflow = 'csv_import'),
      CHECK(source_type = 'repo_owned_synthetic_mvp_d_csv_failure'),
      CHECK(length(job_correlation_id) > 0),
      CHECK(length(row_id) > 0),
      CHECK(decision in ('retry', 'replay', 'ignore', 'close')),
      CHECK(failure_status in ('open', 'replayed', 'ignored', 'closed')),
      CHECK(retry_count >= 0 AND retry_count <= 3),
      CHECK(length(evidence_version) > 0),
      CHECK(length(reason) > 0),
      CHECK(decided_at glob '????-??-??*'),
      CHECK(length(decided_by) > 0),
      CHECK(length(decision_correlation_id) > 0),
      CHECK(length(audit_event_id) > 0),
      CHECK(created_at glob '????-??-??*')
    )
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS local_ops_failure_decision_replay_unique
    ON local_ops_failure_decision (workflow, job_correlation_id, row_id, decision)
    WHERE decision = 'replay'
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS local_ops_failure_decision_status_consistency
    BEFORE INSERT ON local_ops_failure_decision
    WHEN NOT (
      (NEW.decision = 'retry' AND NEW.failure_status = 'open')
      OR (NEW.decision = 'replay' AND NEW.failure_status = 'replayed')
      OR (NEW.decision = 'ignore' AND NEW.failure_status = 'ignored')
      OR (NEW.decision = 'close' AND NEW.failure_status = 'closed')
    )
    BEGIN
      SELECT RAISE(ABORT, 'local ops failure decision requires consistent failure status');
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS local_ops_failure_decision_replay_guard
    BEFORE INSERT ON local_ops_failure_decision
    WHEN NEW.decision = 'replay'
      AND EXISTS (
        SELECT 1
        FROM local_ops_failure_decision
        WHERE workflow = NEW.workflow
          AND job_correlation_id = NEW.job_correlation_id
          AND row_id = NEW.row_id
          AND decision = 'replay'
      )
    BEGIN
      SELECT RAISE(ABORT, 'local ops failure decision rejects duplicate replay');
    END
  `);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS local_ops_failure_decision_retry_attempt_unique
    ON local_ops_failure_decision (
      workflow,
      job_correlation_id,
      row_id,
      decision,
      retry_count
    )
    WHERE decision = 'retry'
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS local_ops_failure_decision_retry_limit
    BEFORE INSERT ON local_ops_failure_decision
    WHEN NEW.decision = 'retry'
      AND (
        SELECT count(*)
        FROM local_ops_failure_decision
        WHERE workflow = NEW.workflow
          AND job_correlation_id = NEW.job_correlation_id
          AND row_id = NEW.row_id
          AND decision = 'retry'
      ) >= ${maxLocalOpsFailureRetries}
    BEGIN
      SELECT RAISE(ABORT, 'local ops failure decision retry limit exceeded');
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS local_ops_failure_decision_terminal_guard
    BEFORE INSERT ON local_ops_failure_decision
    WHEN EXISTS (
      SELECT 1
      FROM local_ops_failure_decision
      WHERE workflow = NEW.workflow
        AND job_correlation_id = NEW.job_correlation_id
        AND row_id = NEW.row_id
        AND failure_status IN ('ignored', 'closed')
    )
    BEGIN
      SELECT RAISE(ABORT, 'local ops failure decision rejects terminal failure state');
    END
  `);
}

function readLocalOpsFailureDecision(
  db: OnboardingTransactionRequestDatabase,
  decisionId: string,
): LocalOpsFailureDecisionRow | undefined {
  return db
    .prepare(
      `
        SELECT
          id,
          audit_event_id,
          action,
          evidence_version,
          failure_status,
          retry_count,
          decided_by,
          decided_at,
          reason,
          decision_correlation_id
        FROM (
          SELECT
            decision.id,
            decision.audit_event_id,
            audit.action,
            decision.evidence_version,
            decision.failure_status,
            decision.retry_count,
            decision.decided_by,
            decision.decided_at,
            decision.reason,
            decision.decision_correlation_id
          FROM local_ops_failure_decision AS decision
          JOIN audit_event AS audit
            ON audit.id = decision.audit_event_id
          WHERE decision.id = ?
          LIMIT 1
        )
      `,
    )
    .get(decisionId) as LocalOpsFailureDecisionRow | undefined;
}

function hasPriorLocalOpsFailureDecision(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
  decision: LocalOpsFailureDecision,
): boolean {
  const row = db
    .prepare(
      `
        SELECT id
        FROM local_ops_failure_decision
        WHERE workflow = ?
          AND job_correlation_id = ?
          AND row_id = ?
          AND decision = ?
        LIMIT 1
      `,
    )
    .get(input.workflow, input.correlationId, input.rowId, decision) as
    | { id: string }
    | undefined;

  return Boolean(row);
}

function readTerminalLocalOpsFailureDecision(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
): { id: string } | undefined {
  return db
    .prepare(
      `
        SELECT id
        FROM local_ops_failure_decision
        WHERE workflow = ?
          AND job_correlation_id = ?
          AND row_id = ?
          AND failure_status IN ('ignored', 'closed')
        ORDER BY decided_at DESC, id DESC
        LIMIT 1
      `,
    )
    .get(input.workflow, input.correlationId, input.rowId) as
    | { id: string }
    | undefined;
}

function countPriorLocalOpsFailureRetries(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
): number {
  const row = db
    .prepare(
      `
        SELECT count(*) AS count
        FROM local_ops_failure_decision
        WHERE workflow = ?
          AND job_correlation_id = ?
          AND row_id = ?
          AND decision = 'retry'
      `,
    )
    .get(input.workflow, input.correlationId, input.rowId) as
    | { count: number }
    | undefined;

  return row?.count ?? 0;
}

function rejectTerminalLocalOpsFailureState(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
): void {
  const terminalDecision = readTerminalLocalOpsFailureDecision(db, input);
  if (terminalDecision) {
    throw new Error(
      "local ops failure decision rejects terminal failure state",
    );
  }
}

function readMatchingLocalOpsFailureDecision(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
  decisionId: string,
  action: string,
): LocalOpsFailureDecisionResult | undefined {
  const existingDecision = readLocalOpsFailureDecision(db, decisionId);
  if (!existingDecision) {
    return undefined;
  }
  assertFailureDecisionMatchesExisting(existingDecision, input, action);
  return buildFailureDecisionResult(existingDecision);
}

function readMatchingOrRejectPriorLocalOpsFailureState(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
  decisionId: string,
  action: string,
): LocalOpsFailureDecisionResult | undefined {
  const existingDecision = readMatchingLocalOpsFailureDecision(
    db,
    input,
    decisionId,
    action,
  );
  if (existingDecision) {
    return existingDecision;
  }

  try {
    rejectTerminalLocalOpsFailureState(db, input);
  } catch (error) {
    const racedDecision = readMatchingLocalOpsFailureDecision(
      db,
      input,
      decisionId,
      action,
    );
    if (racedDecision) {
      return racedDecision;
    }
    throw error;
  }
  if (
    input.decision === "replay" &&
    hasPriorLocalOpsFailureDecision(db, input, "replay")
  ) {
    const racedDecision = readMatchingLocalOpsFailureDecision(
      db,
      input,
      decisionId,
      action,
    );
    if (racedDecision) {
      return racedDecision;
    }
    throw new Error("local ops failure decision rejects duplicate replay");
  }
  return undefined;
}

function isRetryAttemptConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(
    "UNIQUE constraint failed: local_ops_failure_decision.workflow, local_ops_failure_decision.job_correlation_id, local_ops_failure_decision.row_id, local_ops_failure_decision.decision, local_ops_failure_decision.retry_count",
  );
}

function insertLocalOpsFailureDecisionAuditEvent(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
  action: string,
  auditEventId: string,
): void {
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
      `,
    )
    .run(
      auditEventId,
      input.decidedBy,
      action,
      buildFailureDecisionSubjectId(input),
      input.decidedAt,
      input.decisionCorrelationId,
    );

  if (!isSingleSqlChange(result)) {
    throw new Error(
      "local ops failure decision audit evidence was not written",
    );
  }
}

function insertLocalOpsFailureDecision(
  db: OnboardingTransactionRequestDatabase,
  input: RecordLocalOpsFailureDecisionInput,
  row: LocalOpsFailureDecisionRow,
): void {
  const result = db
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
    )
    .run(
      row.id,
      input.workflow,
      input.correlationId,
      input.rowId,
      input.decision,
      row.failure_status,
      row.retry_count,
      row.evidence_version,
      row.reason,
      row.decided_at,
      row.decided_by,
      row.decision_correlation_id,
      row.audit_event_id,
      row.decided_at,
    );

  if (!isSingleSqlChange(result)) {
    throw new Error("local ops failure decision evidence was not written");
  }
}

function assertFailureDecisionMatchesExisting(
  existing: LocalOpsFailureDecisionRow,
  input: RecordLocalOpsFailureDecisionInput,
  action: string,
): void {
  if (
    existing.action !== action ||
    existing.evidence_version !== input.expectedEvidenceVersion ||
    existing.decided_by !== input.decidedBy ||
    existing.decided_at !== input.decidedAt ||
    existing.reason !== input.reason ||
    existing.decision_correlation_id !== input.decisionCorrelationId
  ) {
    throw new Error(
      "local ops failure decision conflicts with existing evidence",
    );
  }
}

function buildFailureDecisionResult(
  row: LocalOpsFailureDecisionRow,
): LocalOpsFailureDecisionResult {
  return {
    decisionId: row.id,
    auditEventId: row.audit_event_id,
    action: row.action,
    correlationId: row.decision_correlation_id,
    evidenceVersion: row.evidence_version,
    failureStatus: row.failure_status,
    retryCount: row.retry_count,
  };
}

function rollbackLocalOpsFailureDecisionSavepoint(
  db: OnboardingTransactionRequestDatabase,
): void {
  db.exec("ROLLBACK TO SAVEPOINT local_ops_failure_decision");
  db.exec("RELEASE SAVEPOINT local_ops_failure_decision");
}

function throwUnsupportedOperatorTransition(): never {
  throw new Error(
    "local ops job operator decision rejects unsupported transition",
  );
}
