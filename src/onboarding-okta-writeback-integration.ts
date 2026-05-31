import type {
  OktaMasteringAdapter,
  OktaMasteringProjectionResult,
  SyntheticOktaUserFixture,
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

type ExistingMvpAWorkEmailWritebackEventRow = {
  id: string;
  person_id: string;
  contact_point_id: string;
  provider_name: "synthetic_okta";
  provider_subject_id: string;
  provider_value: string;
  target_contact_type: "work_email";
  correlation_id: string;
  received_at: string;
};

type ExistingMvpAWorkEmailConflictRow = {
  id: string;
  provider_subject_id: string;
  conflict_type: "inbound_value_conflict" | "provider_refresh_conflict";
  current_contact_value: string;
  attempted_provider_value: string;
  detected_at: string;
  correlation_id: string;
};

type ExistingMvpAWorkEmailRefreshRow = {
  correlation_id: string;
  provider_value: string;
};

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

function buildMvpAOktaUserProjection(
  existing: ExistingOnboardingTransactionRequestRow,
  payload: OnboardingTransactionRequestPayload,
  effectiveAt: string,
): SyntheticOktaUserFixture {
  const { givenName, familyName } = splitSyntheticDisplayName(
    existing.display_name,
  );

  return {
    externalId: `synthetic-okta-user-${existing.person_id}`,
    employeeNumber: payload.employment.employmentCode,
    email: payload.workEmailExpectation.value,
    displayName: existing.display_name,
    givenName,
    familyName,
    status: "active",
    departmentCode: payload.assignment.departmentReference,
    managerExternalId: payload.assignment.managerReference,
    effectiveAt,
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

function createExpectedMvpAOnboardingWorkEmailWritebackInput(input: {
  oktaProjection: OktaOnboardingUserProjectionResult;
  existing: ExistingOnboardingTransactionRequestRow;
  payload: OnboardingTransactionRequestPayload;
  emittedAt: string;
}): SyntheticWorkEmailWritebackInput | undefined {
  const projectionEvidence = readMvpAOnboardingWritebackProjectionEvidence(
    input.oktaProjection.result,
    input.payload.employment.employmentCode,
    input.emittedAt,
  );
  if (projectionEvidence === undefined) {
    return undefined;
  }

  const employeeNumberIdentity = encodeMvpAOnboardingWorkEmailIdentityPart(
    input.payload.employment.employmentCode,
  );
  const emittedAtIdentity = encodeMvpAOnboardingWorkEmailIdentityPart(
    input.emittedAt,
  );

  return {
    eventId: [
      "okta-work-email-writeback",
      projectionEvidence.operation,
      employeeNumberIdentity,
      emittedAtIdentity,
    ].join("-"),
    personId: input.existing.person_id,
    contactPointId: input.payload.workEmailExpectation.contactPointId,
    providerName: "synthetic_okta",
    providerSubjectId:
      readMvpAOnboardingWritebackProviderSubjectId(
        input.oktaProjection.result,
      ) ?? `synthetic-okta-user-${input.existing.person_id}`,
    providerValue: input.payload.workEmailExpectation.value,
    targetContactType: "work_email",
    correlationId: [
      "okta",
      "mock",
      "work_email_writeback",
      projectionEvidence.operation,
      employeeNumberIdentity,
      emittedAtIdentity,
    ].join(":"),
    receivedAt: input.emittedAt,
    pocMarker: "synthetic_poc",
  };
}

function readMvpAOnboardingWritebackProviderSubjectId(
  result: OktaMasteringProjectionResult,
): string | undefined {
  if (result.outcome === "success" && result.externalId.length > 0) {
    return result.externalId;
  }

  if (
    result.outcome === "skipped" &&
    result.operation === "create" &&
    result.reason === "already_exists" &&
    result.externalId.length > 0
  ) {
    return result.externalId;
  }

  return undefined;
}

function readMvpAOnboardingWritebackProjectionEvidence(
  result: OktaMasteringProjectionResult,
  employeeNumber: string,
  emittedAt: string,
): { operation: "create" | "update" } | undefined {
  const { metadata } = result;
  if (
    metadata.provider !== "okta" ||
    metadata.adapterMode !== "mock" ||
    metadata.synthetic !== true
  ) {
    return undefined;
  }

  const projectionKeyParts = metadata.projectionKey.split(":");
  if (projectionKeyParts.length !== 5) {
    return undefined;
  }

  try {
    const [
      provider,
      adapterMode,
      operation,
      evidenceEmployeeNumber,
      effectiveAt,
    ] = projectionKeyParts.map(decodeURIComponent);

    if (
      provider !== "okta" ||
      adapterMode !== "mock" ||
      (operation !== "create" && operation !== "update") ||
      evidenceEmployeeNumber !== employeeNumber ||
      effectiveAt !== emittedAt
    ) {
      return undefined;
    }

    return { operation };
  } catch {
    return undefined;
  }
}

function encodeMvpAOnboardingWorkEmailIdentityPart(value: string): string {
  return encodeURIComponent(value);
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

  if (!isExistingMvpAWorkEmailWritebackEventRow(existingEvent)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback event is malformed",
    );
  }

  if (!doesExistingMvpAWorkEmailWritebackMatch(existingEvent, input)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback event conflicts with retry payload",
    );
  }

  const conflict = readExistingMvpAOnboardingInboundWorkEmailConflict(
    db,
    input.eventId,
  );

  return {
    eventId: existingEvent.id,
    personId: existingEvent.person_id,
    contactPointId: existingEvent.contact_point_id,
    providerName: existingEvent.provider_name,
    providerSubjectId: existingEvent.provider_subject_id,
    correlationId: existingEvent.correlation_id,
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

  if (!isExistingMvpAWorkEmailConflictRow(conflict)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback conflict is malformed",
    );
  }

  return {
    conflictId: conflict.id,
    conflictType: conflict.conflict_type,
    currentContactValue: conflict.current_contact_value,
    attemptedProviderValue: conflict.attempted_provider_value,
    correlationId: conflict.correlation_id,
  };
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

  if (!isExistingMvpAWorkEmailConflictRow(conflict)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email writeback conflict is malformed",
    );
  }

  if (
    refreshAttempt !== undefined &&
    (conflict.provider_subject_id !== refreshAttempt.providerSubjectId ||
      (refreshAttempt.providerValue !== undefined &&
        conflict.attempted_provider_value !== refreshAttempt.providerValue) ||
      conflict.detected_at !== refreshAttempt.refreshedAt ||
      conflict.correlation_id !==
        `${createMvpAOnboardingWorkEmailRefreshCorrelationId(
          refreshAttempt.eventCorrelationId,
          refreshAttempt.refreshedAt,
        )}:conflict:provider_refresh_conflict`)
  ) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email provider refresh conflict conflicts with retry payload",
    );
  }

  return {
    conflictId: conflict.id,
    conflictType: conflict.conflict_type,
    currentContactValue: conflict.current_contact_value,
    attemptedProviderValue: conflict.attempted_provider_value,
    correlationId: conflict.correlation_id,
  };
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

  if (!isExistingMvpAWorkEmailRefreshRow(refresh)) {
    throw new SyntheticWorkEmailWritebackValidationError(
      "existing work_email provider refresh is malformed",
    );
  }

  if (
    (input.providerValue !== undefined &&
      refresh.provider_value !== input.providerValue) ||
    refresh.correlation_id !==
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
    refreshCorrelationId: refresh.correlation_id,
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

function doesExistingMvpAWorkEmailWritebackMatch(
  existing: ExistingMvpAWorkEmailWritebackEventRow,
  input: SyntheticWorkEmailWritebackInput,
): boolean {
  return (
    existing.id === input.eventId &&
    existing.person_id === input.personId &&
    existing.contact_point_id === input.contactPointId &&
    existing.provider_name === input.providerName &&
    existing.provider_subject_id === input.providerSubjectId &&
    existing.provider_value === input.providerValue &&
    existing.target_contact_type === input.targetContactType &&
    existing.correlation_id === input.correlationId &&
    existing.received_at === input.receivedAt
  );
}

function isExistingMvpAWorkEmailWritebackEventRow(
  row: Record<string, unknown>,
): row is ExistingMvpAWorkEmailWritebackEventRow {
  return (
    typeof row.id === "string" &&
    typeof row.person_id === "string" &&
    typeof row.contact_point_id === "string" &&
    row.provider_name === "synthetic_okta" &&
    typeof row.provider_subject_id === "string" &&
    typeof row.provider_value === "string" &&
    row.target_contact_type === "work_email" &&
    typeof row.correlation_id === "string" &&
    typeof row.received_at === "string"
  );
}

function isExistingMvpAWorkEmailConflictRow(
  row: Record<string, unknown>,
): row is ExistingMvpAWorkEmailConflictRow {
  return (
    typeof row.id === "string" &&
    typeof row.provider_subject_id === "string" &&
    (row.conflict_type === "inbound_value_conflict" ||
      row.conflict_type === "provider_refresh_conflict") &&
    typeof row.current_contact_value === "string" &&
    typeof row.attempted_provider_value === "string" &&
    typeof row.detected_at === "string" &&
    typeof row.correlation_id === "string"
  );
}

function isExistingMvpAWorkEmailRefreshRow(
  row: Record<string, unknown>,
): row is ExistingMvpAWorkEmailRefreshRow {
  return (
    typeof row.correlation_id === "string" &&
    typeof row.provider_value === "string"
  );
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

function splitSyntheticDisplayName(displayName: string): {
  givenName: string;
  familyName: string;
} {
  const parts = displayName.trim().split(/\s+/u);
  const givenName = parts[0] ?? displayName;
  const familyName = parts.slice(1).join(" ") || givenName;

  return { givenName, familyName };
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
