import type {
  OktaMasteringAdapter,
  OktaMasteringProjectionResult,
} from "./okta-mastering-adapter.js";
import {
  ingestSyntheticWorkEmailWriteback,
  refreshSyntheticWorkEmailFromProvider,
  SyntheticWorkEmailWritebackValidationError,
  type SyntheticWorkEmailConflictEvidence,
  type SyntheticWorkEmailWritebackInput,
  type SyntheticWorkEmailWritebackResult,
} from "./writeback-ingest.js";
import {
  applyApprovedOnboardingTransactionRequest,
  parsePersistedOnboardingApplyPayload,
  readOnboardingTransactionRequestById,
  type AppliedOnboardingTransactionRequestResult,
  type ApplyApprovedOnboardingTransactionRequestInput,
  type ExistingOnboardingTransactionRequestRow,
  type OnboardingTransactionRequestDatabase,
  type OnboardingTransactionRequestPayload,
} from "./onboarding-transaction-request-internal.js";
import {
  assertExistingMvpAWorkEmailConflictRow,
  assertExistingMvpAWorkEmailRefreshRow,
  assertExistingMvpAWorkEmailWritebackEventRow,
  doesExistingMvpAWorkEmailWritebackMatch,
  toSyntheticWorkEmailConflictEvidence,
} from "./onboarding-okta-writeback-row-guards.js";
import {
  buildMvpAOktaUserProjection,
  createExpectedMvpAOnboardingWorkEmailWritebackInput,
} from "./onboarding-okta-writeback-deterministic.js";

export type OktaOnboardingUserProjectionStatus =
  | "projected"
  | "already_projected"
  | "retryable_failure"
  | "failed";

export interface OktaOnboardingUserProjectionResult {
  status: OktaOnboardingUserProjectionStatus;
  result: OktaMasteringProjectionResult;
}

export type OnboardingWorkEmailWritebackStatus =
  | "applied"
  | "conflict"
  | "refresh_failed"
  | "failed"
  | "skipped";

export interface OnboardingWorkEmailWritebackResult {
  status: OnboardingWorkEmailWritebackStatus;
  eventId?: string;
  providerSubjectId?: string;
  correlationId?: string;
  refreshCorrelationId?: string;
  conflict?: SyntheticWorkEmailConflictEvidence;
  errorMessage?: string;
}

export interface AppliedOnboardingTransactionRequestWithOktaProjectionResult extends AppliedOnboardingTransactionRequestResult {
  oktaProjection: OktaOnboardingUserProjectionResult;
  workEmailWriteback: OnboardingWorkEmailWritebackResult;
}

export interface ApplyApprovedOnboardingTransactionRequestWithOktaProjectionInput extends ApplyApprovedOnboardingTransactionRequestInput {
  oktaAdapter: OktaMasteringAdapter;
}

export async function applyApprovedOnboardingTransactionRequestWithOktaProjection(
  db: OnboardingTransactionRequestDatabase,
  input: ApplyApprovedOnboardingTransactionRequestWithOktaProjectionInput,
): Promise<AppliedOnboardingTransactionRequestWithOktaProjectionResult> {
  const { oktaAdapter, ...applyInput } = input;
  const applied = applyApprovedOnboardingTransactionRequest(db, applyInput);
  const existing = readOnboardingTransactionRequestById(
    db,
    applied.transactionRequestId,
  );
  if (!existing) {
    throw new Error(
      "Okta onboarding projection requires an applied transaction request",
    );
  }

  const payload = parsePersistedOnboardingApplyPayload(existing);
  const projectionResult = await oktaAdapter.project({
    operation: "create",
    desiredUser: buildMvpAOktaUserProjection(
      existing,
      payload,
      input.appliedAt,
    ),
  });
  const oktaProjection = {
    status: toOktaOnboardingUserProjectionStatus(projectionResult),
    result: projectionResult,
  };

  return {
    ...applied,
    oktaProjection,
    workEmailWriteback: await consumeMvpAOnboardingWorkEmailWriteback(db, {
      oktaAdapter,
      oktaProjection,
      existing,
      payload,
      emittedAt: input.appliedAt,
    }),
  };
}

