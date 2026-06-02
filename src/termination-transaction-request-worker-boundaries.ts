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
  OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import type { ExistingOnboardingTransactionRequestRow } from "./onboarding-transaction-request-types.js";

export type ApplyDueTerminationTransactionRequestsInput =
  ApplyDueOnboardingTransactionRequestsInput;
export type ApplyDueTerminationTransactionRequestsItemResult =
  ApplyDueOnboardingTransactionRequestsItemResult;
export type ApplyDueTerminationTransactionRequestsResult =
  ApplyDueOnboardingTransactionRequestsResult;

export interface TerminationApplyWorkerContext {
  worker: ApplyDueTerminationTransactionRequestsInput;
  batchLimit: number;
  effectiveDate: string;
}

export function parseApplyDueTerminationTransactionRequestsInput(
  input: unknown,
): ApplyDueTerminationTransactionRequestsInput {
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

export function buildTerminationApplyWorkerContext(
  input: unknown,
): TerminationApplyWorkerContext {
  const worker = parseApplyDueTerminationTransactionRequestsInput(input);

  return {
    worker,
    batchLimit: worker.batchLimit ?? 100,
    effectiveDate: getMvpWorkerEffectiveDate(worker.now),
  };
}

export function readReplayedTerminationApplyWorkerRun(
  db: OnboardingTransactionRequestDatabase,
  context: TerminationApplyWorkerContext,
): ApplyDueTerminationTransactionRequestsResult | undefined {
  const replayedRun = readOnboardingApplyJobRun(
    db,
    context.worker.correlationId,
  );
  const replayedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    context.worker.correlationId,
  );
  if (!replayedRun) {
    return undefined;
  }

  if (replayedAttempts.length > 0) {
    return buildApplyDueOnboardingTransactionRequestsResult(
      context.worker.correlationId,
      replayedAttempts,
      replayedRun.skipped,
    );
  }

  return buildApplyDueOnboardingTransactionRequestsResultFromRun(
    context.worker.correlationId,
    replayedRun,
  );
}

export function readDueTerminationApplyCandidates(
  db: OnboardingTransactionRequestDatabase,
  context: TerminationApplyWorkerContext,
): ExistingOnboardingTransactionRequestRow[] {
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
      WHERE transaction_request.request_type = 'terminate'
        AND transaction_request.status_code = 'approved'
        AND NOT EXISTS (
          SELECT 1
          FROM onboarding_apply_job_attempt
          WHERE onboarding_apply_job_attempt.transaction_request_id = transaction_request.id
            AND onboarding_apply_job_attempt.status_code = 'non_retryable_failure'
        )
      ORDER BY
        CASE
          WHEN transaction_request.payload_version = 'mvp_c_termination_v1'
            AND json_valid(transaction_request.payload_json) = 1
            AND json_type(transaction_request.payload_json, '$.effectiveDate') = 'text'
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
            AND date(json_extract(transaction_request.payload_json, '$.effectiveDate')) = json_extract(transaction_request.payload_json, '$.effectiveDate')
            AND json_extract(transaction_request.payload_json, '$.effectiveDate') <= ? THEN 0
          WHEN transaction_request.payload_version != 'mvp_c_termination_v1' THEN 1
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
    throw new Error("termination apply worker requires query-all support");
  }

  return statement.all(
    context.effectiveDate,
    context.batchLimit,
  ) as ExistingOnboardingTransactionRequestRow[];
}

export function shouldSkipFutureTerminationApplyCandidate(
  candidateEffectiveDate: string,
  workerEffectiveDate: string,
): boolean {
  return candidateEffectiveDate > workerEffectiveDate;
}

export function buildTerminationApplyWorkerAttemptCorrelationId(
  workerCorrelationId: string,
  transactionRequestId: string,
): string {
  return buildWorkerAttemptCorrelationId(
    workerCorrelationId,
    transactionRequestId,
  );
}

export function recordTerminationApplyWorkerAttempt(
  db: OnboardingTransactionRequestDatabase,
  input: {
    transactionRequestId: string;
    personId: string;
    status: ApplyDueTerminationTransactionRequestsItemResult["status"];
    attemptedAt: string;
    workerId: string;
    correlationId: string;
    retryable: boolean;
    errorMessage: string | null;
    lifecycleEventId?: string | undefined;
  },
): ApplyDueTerminationTransactionRequestsItemResult {
  const attemptResult = buildOnboardingApplyJobAttemptResult(
    recordOnboardingApplyJobAttempt(db, {
      transactionRequestId: input.transactionRequestId,
      personId: input.personId,
      status: input.status,
      attemptedAt: input.attemptedAt,
      workerId: input.workerId,
      correlationId: input.correlationId,
      retryable: input.retryable,
      errorMessage: input.errorMessage,
    }),
  );

  return attemptResult.status === "applied" && input.lifecycleEventId
    ? { ...attemptResult, lifecycleEventId: input.lifecycleEventId }
    : attemptResult;
}

export function classifyTerminationApplyWorkerFailure(error: unknown): {
  retryable: boolean;
  errorMessage: string;
} {
  return {
    retryable: isRetryableTerminationApplyWorkerFailure(error),
    errorMessage: getErrorMessage(error),
  };
}

export function buildAndRecordTerminationApplyWorkerRunResult(
  db: OnboardingTransactionRequestDatabase,
  context: TerminationApplyWorkerContext,
  input: {
    results: ApplyDueTerminationTransactionRequestsItemResult[];
    skipped: number;
  },
): ApplyDueTerminationTransactionRequestsResult {
  const persistedAttempts = readOnboardingApplyJobAttemptsForWorkerCorrelation(
    db,
    context.worker.correlationId,
  );
  const result = buildApplyDueOnboardingTransactionRequestsResult(
    context.worker.correlationId,
    persistedAttempts.length > 0 ? persistedAttempts : input.results,
    input.skipped,
  );
  recordOnboardingApplyJobRun(db, {
    correlationId: context.worker.correlationId,
    workerId: context.worker.workerId,
    startedAt: context.worker.now,
    effectiveDate: context.effectiveDate,
    attempted: result.attempted,
    applied: result.applied,
    failed: result.failed,
    skipped: result.skipped,
  });
  return result;
}

function isRetryableTerminationApplyWorkerFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  return !(
    error instanceof OnboardingTransactionRequestValidationError ||
    error.message.includes("persisted termination apply payload") ||
    error.message.includes(
      "approved termination apply requires an approved termination transaction request",
    ) ||
    error.message.includes("retry conflicts with the completed request")
  );
}
