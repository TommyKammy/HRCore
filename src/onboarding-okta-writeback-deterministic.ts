import type {
  OktaMasteringProjectionResult,
  SyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import type {
  ExistingOnboardingTransactionRequestRow,
  OnboardingTransactionRequestPayload,
} from "./onboarding-transaction-request-internal.js";
import type { SyntheticWorkEmailWritebackInput } from "./writeback-ingest.js";
import type { OktaOnboardingUserProjectionResult } from "./onboarding-okta-writeback-integration.js";

export function buildMvpAOktaUserProjection(
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

export function createExpectedMvpAOnboardingWorkEmailWritebackInput(input: {
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

function splitSyntheticDisplayName(displayName: string): {
  givenName: string;
  familyName: string;
} {
  const parts = displayName.trim().split(/\s+/u);
  const givenName = parts[0] ?? displayName;
  const familyName = parts.slice(1).join(" ") || givenName;

  return { givenName, familyName };
}
