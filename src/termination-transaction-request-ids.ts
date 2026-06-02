import {
  buildOnboardingApplyAuditEventId,
  buildOnboardingApplyLifecycleEventId,
  buildOnboardingApplyLifecycleEventIdForRequest,
  buildOnboardingDecisionAuditEventId,
} from "./onboarding-transaction-request-ids.js";
import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  OnboardingApprovalDecisionInput,
} from "./onboarding-transaction-request-types.js";

export function buildTerminationApplyLifecycleEventId(
  apply: ApplyApprovedOnboardingTransactionRequestInput,
): string {
  return buildOnboardingApplyLifecycleEventId(apply);
}

export function buildTerminationApplyLifecycleEventIdForRequest(
  transactionRequestId: string,
): string {
  return buildOnboardingApplyLifecycleEventIdForRequest(transactionRequestId);
}

export function buildTerminationApplyAuditEventId(
  lifecycleEventId: string,
): string {
  return buildOnboardingApplyAuditEventId(lifecycleEventId);
}

export function buildTerminationDecisionAuditEventId(
  decision: OnboardingApprovalDecisionInput,
): string {
  return buildOnboardingDecisionAuditEventId(decision);
}
