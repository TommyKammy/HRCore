import type { MvpDCsvImportDryRunResult } from "./csv-import-contract.js";
import { mvpDCsvExportScope } from "./csv-export-policy.js";
import {
  localOpsJobReadiness,
  readLocalOpsJobStatus,
  type LocalOpsFailureDecision,
} from "./local-ops-job-status.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";

export class MvpDCsvOpsDlqTraceabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MvpDCsvOpsDlqTraceabilityError";
  }
}

export interface MvpDDeniedCsvExportGuardEvidence {
  scope: typeof mvpDCsvExportScope;
  requestedBy: string;
  requestedAt: string;
  correlationId: string;
  errorMessage: string;
  auditEventCountBefore: number;
  auditEventCountAfter: number;
}

export interface VerifyMvpDCsvOpsDlqTraceabilityInput {
  dryRun: MvpDCsvImportDryRunResult;
  appliedJobCorrelationId: string;
  deniedExport: MvpDDeniedCsvExportGuardEvidence;
  requiredFailureDecisions: readonly LocalOpsFailureDecision[];
}

export interface MvpDCsvOpsDlqTrace {
  readiness: typeof localOpsJobReadiness;
  importJob: {
    id: string;
    correlationId: string;
    requestedBy: string;
    requestedAt: string;
    statusCode: string;
  };
  dryRun: {
    acceptedRowIds: string[];
    rejectedRowIds: Array<string | null>;
    diffCorrelationIds: string[];
  };
  deniedExport: MvpDDeniedCsvExportGuardEvidence;
  operatorActions: Array<{
    auditEventId: string;
    action: string;
    actorId: string;
    correlationId: string;
    occurredAt: string;
  }>;
  failureDecisions: Array<{
    id: string;
    rowId: string;
    decision: LocalOpsFailureDecision;
    failureStatus: string;
    reason: string;
    decidedBy: string;
    decisionCorrelationId: string;
    auditEventId: string;
  }>;
}

type CsvImportJobTraceRow = {
  id: string;
  correlation_id: string;
  requested_by: string;
  requested_at: string;
  status_code: string;
};

type AuditEventTraceRow = {
  id: string;
  actor_id: string;
  action: string;
  occurred_at: string;
  correlation_id: string | null;
};

type FailureDecisionTraceRow = {
  id: string;
  row_id: string;
  decision: LocalOpsFailureDecision;
  failure_status: string;
  reason: string;
  decided_by: string;
  decision_correlation_id: string;
  audit_event_id: string;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_correlation_id: string | null;
};

const operatorActionPrefix = "mvp_d.ops_job.operator_decision.csv_import.";
const failureActionPrefix = "mvp_d.ops_job.failure_decision.csv_import.";
const csvExportAuditAction = "mvp_d.csv_export.synthetic_download_intent";

export function verifyMvpDCsvOpsDlqTraceability(
  db: OnboardingTransactionRequestDatabase,
  input: VerifyMvpDCsvOpsDlqTraceabilityInput,
): MvpDCsvOpsDlqTrace {
  const appliedJobCorrelationId = requireTraceValue(
    input.appliedJobCorrelationId,
    "MVP-D trace requires an applied CSV import correlation id",
  );
  const job = readCsvImportJobTrace(db, appliedJobCorrelationId);
  const opsStatus = readLocalOpsJobStatus(db, {
    workflow: "csv_import",
    correlationId: appliedJobCorrelationId,
  });
  if (opsStatus.readiness !== localOpsJobReadiness) {
    throwTraceError("MVP-D trace must stay bounded synthetic only");
  }
  if (opsStatus.rows.length === 0) {
    throwTraceError("MVP-D trace requires CSV row outcome evidence");
  }
  for (const row of opsStatus.rows) {
    requireTraceValue(
      row.rowId,
      "MVP-D trace requires row id evidence for every CSV outcome",
    );
    requireTraceValue(
      row.correlationId,
      "MVP-D trace requires row correlation evidence for every CSV outcome",
    );
  }

  const dryRun = verifyDryRunTrace(input.dryRun);
  const deniedExport = verifyDeniedExportGuardEvidence(db, input.deniedExport);
  const operatorActions = readOperatorActions(db, appliedJobCorrelationId);
  if (operatorActions.length === 0) {
    throwTraceError("MVP-D trace requires operator action evidence");
  }

  const failureDecisions = readFailureDecisions(db, appliedJobCorrelationId);
  verifyFailureDecisions(failureDecisions, input.requiredFailureDecisions);

  return {
    readiness: localOpsJobReadiness,
    importJob: {
      id: job.id,
      correlationId: job.correlation_id,
      requestedBy: job.requested_by,
      requestedAt: job.requested_at,
      statusCode: job.status_code,
    },
    dryRun,
    deniedExport,
    operatorActions: operatorActions.map((action) => ({
      auditEventId: action.id,
      action: action.action,
      actorId: action.actor_id,
      correlationId: requireTraceValue(
        action.correlation_id ?? "",
        "MVP-D trace requires operator action correlation evidence",
      ),
      occurredAt: action.occurred_at,
    })),
    failureDecisions: failureDecisions.map((decision) => ({
      id: decision.id,
      rowId: decision.row_id,
      decision: decision.decision,
      failureStatus: decision.failure_status,
      reason: decision.reason,
      decidedBy: decision.decided_by,
      decisionCorrelationId: decision.decision_correlation_id,
      auditEventId: decision.audit_event_id,
    })),
  };
}

