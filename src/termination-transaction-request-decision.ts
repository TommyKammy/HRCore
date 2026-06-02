import { parseOnboardingApprovalDecisionInput } from "./onboarding-transaction-request-parser.js";
import {
  readAuditEventById,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import {
  assertLegalTransactionDecision,
  assertMatchingTransactionDecisionAuditEvent,
  buildTransactionDecisionResult,
  buildTransactionDecisionRetryResultAfterConflict,
  getTransactionDecisionTarget,
  isSingleSqlChange,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import { buildTerminationDecisionAuditEventId } from "./termination-transaction-request-ids.js";

export function decideTerminationTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingApprovalDecisionResult {
  const decision = parseOnboardingApprovalDecisionInput(input);
  const target = getTransactionDecisionTarget(
    decision.decision,
    "mvp_c.termination",
  );
  const auditEventId = buildTerminationDecisionAuditEventId(decision);
  const scope = {
    requestType: "terminate",
    label: "termination transaction request",
  };
  const existing = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );

  if (!existing || existing.request_type !== scope.requestType) {
    throw new Error(
      "termination transaction request decision target not found",
    );
  }

  const existingAuditEvent = readAuditEventById(db, auditEventId);
  if (existing.status_code === target.statusCode && existingAuditEvent) {
    assertMatchingTransactionDecisionAuditEvent(
      existingAuditEvent,
      existing,
      decision,
      target,
      scope,
    );
    return buildTransactionDecisionResult(
      existing,
      decision,
      target,
      auditEventId,
    );
  }

  assertLegalTransactionDecision(existing, decision, target, scope);

  db.exec("SAVEPOINT termination_transaction_request_decision");
  try {
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
        target.statusCode,
        existing.transaction_request_id,
        existing.person_id,
      );
    if (!isSingleSqlChange(updateResult)) {
      const retryResult = buildTransactionDecisionRetryResultAfterConflict(
        db,
        decision,
        target,
        auditEventId,
        scope,
      );
      if (retryResult) {
        db.exec("RELEASE SAVEPOINT termination_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "termination transaction request decision conflicts with the current submitted state",
      );
    }

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
      auditEventId,
      decision.decidedBy,
      target.auditAction,
      existing.transaction_request_id,
      decision.decidedAt,
      decision.correlationId,
    );

    db.exec("RELEASE SAVEPOINT termination_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "termination_transaction_request_decision");
    throw error;
  }

  return buildTransactionDecisionResult(
    existing,
    decision,
    target,
    auditEventId,
  );
}
