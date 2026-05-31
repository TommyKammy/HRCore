import { buildWorkerAttemptCorrelationId } from "./onboarding-transaction-request-ids.js";
import {
  parseApplyDueOnboardingTransactionRequestsInput,
  parsePersistedOnboardingApplyPayload,
} from "./onboarding-transaction-request-parser.js";
import {
  readDueOnboardingApplyCandidates,
  readOnboardingApplyJobAttemptsForWorkerCorrelation,
  readOnboardingApplyJobRun,
} from "./onboarding-transaction-request-readers.js";
import {
  buildApplyDueOnboardingTransactionRequestsResult,
  buildApplyDueOnboardingTransactionRequestsResultFromRun,
  buildOnboardingApplyJobAttemptResult,
  getErrorMessage,
  getMvpWorkerEffectiveDate,
  isRetryableOnboardingApplyWorkerFailure,
  recordOnboardingApplyJobAttempt,
  recordOnboardingApplyJobRun,
} from "./onboarding-transaction-request-shared.js";
import type {
  ApplyDueOnboardingTransactionRequestsInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
  OnboardingTransactionRequestDatabase,
  OnboardingTransactionRequestPayload,
} from "./onboarding-transaction-request-types.js";
import { applyApprovedOnboardingTransactionRequest } from "./onboarding-transaction-request-apply.js";

export function applyDueOnboardingTransactionRequests(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): ApplyDueOnboardingTransactionRequestsResult {
  const worker = parseApplyDueOnboardingTransactionRequestsInput(input);
  const batchLimit = worker.batchLimit ?? 100;
  const effectiveDate = getMvpWorkerEffectiveDate(worker.now);
  const replayedRun = readOnboardingApplyJobRun(db, worker.correlationId);
  const replayedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    worker.correlationId,
  );
  if (replayedRun) {
    if (replayedAttempts.length > 0) {
      return buildApplyDueOnboardingTransactionRequestsResult(
        worker.correlationId,
        replayedAttempts,
        replayedRun.skipped,
      );
    }

    return buildApplyDueOnboardingTransactionRequestsResultFromRun(
      worker.correlationId,
      replayedRun,
    );
  }

  const candidates = readDueOnboardingApplyCandidates(
    db,
    batchLimit,
    effectiveDate,
  );
  const results: ApplyDueOnboardingTransactionRequestsItemResult[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const attemptCorrelationId = buildWorkerAttemptCorrelationId(
      worker.correlationId,
      candidate.transaction_request_id,
    );

    let payload: OnboardingTransactionRequestPayload;
    try {
      payload = parsePersistedOnboardingApplyPayload(candidate);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      results.push(
        buildOnboardingApplyJobAttemptResult(
          recordOnboardingApplyJobAttempt(db, {
            transactionRequestId: candidate.transaction_request_id,
            personId: candidate.person_id,
            status: "non_retryable_failure",
            attemptedAt: worker.now,
            workerId: worker.workerId,
            correlationId: attemptCorrelationId,
            retryable: false,
            errorMessage,
          }),
        ),
      );
      continue;
    }

    if (payload.effectiveDate > effectiveDate) {
      skipped += 1;
      continue;
    }

    try {
      const applied = applyApprovedOnboardingTransactionRequest(db, {
        transactionRequestId: candidate.transaction_request_id,
        appliedAt: worker.now,
        appliedBy: worker.workerId,
        correlationId: attemptCorrelationId,
      });
      const attemptResult = buildOnboardingApplyJobAttemptResult(
        recordOnboardingApplyJobAttempt(db, {
          transactionRequestId: candidate.transaction_request_id,
          personId: candidate.person_id,
          status: "applied",
          attemptedAt: worker.now,
          workerId: worker.workerId,
          correlationId: attemptCorrelationId,
          retryable: false,
          errorMessage: null,
        }),
      );
      results.push(
        attemptResult.status === "applied"
          ? { ...attemptResult, lifecycleEventId: applied.lifecycleEventId }
          : attemptResult,
      );
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const retryable = isRetryableOnboardingApplyWorkerFailure(error);
      const status = retryable ? "retryable_failure" : "non_retryable_failure";
      results.push(
        buildOnboardingApplyJobAttemptResult(
          recordOnboardingApplyJobAttempt(db, {
            transactionRequestId: candidate.transaction_request_id,
            personId: candidate.person_id,
            status,
            attemptedAt: worker.now,
            workerId: worker.workerId,
            correlationId: attemptCorrelationId,
            retryable,
            errorMessage,
          }),
        ),
      );
    }
  }

  const persistedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    worker.correlationId,
  );
  const result = buildApplyDueOnboardingTransactionRequestsResult(
    worker.correlationId,
    persistedAttempts.length > 0 ? persistedAttempts : results,
    skipped,
  );
  recordOnboardingApplyJobRun(db, {
    correlationId: worker.correlationId,
    workerId: worker.workerId,
    startedAt: worker.now,
    effectiveDate,
    attempted: result.attempted,
    applied: result.applied,
    failed: result.failed,
    skipped: result.skipped,
  });
  return result;
}

export type {
  ApplyDueOnboardingTransactionRequestsInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
} from "./onboarding-transaction-request-types.js";
