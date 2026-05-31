import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";
import { buildWorkerAttemptCorrelationId } from "./onboarding-transaction-request-ids.js";
import {
  readOnboardingApplyJobAttemptsForWorkerCorrelation,
  readOnboardingApplyJobRun,
} from "./onboarding-transaction-request-readers.js";
import {
  buildApplyDueOnboardingTransactionRequestsResult,
  buildApplyDueOnboardingTransactionRequestsResultFromRun,
  buildOnboardingApplyJobAttemptResult,
  getErrorMessage,
  getMvpWorkerEffectiveDate,
  recordOnboardingApplyJobAttempt,
  recordOnboardingApplyJobRun,
} from "./onboarding-transaction-request-shared.js";
import {
  assertSupportedFields,
  requireNonEmpty,
  requirePositiveInteger,
  requireRecord,
  requireTimestamp,
} from "./onboarding-transaction-request-validation.js";
import type {
  ApplyDueOnboardingTransactionRequestsInput,
  ApplyDueOnboardingTransactionRequestsItemResult,
  ApplyDueOnboardingTransactionRequestsResult,
  ApplyDueOnboardingTransactionRequestsStatus,
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import type { TransferTransactionRequestPayload } from "./transfer-transaction-request-contract.js";
import {
  applyApprovedTransferTransactionRequest,
  parsePersistedTransferApplyPayload,
} from "./transfer-transaction-request-apply.js";
import type { ExistingTransferTransactionRequestRow } from "./transfer-transaction-request-apply.js";

export type ApplyDueTransferTransactionRequestsInput =
  ApplyDueOnboardingTransactionRequestsInput;
export type ApplyDueTransferTransactionRequestsItemResult =
  ApplyDueOnboardingTransactionRequestsItemResult;
export type ApplyDueTransferTransactionRequestsResult =
  ApplyDueOnboardingTransactionRequestsResult;
export type ApplyDueTransferTransactionRequestsStatus =
  ApplyDueOnboardingTransactionRequestsStatus;

export function applyDueTransferTransactionRequests(
  db: OnboardingTransactionRequestDatabase,
  input: unknown,
): ApplyDueTransferTransactionRequestsResult {
  const worker = parseApplyDueTransferTransactionRequestsInput(input);
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

  const candidates = readDueTransferApplyCandidates(
    db,
    batchLimit,
    effectiveDate,
  );
  const results: ApplyDueTransferTransactionRequestsItemResult[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    const attemptCorrelationId = buildWorkerAttemptCorrelationId(
      worker.correlationId,
      candidate.transaction_request_id,
    );

    let payload: TransferTransactionRequestPayload;
    try {
      payload = parsePersistedTransferApplyPayload(candidate);
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
      const applied = applyApprovedTransferTransactionRequest(db, {
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
      const retryable = isRetryableTransferApplyWorkerFailure(error);
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

function parseApplyDueTransferTransactionRequestsInput(
  input: unknown,
): ApplyDueTransferTransactionRequestsInput {
  const worker = requireRecord("worker", input);
  assertSupportedFields("worker", worker, [
    "now",
    "workerId",
    "correlationId",
    "batchLimit",
  ]);

  return {
    now: requireTimestamp("now", worker.now),
    workerId: requireNonEmpty("workerId", worker.workerId),
    correlationId: requireNonEmpty("correlationId", worker.correlationId),
    batchLimit:
      worker.batchLimit === undefined
        ? 100
        : requirePositiveInteger("batchLimit", worker.batchLimit),
  };
}

function readDueTransferApplyCandidates(
  db: OnboardingTransactionRequestDatabase,
  batchLimit: number,
  effectiveDate: string,
): ExistingTransferTransactionRequestRow[] {
  const statement = db.prepare(
    `
      SELECT
        person.id AS person_id,
        transaction_request.id AS transaction_request_id,
        person.display_name,
        person.created_at,
        transaction_request.request_type,
        transaction_request.status_code,
        transaction_request.requested_at,
        transaction_request.correlation_id,
        transaction_request.payload_version,
        transaction_request.payload_json
      FROM transaction_request
      JOIN person ON person.id = transaction_request.person_id
      WHERE transaction_request.request_type = 'transfer'
        AND transaction_request.status_code = 'approved'
        AND NOT EXISTS (
          SELECT 1
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.transaction_request_id = transaction_request.id
            AND onboarding_apply_job_attempt.status_code = 'non_retryable_failure'
        )
      ORDER BY
        CASE
          WHEN transaction_request.payload_version = 'mvp_b_transfer_v1'
            AND json_valid(transaction_request.payload_json) = 1
            AND json_type(transaction_request.payload_json, '$.effectiveDate') = 'text'
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND date(json_extract(transaction_request.payload_json, '$.effectiveDate')) = json_extract(transaction_request.payload_json, '$.effectiveDate')
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') <= ? THEN 0
          WHEN transaction_request.payload_version != 'mvp_b_transfer_v1' THEN 1
          WHEN json_valid(transaction_request.payload_json) = 0 THEN 1
          WHEN json_type(transaction_request.payload_json, '$.effectiveDate') IS NULL THEN 1
          WHEN json_type(transaction_request.payload_json, '$.effectiveDate') != 'text' THEN 1
          ELSE 2
        END,
        transaction_request.requested_at,
        transaction_request.id
      LIMIT ?
    `,
  );
  if (!statement.all) {
    throw new Error("transfer apply worker requires query-all support");
  }

  return statement.all(
    effectiveDate,
    batchLimit,
  ) as ExistingTransferTransactionRequestRow[];
}

function isRetryableTransferApplyWorkerFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error instanceof OnboardingTransactionRequestValidationError ||
    error.message.includes("persisted transfer apply payload") ||
    error.message.includes(
      "approved transfer apply requires an approved transfer transaction request",
    ) ||
    error.message.includes("retry conflicts with the completed request")
  );
}
