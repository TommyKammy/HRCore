import { parseOnboardingApprovalDecisionInput } from "./onboarding-transaction-request-parser.js";
import {
  assertLegalTransactionDecision,
  assertMatchingTransactionDecisionAuditEvent,
  buildTransactionDecisionResult,
  buildTransactionDecisionRetryResultAfterConflict,
  getTransactionDecisionTarget,
  isSingleSqlChange,
  type OnboardingDecisionTarget,
  type TransactionDecisionScope,
} from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import type {
  ExistingAuditEventRow,
  ExistingOnboardingTransactionRequestRow,
} from "./onboarding-transaction-request-types.js";
import { buildTerminationDecisionAuditEventId } from "./termination-transaction-request-ids.js";

export type TerminationDecisionCommand = {
  decision: OnboardingApprovalDecisionInput;
  target: OnboardingDecisionTarget;
  auditEventId: string;
  scope: TransactionDecisionScope;
};

export const terminationDecisionScope = {
  requestType: "terminate",
  label: "termination transaction request",
} satisfies TransactionDecisionScope;

export function parseTerminationDecisionCommand(
  input: unknown,
): TerminationDecisionCommand {
  const decision = parseOnboardingApprovalDecisionInput(input);

  return {
    decision,
    target: getTransactionDecisionTarget(
      decision.decision,
      "mvp_c.termination",
    ),
    auditEventId: buildTerminationDecisionAuditEventId(decision),
    scope: terminationDecisionScope,
  };
}

export function assertTerminationDecisionTarget(
  existing: ExistingOnboardingTransactionRequestRow | undefined,
): asserts existing is ExistingOnboardingTransactionRequestRow {
  if (
    !existing ||
    existing.request_type !== terminationDecisionScope.requestType
  ) {
    throw new Error(
      "termination transaction request decision target not found",
    );
  }
}

export function buildTerminationRepeatedDecisionResult(
  existing: ExistingOnboardingTransactionRequestRow,
  existingAuditEvent: ExistingAuditEventRow | undefined,
  command: TerminationDecisionCommand,
): OnboardingApprovalDecisionResult | undefined {
  if (
    existing.status_code !== command.target.statusCode ||
    existingAuditEvent === undefined
  ) {
    return undefined;
  }

  assertMatchingTransactionDecisionAuditEvent(
    existingAuditEvent,
    existing,
    command.decision,
    command.target,
    command.scope,
  );
  return buildTransactionDecisionResult(
    existing,
    command.decision,
    command.target,
    command.auditEventId,
  );
}

export function assertLegalTerminationDecision(
  existing: ExistingOnboardingTransactionRequestRow,
  command: TerminationDecisionCommand,
): void {
  assertLegalTransactionDecision(
    existing,
    command.decision,
    command.target,
    command.scope,
  );
}

export function updateSubmittedTerminationDecision(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  command: TerminationDecisionCommand,
): boolean {
  const updateResult = db
    .prepare(
      `
        UPDATE transaction_request
        SET status_code = ?
        WHERE id = ?
          AND person_id = ?
          AND request_type = 'terminate'
          AND status_code = 'submitted'
      `,
    )
    .run(
      command.target.statusCode,
      existing.transaction_request_id,
      existing.person_id,
    );

  return isSingleSqlChange(updateResult);
}

export function buildTerminationDecisionRetryResultAfterConflict(
  db: OnboardingTransactionRequestDatabase,
  command: TerminationDecisionCommand,
): OnboardingApprovalDecisionResult | undefined {
  return buildTransactionDecisionRetryResultAfterConflict(
    db,
    command.decision,
    command.target,
    command.auditEventId,
    command.scope,
  );
}

export function recordTerminationDecisionAuditEvent(
  db: OnboardingTransactionRequestDatabase,
  existing: ExistingOnboardingTransactionRequestRow,
  command: TerminationDecisionCommand,
): void {
  db.prepare(
    `
      INSERT INTO audit_event (
        id,
        actor_id,
        action,
        subject_table,
        subject_id,
        occurred_at,
        correlation_id,
        poc_marker
      )
      VALUES (?, ?, ?, 'transaction_request', ?, ?, ?, 'synthetic_poc')
    `,
  ).run(
    command.auditEventId,
    command.decision.decidedBy,
    command.target.auditAction,
    existing.transaction_request_id,
    command.decision.decidedAt,
    command.decision.correlationId,
  );
}

export function buildTerminationDecisionResult(
  existing: ExistingOnboardingTransactionRequestRow,
  command: TerminationDecisionCommand,
): OnboardingApprovalDecisionResult {
  return buildTransactionDecisionResult(
    existing,
    command.decision,
    command.target,
    command.auditEventId,
  );
}
