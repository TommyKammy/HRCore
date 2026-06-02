import type {
  MvpDCsvImportDryRunDiff,
  MvpDCsvImportDryRunResult,
  MvpDCsvLifecycleType,
} from "./csv-import-contract.js";
import { mvpDCsvExportScope } from "./csv-export-policy.js";
import {
  localOpsJobReadiness,
  readLocalOpsJobStatus,
  type LocalOpsFailureDecision,
  type LocalOpsJobRowEvidence,
  type LocalOpsOperatorDecision,
} from "./local-ops-job-status.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import { encodeStableKey } from "./onboarding-transaction-request-shared.js";

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
  subject_id: string;
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
  evidence_version: string;
  audit_actor_id: string | null;
  audit_action: string | null;
  audit_correlation_id: string | null;
  row_outcome_status: string | null;
  row_outcome_correlation_id: string | null;
};

const requiredMvpDFailureDecisions = [
  "retry",
  "replay",
  "ignore",
  "close",
] as const satisfies readonly LocalOpsFailureDecision[];
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
  if (opsStatus.status !== "failed") {
    throwTraceError("MVP-D trace requires failed local Ops status evidence");
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

  const dryRun = verifyDryRunTrace(input.dryRun, opsStatus.rows);
  const deniedExport = verifyDeniedExportGuardEvidence(db, input.deniedExport);
  const operatorActions = readOperatorActions(db, appliedJobCorrelationId);
  if (operatorActions.length === 0) {
    throwTraceError("MVP-D trace requires operator action evidence");
  }
  verifyOperatorActions(operatorActions, opsStatus.evidenceVersion);

  const failureDecisions = readFailureDecisions(db, appliedJobCorrelationId);
  verifyFailureDecisions(
    failureDecisions,
    input.requiredFailureDecisions,
    opsStatus.rows,
    appliedJobCorrelationId,
    opsStatus.evidenceVersion,
  );

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
  jobRows: LocalOpsJobRowEvidence[],
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

  if (dryRun.diffs.length !== dryRun.acceptedRows.length) {
    throwTraceError(
      "MVP-D trace requires dry-run diff evidence for every accepted row",
    );
  }

  const jobRowsById = new Map(jobRows.map((row) => [row.rowId, row]));
  const diffCorrelationIds: string[] = [];
  const seenAcceptedRowIds = new Set<string>();
  const seenDiffRowIds = new Set<string>();
  const diffsByRowId = new Map<string, (typeof dryRun.diffs)[number]>();
  for (const diff of dryRun.diffs) {
    const rowId = requireTraceValue(
      diff.rowId,
      "MVP-D trace requires dry-run diff row id evidence",
    );
    if (seenDiffRowIds.has(rowId)) {
      throwTraceError("MVP-D trace requires unique dry-run diff evidence");
    }
    seenDiffRowIds.add(rowId);
    diffsByRowId.set(rowId, diff);
    const diffCorrelationId = requireTraceValue(
      diff.evidence.correlationId,
      "MVP-D trace requires dry-run diff correlation evidence",
    );
    if (
      diffCorrelationId !== `csv-import-${rowId}` ||
      diff.operation !== dryRunOperationForLifecycleType(diff.lifecycleType)
    ) {
      throwTraceError(
        "MVP-D trace requires deterministic dry-run diff evidence",
      );
    }
    diffCorrelationIds.push(diffCorrelationId);
  }

  for (const acceptedRow of dryRun.acceptedRows) {
    const rowId = requireTraceValue(
      acceptedRow.rowId,
      "MVP-D trace requires accepted dry-run row id evidence",
    );
    if (seenAcceptedRowIds.has(rowId)) {
      throwTraceError("MVP-D trace requires unique accepted dry-run rows");
    }
    seenAcceptedRowIds.add(rowId);

    const diff = diffsByRowId.get(rowId);
    if (!diff || diff.lifecycleType !== acceptedRow.lifecycleType) {
      throwTraceError(
        "MVP-D trace requires dry-run diff evidence for every accepted row",
      );
    }

    const jobRow = jobRowsById.get(rowId);
    if (!jobRow || jobRow.lifecycleType !== acceptedRow.lifecycleType) {
      throwTraceError(
        "MVP-D trace requires dry-run rows to match CSV job row outcomes",
      );
    }
  }
  if (jobRows.some((row) => !seenAcceptedRowIds.has(row.rowId))) {
    throwTraceError(
      "MVP-D trace requires CSV job row outcomes to match dry-run accepted rows",
    );
  }

  for (const rejectedRow of dryRun.rejectedRows) {
    if (
      rejectedRow.reasons.length === 0 ||
      rejectedRow.reasons.some((reason) => reason.trim().length === 0)
    ) {
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
  if (
    !isValidIsoTimestamp(
      requireTraceValue(
        evidence.requestedAt,
        "MVP-D trace requires denied export timestamp evidence",
      ),
    )
  ) {
    throwTraceError("MVP-D trace requires denied export timestamp evidence");
  }
  requireTraceValue(
    evidence.correlationId,
    "MVP-D trace requires denied export correlation evidence",
  );
  requireTraceValue(
    evidence.errorMessage,
    "MVP-D trace requires denied export guard error evidence",
  );
  const persistedDownloadAuditCount = countExportAuditEvents(
    db,
    evidence.correlationId,
  );
  if (
    evidence.auditEventCountBefore !== 0 ||
    evidence.auditEventCountAfter !== 0 ||
    persistedDownloadAuditCount !== 0
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
      SELECT id, actor_id, action, subject_id, occurred_at, correlation_id
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
  ).filter((row) => isOperatorActionForJob(row, correlationId));
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
        decision.evidence_version,
        audit_event.actor_id AS audit_actor_id,
        audit_event.action AS audit_action,
        audit_event.correlation_id AS audit_correlation_id,
        row_outcome.status_code AS row_outcome_status,
        row_outcome.correlation_id AS row_outcome_correlation_id
      FROM local_ops_failure_decision AS decision
      INNER JOIN csv_import_job AS job
        ON job.correlation_id = decision.job_correlation_id
      LEFT JOIN csv_import_row_outcome AS row_outcome
        ON row_outcome.job_id = job.id
        AND row_outcome.row_id = decision.row_id
        AND row_outcome.status_code = 'failed'
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

function verifyOperatorActions(
  actions: AuditEventTraceRow[],
  currentEvidenceVersion: string,
): void {
  const currentEvidenceSubjectPrefix = `local-ops-job-${currentEvidenceVersion}-`;
  for (const action of actions) {
    if (!action.subject_id.startsWith(currentEvidenceSubjectPrefix)) {
      throwTraceError("MVP-D trace requires current operator action evidence");
    }
  }
}

function verifyFailureDecisions(
  decisions: FailureDecisionTraceRow[],
  requiredDecisions: readonly LocalOpsFailureDecision[],
  jobRows: LocalOpsJobRowEvidence[],
  jobCorrelationId: string,
  currentEvidenceVersion: string,
): void {
  if (decisions.length === 0) {
    throwTraceError("MVP-D trace requires DLQ decision evidence");
  }
  const requiredDecisionSet = new Set(requiredDecisions);
  if (
    requiredMvpDFailureDecisions.some(
      (requiredDecision) => !requiredDecisionSet.has(requiredDecision),
    )
  ) {
    throwTraceError("MVP-D trace requires complete DLQ decision requirements");
  }
  const failedJobRowIds = new Set(
    jobRows.filter((row) => row.status === "failed").map((row) => row.rowId),
  );
  const decisionRowIds = new Set<string>();
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
    if (decision.evidence_version !== currentEvidenceVersion) {
      throwTraceError("MVP-D trace requires current DLQ decision evidence");
    }
    if (!failedJobRowIds.has(decision.row_id)) {
      throwTraceError(
        "MVP-D trace requires DLQ decisions to match failed CSV row outcomes",
      );
    }
    if (
      decision.row_outcome_status !== "failed" ||
      !decision.row_outcome_correlation_id?.trim()
    ) {
      throwTraceError(
        "MVP-D trace requires DLQ decisions to join failed CSV row outcomes",
      );
    }
    decisionRowIds.add(decision.row_id);
  }

  for (const failedRowId of failedJobRowIds) {
    if (!decisionRowIds.has(failedRowId)) {
      throwTraceError(
        "MVP-D trace requires DLQ decision evidence for every failed CSV row",
      );
    }
  }

  for (const decision of decisions) {
    if (
      decision.audit_event_id !==
        buildFailureDecisionAuditEventId(
          jobCorrelationId,
          decision.row_id,
          decision.decision,
          decision.decision_correlation_id,
        ) ||
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

function dryRunOperationForLifecycleType(
  lifecycleType: MvpDCsvLifecycleType,
): MvpDCsvImportDryRunDiff["operation"] {
  switch (lifecycleType) {
    case "onboarding":
      return "would_create_onboarding_request";
    case "transfer":
      return "would_create_transfer_request";
    case "termination":
      return "would_create_termination_request";
  }
}

function isValidIsoTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) {
    return false;
  }
  const [, year, month, day, hour, minute, second, millisecond, offset] = match;
  const localDate = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
      Number((millisecond ?? "").padEnd(3, "0")),
    ),
  );
  const date = new Date(value);
  const offsetHour = offset === "Z" ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === "Z" ? 0 : Number(offset.slice(4, 6));
  return (
    !Number.isNaN(date.getTime()) &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    localDate.getUTCFullYear() === Number(year) &&
    localDate.getUTCMonth() + 1 === Number(month) &&
    localDate.getUTCDate() === Number(day) &&
    localDate.getUTCHours() === Number(hour) &&
    localDate.getUTCMinutes() === Number(minute) &&
    localDate.getUTCSeconds() === Number(second)
  );
}

function isOperatorActionForJob(
  row: AuditEventTraceRow,
  correlationId: string,
): boolean {
  const decision = parseOperatorDecision(row.action);
  if (!decision) {
    return false;
  }
  const decisionCorrelationId = row.correlation_id?.trim();
  if (!decisionCorrelationId) {
    return false;
  }
  return (
    row.id ===
    `audit-event-local-ops-${encodeStableKey([
      "csv_import",
      correlationId,
      decision,
      decisionCorrelationId,
    ])}`
  );
}

function parseOperatorDecision(
  action: string,
): LocalOpsOperatorDecision | null {
  if (!action.startsWith(operatorActionPrefix)) {
    return null;
  }
  const decision = action.slice(operatorActionPrefix.length);
  if (
    decision === "acknowledge_failure" ||
    decision === "escalate_for_manual_review"
  ) {
    return decision;
  }

  return null;
}

function buildFailureDecisionAuditEventId(
  jobCorrelationId: string,
  rowId: string,
  decision: LocalOpsFailureDecision,
  decisionCorrelationId: string,
): string {
  return `audit-event-local-ops-failure-${encodeStableKey([
    "csv_import",
    jobCorrelationId,
    rowId,
    decision,
    decisionCorrelationId,
  ])}`;
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