async function consumeMvpAOnboardingWorkEmailWriteback(
  db: OnboardingTransactionRequestDatabase,
  input: {
    oktaAdapter: OktaMasteringAdapter;
    oktaProjection: OktaOnboardingUserProjectionResult;
    existing: ExistingOnboardingTransactionRequestRow;
    payload: OnboardingTransactionRequestPayload;
    emittedAt: string;
  },
): Promise<OnboardingWorkEmailWritebackResult> {
  if (
    !canConsumeMvpAOnboardingWorkEmailWriteback(input.oktaProjection.result)
  ) {
    return {
      status: "skipped",
      errorMessage: "work_email writeback requires successful Okta projection",
    };
  }

  try {
    const expectedWritebackInput =
      createExpectedMvpAOnboardingWorkEmailWritebackInput(input);
    const existingWritebackResult =
      expectedWritebackInput === undefined
        ? undefined
        : readExistingMvpAOnboardingWorkEmailWriteback(
            db,
            expectedWritebackInput,
          );
    let writebackEventPayload: SyntheticWorkEmailWritebackInput;
    if (existingWritebackResult === undefined) {
      writebackEventPayload = (
        await input.oktaAdapter.emitWorkEmailWriteback({
          personId: input.existing.person_id,
          contactPointId: input.payload.workEmailExpectation.contactPointId,
          employeeNumber: input.payload.employment.employmentCode,
          workEmail: input.payload.workEmailExpectation.value,
          emittedAt: input.emittedAt,
          projectionEvidence: input.oktaProjection.result.metadata,
        })
      ).payload;
    } else if (expectedWritebackInput !== undefined) {
      writebackEventPayload = expectedWritebackInput;
    } else {
      throw new SyntheticWorkEmailWritebackValidationError(
        "existing work_email writeback evidence requires deterministic retry input",
      );
    }

    const writebackResult =
      existingWritebackResult ??
      ingestOrReadExistingMvpAOnboardingWorkEmailWritebackAfterRace(
        db,
        writebackEventPayload,
      );

    if (!writebackResult.applied) {
      return {
        status: "conflict",
        eventId: writebackResult.eventId,
        providerSubjectId: writebackResult.providerSubjectId,
        correlationId: writebackResult.correlationId,
        conflict: writebackResult.conflict,
      };
    }

    try {
      const existingRefreshAttempt =
        readExistingMvpAOnboardingWorkEmailRefreshAttempt(db, {
          eventId: writebackResult.eventId,
          providerSubjectId: writebackResult.providerSubjectId,
          refreshedAt: input.emittedAt,
          eventCorrelationId: writebackResult.correlationId,
        });
      if (existingRefreshAttempt !== undefined) {
        return {
          status: existingRefreshAttempt.status,
          eventId: writebackResult.eventId,
          providerSubjectId: writebackResult.providerSubjectId,
          correlationId: writebackResult.correlationId,
          ...getMvpAOnboardingWorkEmailRefreshAttemptResultEvidence(
            existingRefreshAttempt,
          ),
        };
      }

      const refreshedProviderValue =
        await input.oktaAdapter.refreshWorkEmailWriteback({
          providerSubjectId: writebackResult.providerSubjectId,
          refreshedAt: input.emittedAt,
          projectionEvidence: input.oktaProjection.result.metadata,
        });
      const persistedRefreshAttempt =
        readExistingMvpAOnboardingWorkEmailRefreshAttempt(db, {
          eventId: writebackResult.eventId,
          providerSubjectId: writebackResult.providerSubjectId,
          providerValue: refreshedProviderValue.providerValue,
          refreshedAt: refreshedProviderValue.refreshedAt,
          eventCorrelationId: writebackResult.correlationId,
        });
      if (persistedRefreshAttempt !== undefined) {
        return {
          status: persistedRefreshAttempt.status,
          eventId: writebackResult.eventId,
          providerSubjectId: writebackResult.providerSubjectId,
          correlationId: writebackResult.correlationId,
          ...getMvpAOnboardingWorkEmailRefreshAttemptResultEvidence(
            persistedRefreshAttempt,
          ),
        };
      }

      const refreshResult = refreshSyntheticWorkEmailFromProvider(db, {
        eventId: writebackResult.eventId,
        providerName: refreshedProviderValue.providerName,
        providerSubjectId: refreshedProviderValue.providerSubjectId,
        providerValue: refreshedProviderValue.providerValue,
        refreshedAt: refreshedProviderValue.refreshedAt,
      });

      if (!refreshResult.applied) {
        return {
          status: "conflict",
          eventId: refreshResult.eventId,
          providerSubjectId: refreshResult.providerSubjectId,
          correlationId: refreshResult.correlationId,
          conflict: refreshResult.conflict,
        };
      }

      return {
        status: "applied",
        eventId: writebackResult.eventId,
        providerSubjectId: writebackResult.providerSubjectId,
        correlationId: writebackResult.correlationId,
        refreshCorrelationId: createMvpAOnboardingWorkEmailRefreshCorrelationId(
          writebackResult.correlationId,
          refreshedProviderValue.refreshedAt,
        ),
      };
    } catch (error) {
      return {
        status: "refresh_failed",
        eventId: writebackResult.eventId,
        providerSubjectId: writebackResult.providerSubjectId,
        correlationId: writebackResult.correlationId,
        errorMessage: getSyntheticWorkEmailWritebackErrorMessage(error),
      };
    }
  } catch (error) {
    return {
      status: "failed",
      errorMessage: getSyntheticWorkEmailWritebackErrorMessage(error),
    };
  }
}