function readCsvImportJobTrace(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): CsvImportJobTraceRow {
  const job = db
    .prepare(
      `
        SELECT id, correlation_id, requested_by, requested_at, status_code
        FROM csv_import_job
        WHERE correlation_id = ?
        LIMIT 1
      `,
    )
    .get(correlationId) as CsvImportJobTraceRow | undefined;
  if (!job) {
    throwTraceError("MVP-D trace requires persisted CSV import job evidence");
  }

  requireTraceValue(job.id, "MVP-D trace requires CSV import job id evidence");
  requireTraceValue(
    job.requested_by,
    "MVP-D trace requires CSV import operator evidence",
  );
  return job;
}

function verifyDryRunTrace(
  dryRun: MvpDCsvImportDryRunResult,
): MvpDCsvOpsDlqTrace["dryRun"] {
  if (dryRun.mutatesRecords !== false) {
    throwTraceError("MVP-D trace requires non-mutating dry-run evidence");
  }
  if (dryRun.acceptedRows.length === 0) {
    throwTraceError("MVP-D trace requires successful import dry-run evidence");
  }
  if (dryRun.rejectedRows.length === 0) {
    throwTraceError("MVP-D trace requires rejected import evidence");
  }

  const diffCorrelationIds = dryRun.diffs.map((diff) =>
    requireTraceValue(
      diff.evidence.correlationId,
      "MVP-D trace requires dry-run diff correlation evidence",
    ),
  );
  for (const acceptedRow of dryRun.acceptedRows) {
    requireTraceValue(
      acceptedRow.rowId,
      "MVP-D trace requires accepted dry-run row id evidence",
    );
  }
  for (const rejectedRow of dryRun.rejectedRows) {
    if (rejectedRow.reasons.length === 0) {
      throwTraceError("MVP-D trace requires rejected import reasons");
    }
  }

  return {
    acceptedRowIds: dryRun.acceptedRows.map((row) => row.rowId),
    rejectedRowIds: dryRun.rejectedRows.map((row) => row.rowId),
    diffCorrelationIds,
  };
}

function verifyDeniedExportGuardEvidence(
  db: OnboardingTransactionRequestDatabase,
  evidence: MvpDDeniedCsvExportGuardEvidence,
): MvpDDeniedCsvExportGuardEvidence {
  if (evidence.scope !== mvpDCsvExportScope) {
    throwTraceError("MVP-D trace requires bounded denied export scope");
  }
  requireTraceValue(
    evidence.requestedBy,
    "MVP-D trace requires denied export actor evidence",
  );
  requireTraceValue(
    evidence.correlationId,
    "MVP-D trace requires denied export correlation evidence",
  );
  requireTraceValue(
    evidence.errorMessage,
    "MVP-D trace requires denied export guard error evidence",
  );
  if (
    evidence.auditEventCountBefore !== evidence.auditEventCountAfter ||
    evidence.auditEventCountAfter !==
      countExportAuditEvents(db, evidence.correlationId)
  ) {
    throwTraceError(
      "MVP-D trace requires denied export guard evidence without audit writes",
    );
  }
  if (
    evidence.errorMessage !==
    "CSV export request is outside the bounded synthetic MVP-D policy"
  ) {
    throwTraceError(
      "MVP-D trace requires bounded denied export guard evidence",
    );
  }

  return evidence;
}

