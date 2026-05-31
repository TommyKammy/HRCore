import { buildOnboardingDecisionAuditEventId } from "./onboarding-transaction-request-ids.js";
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
  OnboardingTransactionRequestDatabase,
  OnboardingApprovalDecisionResult,
} from "./onboarding-transaction-request.js";

export function decideTransferTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingApprovalDecisionResult {
  const decision = parseOnboardingApprovalDecisionInput(input);
  const target = getTransactionDecisionTarget(
    decision.decision,
    "mvp_b.transfer",
  );
  const auditEventId = buildOnboardingDecisionAuditEventId(decision);
  const scope = {
    requestType: "transfer",
    label: "transfer transaction request",
  };
  const existing = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );

  if (!existing || existing.request_type !== scope.requestType) {
    throw new Error("transfer transaction request decision target not found");
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

  db.exec("SAVEPOINT transfer_transaction_request_decision");
  try {
    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = ?
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'transfer'
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
        db.exec("RELEASE SAVEPOINT transfer_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "transfer transaction request decision conflicts with the current submitted state",
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

    db.exec("RELEASE SAVEPOINT transfer_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "transfer_transaction_request_decision");
    throw error;
  }

  return buildTransactionDecisionResult(
    existing,
    decision,
    target,
    auditEventId,
  );
}