function canConsumeMvpAOnboardingWorkEmailWriteback(
  result: OktaMasteringProjectionResult,
): boolean {
  return (
    result.outcome === "success" ||
    (result.outcome === "skipped" &&
      result.operation === "create" &&
      result.reason === "already_exists")
  );
}

function readExistingMvpAOnboardingWorkEmailWriteback(
  db: OnboardingTransactionRequestDatabase,
  input: SyntheticWorkEmailWritebackInput,
): SyntheticWorkEmailWritebackResult | undefined {
  const existingEvent = db
    .prepare(
      `
        SELECT
          id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          target_contact_type,
          correlation_id,
          received_at
        FROM writeback_event
        WHERE id = ?
      `,
    )
    .get(input.eventId);

  if (existingEvent === undefined) {
    return undefined;
  }

  const existingWorkEmailEvent =
    assertExistingMvpAWorkEmailWritebackEventRow(existingEvent);

  if (!doesExistingMvpAWorkEmailWritebackMatch(existingWorkEmailEvent, input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback event conflicts with retry payload",
    );
  }

  const conflict = readExistingMvpAOnboardingInboundWorkEmailConflict(
    db,
    input.eventId,
  );

  return {
    eventId: existingWorkEmailEvent.id,
    personId: existingWorkEmailEvent.person_id,
    contactPointId: existingWorkEmailEvent.contact_point_id,
    providerName: existingWorkEmailEvent.provider_name,
    providerSubjectId: existingWorkEmailEvent.provider_subject_id,
    correlationId: existingWorkEmailEvent.correlation_id,
    applied: conflict === undefined,
    conflict,
  };
}

function readExistingMvpAOnboardingInboundWorkEmailConflict(
  db: OnboardingTransactionRequestDatabase,
  eventId: string,
): SyntheticWorkEmailConflictEvidence | undefined {
  const conflict = db
    .prepare(
      `
        SELECT
          id,
          provider_subject_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id
        FROM writeback_work_email_conflict
        WHERE writeback_event_id = ?
          AND conflict_type = 'inbound_value_conflict'
      `,
    )
    .get(eventId);

  if (conflict === undefined) {
    return undefined;
  }

  return toSyntheticWorkEmailConflictEvidence(
    assertExistingMvpAWorkEmailConflictRow(conflict),
  );
}

function readExistingMvpAOnboardingWorkEmailConflict(
  db: OnboardingTransactionRequestDatabase,
  eventId: string,
  refreshAttempt: {
    providerSubjectId: string;
    providerValue?: string;
    refreshedAt: string;
    eventCorrelationId: string;
  },
): SyntheticWorkEmailConflictEvidence | undefined {
  const conflict = db
    .prepare(
      `
        SELECT
          id,
          provider_subject_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id
        FROM writeback_work_email_conflict
        WHERE writeback_event_id = ?
          AND conflict_type = 'provider_refresh_conflict'
          AND provider_subject_id = ?
          AND detected_at = ?
          AND correlation_id = ?
          AND (? IS NULL OR attempted_provider_value = ?)
      `,
    )
    .get(
      eventId,
      refreshAttempt.providerSubjectId,
      refreshAttempt.refreshedAt,
      `${createMvpAOnboardingWorkEmailRefreshCorrelationId(
        refreshAttempt.eventCorrelationId,
        refreshAttempt.refreshedAt,
      )}:conflict:provider_refresh_conflict`,
      refreshAttempt.providerValue ?? null,
      refreshAttempt.providerValue ?? null,
    );

  if (conflict === undefined) {
    return undefined;
  }

  const existingConflict = assertExistingMvpAWorkEmailConflictRow(conflict);

  if (
    refreshAttempt !== undefined &&
    (existingConflict.provider_subject_id !==
      refreshAttempt.providerSubjectId ||
      (refreshAttempt.providerValue !== undefined &&
        existingConflict.attempted_provider_value !==
          refreshAttempt.providerValue) ||
      existingConflict.detected_at !== refreshAttempt.refreshedAt ||
      existingConflict.correlation_id !==
        `${createMvpAOnboardingWorkEmailRefreshCorrelationId(
          refreshAttempt.eventCorrelationId,
          refreshAttempt.refreshedAt,
        )}:conflict:provider_refresh_conflict`)
  ) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email provider refresh conflict conflicts with retry payload",
    );
  }

  return toSyntheticWorkEmailConflictEvidence(existingConflict);
}