function countExportAuditEvents(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): number {
  const row = db
    .prepare(
      `
        SELECT count(*) AS count
        FROM audit_event
        WHERE action = ?
          AND correlation_id = ?
      `,
    )
    .get(csvExportAuditAction, correlationId) as
    | { count: number | bigint }
    | undefined;
  return Number(row?.count ?? 0);
}

function readOperatorActions(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): AuditEventTraceRow[] {
  const statement = db.prepare(
    `
      SELECT id, actor_id, action, occurred_at, correlation_id
      FROM audit_event
      WHERE action >= ?
        AND action < ?
      ORDER BY occurred_at, id
    `,
  );
  if (!statement.all) {
    throwTraceError("MVP-D trace requires query-all support");
  }

  return (
    statement.all(
      operatorActionPrefix,
      `${operatorActionPrefix}\uffff`,
    ) as AuditEventTraceRow[]
  ).filter(
    (row) =>
      row.action.includes(`.${correlationId}.`) ||
      row.action.startsWith(operatorActionPrefix),
  );
}

function readFailureDecisions(
  db: OnboardingTransactionRequestDatabase,
  correlationId: string,
): FailureDecisionTraceRow[] {
  const statement = db.prepare(
    `
      SELECT
        decision.id,
        decision.row_id,
        decision.decision,
        decision.failure_status,
        decision.reason,
        decision.decided_by,
        decision.decision_correlation_id,
        decision.audit_event_id,
        audit_event.actor_id AS audit_actor_id,
        audit_event.action AS audit_action,
        audit_event.correlation_id AS audit_correlation_id
      FROM local_ops_failure_decision AS decision
      LEFT JOIN audit_event
        ON audit_event.id = decision.audit_event_id
      WHERE decision.workflow = 'csv_import'
        AND decision.job_correlation_id = ?
      ORDER BY decision.decided_at, decision.id
    `,
  );
  if (!statement.all) {
    throwTraceError("MVP-D trace requires query-all support");
  }

  return statement.all(correlationId) as FailureDecisionTraceRow[];
}

function verifyFailureDecisions(
  decisions: FailureDecisionTraceRow[],
  requiredDecisions: readonly LocalOpsFailureDecision[],
): void {
  if (decisions.length === 0) {
    throwTraceError("MVP-D trace requires DLQ decision evidence");
  }
  for (const decision of decisions) {
    requireTraceValue(
      decision.row_id,
      "MVP-D trace requires DLQ row id evidence",
    );
    requireTraceValue(
      decision.reason,
      "MVP-D trace requires DLQ operator reason evidence",
    );
    requireTraceValue(
      decision.decided_by,
      "MVP-D trace requires DLQ operator actor evidence",
    );
    requireTraceValue(
      decision.decision_correlation_id,
      "MVP-D trace requires DLQ decision correlation evidence",
    );
    if (
      decision.audit_actor_id !== decision.decided_by ||
      decision.audit_action !== `${failureActionPrefix}${decision.decision}` ||
      decision.audit_correlation_id !== decision.decision_correlation_id
    ) {
      throwTraceError("MVP-D trace requires matching DLQ audit evidence");
    }
  }

  for (const requiredDecision of requiredDecisions) {
    if (!decisions.some((decision) => decision.decision === requiredDecision)) {
      throwTraceError(
        `MVP-D trace requires ${requiredDecision} DLQ decision evidence`,
      );
    }
  }
}

function requireTraceValue(value: string, message: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throwTraceError(message);
  }

  return trimmed;
}

function throwTraceError(message: string): never {
  throw new MvpDCsvOpsDlqTraceabilityError(message);
}
