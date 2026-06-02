import {
  readAuditEventById,
  readOnboardingTransactionRequestById,
} from "./onboarding-transaction-request-readers.js";
import { rollbackNamedSavepoint } from "./onboarding-transaction-request-shared.js";
import type {
  OnboardingApprovalDecisionResult,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import {
  assertLegalTerminationDecision,
  assertTerminationDecisionTarget,
  buildTerminationDecisionResult,
  buildTerminationDecisionRetryResultAfterConflict,
  buildTerminationRepeatedDecisionResult,
  parseTerminationDecisionCommand,
  recordTerminationDecisionAuditEvent,
  updateSubmittedTerminationDecision,
} from "./termination-transaction-request-decision-helpers.js";

export function decideTerminationTransactionRequest(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): OnboardingApprovalDecisionResult {
  const command = parseTerminationDecisionCommand(input);
  const existing = readOnboardingTransactionRequestById(
    db,
    command.decision.transactionRequestId,
  );

  assertTerminationDecisionTarget(existing);

  const repeatedResult = buildTerminationRepeatedDecisionResult(
    existing,
    readAuditEventById(db, command.auditEventId),
    command,
  );
  if (repeatedResult) {
    return repeatedResult;
  }

  assertLegalTerminationDecision(existing, command);

  db.exec("SAVEPOINT termination_transaction_request_decision");
  try {
    if (!updateSubmittedTerminationDecision(db, existing, command)) {
      const retryResult = buildTerminationDecisionRetryResultAfterConflict(
        db,
        command,
      );
      if (retryResult) {
        db.exec("RELEASE SAVEPOINT termination_transaction_request_decision");
        return retryResult;
      }

      throw new Error(
        "termination transaction request decision conflicts with the current submitted state",
      );
    }

    recordTerminationDecisionAuditEvent(db, existing, command);

    db.exec("RELEASE SAVEPOINT termination_transaction_request_decision");
  } catch (error) {
    rollbackNamedSavepoint(db, "termination_transaction_request_decision");
    throw error;
  }

  return buildTerminationDecisionResult(existing, command);
}
