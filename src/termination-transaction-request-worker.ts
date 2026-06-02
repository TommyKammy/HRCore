import type {
  ApplyDueOnboardingTransactionRequestsStatus,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import {
  applyApprovedTerminationTransactionRequest,
  parsePersistedTerminationApplyPayload,
} from "./termination-transaction-request-apply.js";
import type { TerminationTransactionRequestPayload } from "./termination-transaction-request-contract.js";
import {
  buildAndRecordTerminationApplyWorkerRunResult,
  buildTerminationApplyWorkerAttemptCorrelationId,
  buildTerminationApplyWorkerContext,
  classifyTerminationApplyWorkerFailure,
  readDueTerminationApplyCandidates,
  readReplayedTerminationApplyWorkerRun,
  recordTerminationApplyWorkerAttempt,
  shouldSkipFutureTerminationApplyCandidate,
  type ApplyDueTerminationTransactionRequestsInput,
  type ApplyDueTerminationTransactionRequestsItemResult,
  type ApplyDueTerminationTransactionRequestsResult,
} from "./termination-transaction-request-worker-boundaries.js";

export type {
  ApplyDueTerminationTransactionRequestsInput,
  ApplyDueTerminationTransactionRequestsItemResult,
  ApplyDueTerminationTransactionRequestsResult,
} from "./termination-transaction-request-worker-boundaries.js";
export type ApplyDueTerminationTransactionRequestsStatus =
  ApplyDueOnboardingTransactionRequestsStatus;

export function applyDueTerminationTransactionRequests(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): ApplyDueTerminationTransactionRequestsResult {
  const context = buildTerminationApplyWorkerContext(input);
  const replayedRun = readReplayedTerminationApplyWorkerRun(db, context);
  if (replayedRun) {
    return replayedRun;
  }

  const results: ApplyDueTerminationTransactionRequestsItemResult[] = [];
  let skipped = 0;

  for (const candidate of readDueTerminationApplyCandidates(db, context)) {
    const attemptCorrelationId =
      buildTerminationApplyWorkerAttemptCorrelationId(
        context.worker.correlationId,
        candidate.transaction_request_id,
      );

    let payload: TerminationTransactionRequestPayload;
    try {
      payload = parsePersistedTerminationApplyPayload(candidate);
    } catch (error) {
      const failure = classifyTerminationApplyWorkerFailure(error);
      results.push(
        recordTerminationApplyWorkerAttempt(db, {
          transactionRequestId: candidate.transaction_request_id,
          personId: candidate.person_id,
          status: "non_retryable_failure",
          attemptedAt: context.worker.now,
          workerId: context.worker.workerId,
          correlationId: attemptCorrelationId,
          retryable: false,
          errorMessage: failure.errorMessage,
        }),
      );
      continue;
    }

    if (
      shouldSkipFutureTerminationApplyCandidate(
        payload.effectiveDate,
        context.effectiveDate,
      )
    ) {
      skipped += 1;
      continue;
    }

    try {
      const applied = applyApprovedTerminationTransactionRequest(db, {
        transactionRequestId: candidate.transaction_request_id,
        appliedAt: context.worker.now,
        appliedBy: context.worker.workerId,
        correlationId: attemptCorrelationId,
      });
      results.push(
        recordTerminationApplyWorkerAttempt(db, {
          transactionRequestId: candidate.transaction_request_id,
          personId: candidate.person_id,
          status: "applied",
          attemptedAt: context.worker.now,
          workerId: context.worker.workerId,
          correlationId: attemptCorrelationId,
          retryable: false,
          errorMessage: null,
          lifecycleEventId: applied.lifecycleEventId,
        }),
      );
    } catch (error) {
      const failure = classifyTerminationApplyWorkerFailure(error);
      results.push(
        recordTerminationApplyWorkerAttempt(db, {
          transactionRequestId: candidate.transaction_request_id,
          personId: candidate.person_id,
          status: failure.retryable
            ? "retryable_failure"
            : "non_retryable_failure",
          attemptedAt: context.worker.now,
          workerId: context.worker.workerId,
          correlationId: attemptCorrelationId,
          retryable: failure.retryable,
          errorMessage: failure.errorMessage,
        }),
      );
    }
  }

  return buildAndRecordTerminationApplyWorkerRunResult(db, context, {
    results,
    skipped,
  });
}
