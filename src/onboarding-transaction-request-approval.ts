import { buildOnboardingDecisionAuditEventId } from "./onboarding-transaction-request-ids.js";
import { parseOnboardingApprovalDecisionInput } from "./onboarding-transaction-request-parser.js";
import {
  readAuditEventById,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import {
  assertLegalOnboardingDecision,
  assertMatchingOnboardingDecisionAuditEvent,
  buildOnboardingDecisionResult,
  buildOnboardingDecisionRetryResultAfterConflict,
  getOnboardingDecisionTarget,
  isSingleSqlChange,
  rollbackNamedSavepoint,
} from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request-types.js";

export function decideOnboardingTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingApprovalDecisionResult {
  const decision = parseOnboardingApprovalDecisionInput(input);
  const target = getOnboardingDecisionTarget(decision.decision);
  const auditEventId = buildOnboardingDecisionAuditEventId(decision);
  const existing = readOnboardingTransactionRequestById(
    db,
    decision.transactionRequestId,
  );

  if (!existing) {
    throw new Error("onboarding transaction request decision target not found");
  }

  if (existing.request_type !== "hire") {
    throw new Error("onboarding transaction request decision target not found");
  }

  const existingAuditEvent = readAuditEventById(db, auditEventId);
  if (existing.status_code === target.statusCode && existingAuditEvent) {
    assertMatchingOnboardingDecisionAuditEvent(
      existingAuditEvent,
      existing,
      decision,
      target,
    );
    return buildOnboardingDecisionResult(
      existing,
      decision,
      target,
      auditEventId,
    );
  }

  assertLegalOnboardingDecision(existing, decision, target);

  db.exec("SAVEPOINT onboarding_transaction_request_decision");
  try {
    const updateResult = db
      .prepare(
        `
          UPDATE transaction_request
          SET status_code = ?
          WHERE id = ?
            AND person_id = ?
            AND request_type = 'hire'
            AND status_code = 'submitted'
        `,
      )
      .run(
        target.statusCode,
        existing.transaction_request_id,
        existing.person_id,
      );
    if (!isSingleSqlChange(updateResult)) {
      const retryResult = buildOnboardingDecisionRetryResultAfterConflict(
        db,
        decision,
        target,
        auditEventId,
      );
      if (retryResult) {
        db.exec("RELEASE SAVEPOINT onboarding_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "onboarding transaction request decision conflicts with the current submitted state",
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

    db.exec("RELEASE SAVEPOINT onboarding_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "onboarding_transaction_request_decision");
    throw error;
  }

  return buildOnboardingDecisionResult(
    existing,
    decision,
    target,
    auditEventId,
  );
}

export type {
  OnboardingApprovalDecision,
  OnboardingApprovalDecisionInput,
  OnboardingApprovalDecisionResult,
} from "./onboarding-transaction-request-types.js";
