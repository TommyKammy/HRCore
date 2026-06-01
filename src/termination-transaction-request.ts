export { saveTerminationTransactionRequest } from "./termination-transaction-request-persistence.js";
export { decideTerminationTransactionRequest } from "./termination-transaction-request-decision.js";
export { applyApprovedTerminationTransactionRequest } from "./termination-transaction-request-apply.js";

export {
  createTerminationTransactionRequestFixture,
  parseTerminationPayload,
  parseTerminationTransactionRequestInput,
  TerminationTransactionRequestValidationError,
} from "./termination-transaction-request-contract.js";
export type { TerminationTransactionRequestPersistenceResult } from "./termination-transaction-request-persistence.js";
export type {
  AppliedTerminationTransactionRequestResult,
  ApplyApprovedTerminationTransactionRequestInput,
} from "./termination-transaction-request-apply.js";
export type {
  OnboardingApprovalDecision as TerminationApprovalDecision,
  OnboardingApprovalDecisionInput as TerminationApprovalDecisionInput,
  OnboardingApprovalDecisionResult as TerminationApprovalDecisionResult,
} from "./onboarding-transaction-request.js";
export type {
  TerminationTransactionRequestCurrentAssignmentPayload,
  TerminationTransactionRequestCurrentEmploymentPayload,
  TerminationTransactionRequestInput,
  TerminationTransactionRequestPayload,
  TerminationTransactionRequestPersonInput,
  TerminationTransactionRequestReasonPayload,
  TerminationTransactionRequestStatus,
} from "./termination-transaction-request-contract.js";
