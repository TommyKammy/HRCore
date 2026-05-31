import type {
  ApplyApprovedOnboardingTransactionRequestInput,
  OnboardingApprovalDecisionInput,
} from "./onboarding-transaction-request-types.js";

export function buildWorkerAttemptCorrelationIdSearchPrefix(
  workerCorrelationId: string,
): string {
  const rawPrefix = JSON.stringify([workerCorrelationId, ""]).slice(0, -2);
  const rawPrefixBytes = Buffer.from(rawPrefix, "utf8");
  const alignedPrefixBytes = rawPrefixBytes.subarray(
    0,
    rawPrefixBytes.length - (rawPrefixBytes.length % 3),
  );
  return `onboarding-apply-worker-attempt-${alignedPrefixBytes.toString("base64url")}`;
}

export function buildOnboardingApplyLifecycleEventId(
  apply: ApplyApprovedOnboardingTransactionRequestInput,
): string {
  return buildOnboardingApplyLifecycleEventIdForRequest(
    apply.transactionRequestId,
  );
}

export function buildOnboardingApplyLifecycleEventIdForRequest(
  transactionRequestId: string,
): string {
  return `lifecycle-event-${transactionRequestId}-apply`;
}

export function buildOnboardingApplyAuditEventId(
  lifecycleEventId: string,
): string {
  return `audit-event-${lifecycleEventId}-applied`;
}

export function buildOnboardingDecisionAuditEventId(
  decision: OnboardingApprovalDecisionInput,
): string {
  return `audit-event-${decision.transactionRequestId}-${decision.decision}-${decision.correlationId}`;
}

export function buildWorkerAttemptCorrelationId(
  workerCorrelationId: string,
  transactionRequestId: string,
): string {
  return `onboarding-apply-worker-attempt-${encodeStableKey([
    workerCorrelationId,
    transactionRequestId,
  ])}`;
}

export function buildOnboardingApplyJobAttemptId(
  transactionRequestId: string,
  correlationId: string,
): string {
  return `onboarding-apply-job-attempt-${encodeStableKey([
    transactionRequestId,
    correlationId,
  ])}`;
}

export function buildOnboardingApplyJobRunId(correlationId: string): string {
  return `onboarding-apply-job-run-${encodeStableKey([correlationId])}`;
}

function encodeStableKey(parts: string[]): string {
  return Buffer.from(JSON.stringify(parts), "utf8").toString("base64url");
}