function ingestOrReadExistingMvpAOnboardingWorkEmailWritebackAfterRace(
  db: OnboardingTransactionRequestDatabase,
  input: SyntheticWorkEmailWritebackInput,
): SyntheticWorkEmailWritebackResult {
  try {
    return ingestSyntheticWorkEmailWriteback(db, input);
  } catch (error) {
    const existingWritebackResult =
      readExistingMvpAOnboardingWorkEmailWriteback(db, input);
    if (existingWritebackResult !== undefined) {
      return existingWritebackResult;
    }

    throw error;
  }
}

function readExistingMvpAOnboardingWorkEmailRefreshAttempt(
  db: OnboardingTransactionRequestDatabase,
  input: {
    eventId: string;
    providerSubjectId: string;
    providerValue?: string;
    refreshedAt: string;
    eventCorrelationId: string;
  },
):
  | {
      status: "applied";
      refreshCorrelationId: string;
      conflict?: undefined;
    }
  | {
      status: "conflict";
      conflict: SyntheticWorkEmailConflictEvidence;
      refreshCorrelationId?: undefined;
    }
  | undefined {
  const conflict = readExistingMvpAOnboardingWorkEmailConflict(
    db,
    input.eventId,
    input,
  );
  if (conflict !== undefined) {
    return {
      status: "conflict",
      conflict,
    };
  }

  const refresh = db
    .prepare(
      `
        SELECT correlation_id, provider_value
        FROM writeback_provider_refresh
        WHERE writeback_event_id = ?
          AND provider_name = 'synthetic_okta'
          AND provider_subject_id = ?
          AND refreshed_at = ?
      `,
    )
    .get(input.eventId, input.providerSubjectId, input.refreshedAt);

  if (refresh === undefined) {
    return undefined;
  }

  const existingRefresh = assertExistingMvpAWorkEmailRefreshRow(refresh);

  if (
    (input.providerValue !== undefined &&
      existingRefresh.provider_value !== input.providerValue) ||
    existingRefresh.correlation_id !==
      createMvpAOnboardingWorkEmailRefreshCorrelationId(
        input.eventCorrelationId,
        input.refreshedAt,
      )
  ) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email provider refresh conflicts with retry payload",
    );
  }

  return {
    status: "applied",
    refreshCorrelationId: existingRefresh.correlation_id,
  };
}

function getMvpAOnboardingWorkEmailRefreshAttemptResultEvidence(
  attempt:
    | {
        status: "applied";
        refreshCorrelationId: string;
        conflict?: undefined;
      }
    | {
        status: "conflict";
        conflict: SyntheticWorkEmailConflictEvidence;
        refreshCorrelationId?: undefined;
      },
):
  | { refreshCorrelationId: string }
  | { conflict: SyntheticWorkEmailConflictEvidence } {
  if (attempt.status === "applied") {
    return { refreshCorrelationId: attempt.refreshCorrelationId };
  }

  return { conflict: attempt.conflict };
}

function createMvpAOnboardingWorkEmailRefreshCorrelationId(
  eventCorrelationId: string,
  refreshedAt: string,
): string {
  return `${eventCorrelationId}:provider_refresh:${encodeURIComponent(
    refreshedAt,
  )}`;
}

function getSyntheticWorkEmailWritebackErrorMessage(error: unknown): string {
  if (
    error instanceof SyntheticWorkEmailWritebackValidationError ||
    error instanceof Error
  ) {
    return error.message;
  }

  return "work_email writeback failed";
}

function toOktaOnboardingUserProjectionStatus(
  result: OktaMasteringProjectionResult,
): OktaOnboardingUserProjectionStatus {
  if (result.outcome === "success") {
    return "projected";
  }
  if (result.outcome === "skipped" && result.reason === "already_exists") {
    return "already_projected";
  }
  if (result.outcome === "retryable_failure") {
    return "retryable_failure";
  }

  return "failed";
}
