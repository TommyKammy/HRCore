import type { SyntheticWorkEmailWritebackInput } from "./writeback-ingest.js";
import {
  areProjectionKeyFieldsWellFormed,
  encodeProjectionKeyPart,
  readMatchingWritebackProjectionEvidence,
  readUserProjectionEvidenceForEmployee,
  toTimestampMillis,
  withMockMetadata,
} from "./okta-mastering-adapter-metadata.js";
import { projectMockOktaGroups } from "./okta-mastering-adapter-mock-groups.js";
import {
  createMockOktaUser,
  disableMockOktaUser,
  updateMockOktaUser,
} from "./okta-mastering-adapter-mock-users.js";
export { resolveLocalOktaMasteringConfig } from "./okta-mastering-adapter-config.js";

export type SyntheticOktaUserStatus =
  | "active"
  | "staged"
  | "suspended"
  | "deprovisioned";

export interface SyntheticOktaUserFixture {
  externalId: string;
  employeeNumber: string;
  email: string;
  displayName: string;
  givenName: string;
  familyName: string;
  status: SyntheticOktaUserStatus;
  departmentCode: string;
  managerExternalId?: string;
  effectiveAt: string;
}

export interface SyntheticOktaGroupFixture {
  externalId: string;
  groupKey: string;
  displayName: string;
  purpose: "poc_identity_lifecycle_membership";
  effectiveAt: string;
}

export type OktaMasteringOperation = "create" | "update" | "disable";
export type OktaGroupProjectionOperation = "replace_user_groups";

export type OktaMasteringProjection =
  | {
      operation: "create" | "update";
      desiredUser: SyntheticOktaUserFixture;
    }
  | {
      operation: "disable";
      employeeNumber: string;
      effectiveAt: string;
    };

export interface OktaGroupProjection {
  operation: OktaGroupProjectionOperation;
  employeeNumber: string;
  groupKeys: string[];
  effectiveAt: string;
}

export type RetryableOktaMasteringFailure = {
  outcome: "retryable_failure";
  errorCode: string;
  message: string;
  retryAfterSeconds?: number;
};

export type PermanentOktaMasteringFailure = {
  outcome: "permanent_failure";
  errorCode: string;
  message: string;
};

export type ForcedOktaMasteringFailure =
  | RetryableOktaMasteringFailure
  | PermanentOktaMasteringFailure;

export interface OktaMasteringProjectionMetadata {
  provider: "okta";
  adapterMode: "mock";
  projectionKey: string;
  synthetic: true;
}

export interface OktaWorkEmailWritebackEmissionInput {
  personId: string;
  contactPointId: string;
  employeeNumber: string;
  workEmail: string;
  emittedAt: string;
  projectionEvidence: OktaMasteringProjectionMetadata;
}

export interface OktaWorkEmailWritebackRefreshInput {
  providerSubjectId: string;
  refreshedAt: string;
  projectionEvidence: OktaMasteringProjectionMetadata;
}

export interface OktaWorkEmailWritebackEventMetadata {
  provider: "okta";
  adapterMode: "mock";
  eventType: "work_email_writeback" | "work_email_refresh";
  projectionKey: string;
  synthetic: true;
}

export interface OktaEmittedWorkEmailWritebackEvent {
  payload: SyntheticWorkEmailWritebackInput;
  metadata: OktaWorkEmailWritebackEventMetadata;
}

export interface OktaRefreshedWorkEmailWritebackValue {
  providerName: "synthetic_okta";
  providerSubjectId: string;
  providerValue: string;
  refreshedAt: string;
  metadata: OktaWorkEmailWritebackEventMetadata;
}

type OktaGroupProjectionResultCore =
  | {
      outcome: "success";
      operation: OktaGroupProjectionOperation;
      employeeNumber: string;
      groupKeys: string[];
      effectiveAt: string;
    }
  | {
      outcome: "skipped";
      operation: OktaGroupProjectionOperation;
      employeeNumber: string;
      reason: "already_projected" | "missing_user";
      groupKeys: string[];
      effectiveAt: string;
    }
  | {
      outcome: "permanent_failure";
      operation: OktaGroupProjectionOperation;
      employeeNumber: string;
      errorCode:
        | "mock_invalid_group_operation"
        | "mock_invalid_projection_key"
        | "mock_unknown_group";
      message: string;
      groupKeys: string[];
      effectiveAt: string;
    };

export type OktaGroupProjectionResult = OktaGroupProjectionResultCore & {
  metadata: OktaMasteringProjectionMetadata;
};

export type OktaMasteringProjectionResultCore =
  | {
      outcome: "success";
      operation: OktaMasteringOperation;
      employeeNumber: string;
      externalId: string;
      effectiveAt: string;
    }
  | {
      outcome: "skipped";
      operation: "create";
      employeeNumber: string;
      externalId: string;
      reason: "already_exists";
      effectiveAt: string;
    }
  | {
      outcome: "skipped";
      operation: OktaMasteringOperation;
      employeeNumber: string;
      reason: "already_deprovisioned" | "missing_user";
      effectiveAt: string;
    }
  | (RetryableOktaMasteringFailure & {
      operation: OktaMasteringOperation;
      employeeNumber: string;
      effectiveAt: string;
    })
  | (PermanentOktaMasteringFailure & {
      operation: OktaMasteringOperation;
      employeeNumber: string;
      effectiveAt: string;
    });

export type OktaMasteringProjectionResult =
  OktaMasteringProjectionResultCore & {
    metadata: OktaMasteringProjectionMetadata;
  };

export interface OktaMasteringAdapter {
  readSyntheticUserByEmployeeNumber(
    employeeNumber: string,
  ): SyntheticOktaUserFixture | undefined;
  project(
    projection: OktaMasteringProjection,
  ): Promise<OktaMasteringProjectionResult>;
  projectGroups(
    projection: OktaGroupProjection,
  ): Promise<OktaGroupProjectionResult>;
  emitWorkEmailWriteback(
    input: OktaWorkEmailWritebackEmissionInput,
  ): Promise<OktaEmittedWorkEmailWritebackEvent>;
  refreshWorkEmailWriteback(
    input: OktaWorkEmailWritebackRefreshInput,
  ): Promise<OktaRefreshedWorkEmailWritebackValue>;
}

export interface MockOktaMasteringConfig {
  mode: "mock";
  initialUsers?: SyntheticOktaUserFixture[];
  initialGroups?: SyntheticOktaGroupFixture[];
  forcedFailures?: Record<string, ForcedOktaMasteringFailure>;
}

export interface BlockedOktaMasteringConfig {
  mode: "blocked";
  reason: "missing_trusted_local_credentials";
  missing: string[];
}

export interface LocalRealOktaMasteringConfig {
  mode: "local_real";
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export type OktaMasteringAdapterConfig =
  | MockOktaMasteringConfig
  | BlockedOktaMasteringConfig
  | LocalRealOktaMasteringConfig;

const INVALID_PROJECTION_KEY_MESSAGE =
  "Synthetic projection key fields must be well-formed Unicode strings.";

export function createSyntheticOktaUserFixture(
  fixture: SyntheticOktaUserFixture,
): SyntheticOktaUserFixture {
  return { ...fixture };
}

export function buildOktaMasteringAdapter(
  config: OktaMasteringAdapterConfig = { mode: "mock" },
): OktaMasteringAdapter {
  if (config.mode === "mock") {
    return new MockOktaMasteringAdapter(config);
  }

  throw new Error(
    "Real Okta mastering adapter is not implemented for this PoC; use mock mode or provide a later approved implementation boundary.",
  );
}

class MockOktaMasteringAdapter implements OktaMasteringAdapter {
  private readonly usersByEmployeeNumber = new Map<
    string,
    SyntheticOktaUserFixture
  >();

  private readonly groupsByKey = new Map<string, SyntheticOktaGroupFixture>();

  private readonly groupKeysByEmployeeNumber = new Map<string, string[]>();

  private readonly forcedFailures: Record<string, ForcedOktaMasteringFailure>;

  private readonly successfulUserProjectionKeys = new Set<string>();

  private readonly currentUserProjectionKeyByEmployeeNumber = new Map<
    string,
    string
  >();

  constructor(config: MockOktaMasteringConfig) {
    for (const user of config.initialUsers ?? []) {
      this.usersByEmployeeNumber.set(user.employeeNumber, { ...user });
    }
    for (const group of config.initialGroups ?? []) {
      this.groupsByKey.set(group.groupKey, { ...group });
    }
    this.forcedFailures = config.forcedFailures ?? {};
  }

  readSyntheticUserByEmployeeNumber(
    employeeNumber: string,
  ): SyntheticOktaUserFixture | undefined {
    const user = this.usersByEmployeeNumber.get(employeeNumber);
    return user === undefined ? undefined : { ...user };
  }

  async project(
    projection: OktaMasteringProjection,
  ): Promise<OktaMasteringProjectionResult> {
    const employeeNumber = getProjectionEmployeeNumber(projection);
    const effectiveAt = getProjectionEffectiveAt(projection);
    if (!areProjectionKeyFieldsWellFormed([employeeNumber, effectiveAt])) {
      return withMockMetadata({
        outcome: "permanent_failure",
        operation: projection.operation,
        employeeNumber,
        errorCode: "mock_invalid_projection_key",
        message: INVALID_PROJECTION_KEY_MESSAGE,
        effectiveAt,
      });
    }

    const forcedFailure = this.forcedFailures[employeeNumber];

    if (forcedFailure !== undefined) {
      return withMockMetadata({
        ...forcedFailure,
        operation: projection.operation,
        employeeNumber,
        effectiveAt,
      });
    }

    let result: OktaMasteringProjectionResultCore;
    switch (projection.operation) {
      case "create":
        result = createMockOktaUser(
          projection.desiredUser,
          this.usersByEmployeeNumber,
        );
        break;
      case "update":
        result = updateMockOktaUser(
          projection.desiredUser,
          this.usersByEmployeeNumber,
        );
        break;
      case "disable":
        result = disableMockOktaUser(
          projection.employeeNumber,
          projection.effectiveAt,
          this.usersByEmployeeNumber,
        );
        break;
    }

    const resultWithMetadata = withMockMetadata(result);
    if (resultWithMetadata.outcome === "success") {
      this.successfulUserProjectionKeys.add(
        resultWithMetadata.metadata.projectionKey,
      );
      this.currentUserProjectionKeyByEmployeeNumber.set(
        resultWithMetadata.employeeNumber,
        resultWithMetadata.metadata.projectionKey,
      );
    } else if (!this.isCurrentIdempotentCreateSkip(resultWithMetadata)) {
      this.successfulUserProjectionKeys.delete(
        resultWithMetadata.metadata.projectionKey,
      );
    }
    return resultWithMetadata;
  }

  async projectGroups(
    projection: OktaGroupProjection,
  ): Promise<OktaGroupProjectionResult> {
    return projectMockOktaGroups(
      projection,
      {
        groupsByKey: this.groupsByKey,
        usersByEmployeeNumber: this.usersByEmployeeNumber,
        groupKeysByEmployeeNumber: this.groupKeysByEmployeeNumber,
      },
      INVALID_PROJECTION_KEY_MESSAGE,
    );
  }

  async emitWorkEmailWriteback(
    input: OktaWorkEmailWritebackEmissionInput,
  ): Promise<OktaEmittedWorkEmailWritebackEvent> {
    if (
      !areProjectionKeyFieldsWellFormed([
        input.personId,
        input.contactPointId,
        input.employeeNumber,
        input.workEmail,
        input.emittedAt,
        input.projectionEvidence.projectionKey,
      ])
    ) {
      throw new Error(
        "Synthetic writeback event fields must be well-formed Unicode strings.",
      );
    }

    if (input.workEmail.indexOf("@") <= 0) {
      throw new Error(
        "Synthetic writeback workEmail must be a skeleton email.",
      );
    }

    if (
      input.projectionEvidence.provider !== "okta" ||
      input.projectionEvidence.adapterMode !== "mock" ||
      input.projectionEvidence.synthetic !== true
    ) {
      throw new Error(
        "Synthetic writeback requires mock Okta projection evidence.",
      );
    }

    const projectionEvidence = readMatchingWritebackProjectionEvidence(input);
    if (projectionEvidence === undefined) {
      throw new Error(
        "Synthetic writeback projection evidence must match the emitted employee and timestamp.",
      );
    }

    const existingUser = this.usersByEmployeeNumber.get(input.employeeNumber);
    if (existingUser === undefined) {
      throw new Error(
        "Synthetic writeback requires an existing mock Okta user.",
      );
    }

    if (existingUser.email !== input.workEmail) {
      throw new Error(
        "Synthetic writeback workEmail must match the projected mock Okta user.",
      );
    }

    if (
      !this.successfulUserProjectionKeys.has(projectionEvidence.projectionKey)
    ) {
      throw new Error(
        "Synthetic writeback requires successful mock Okta projection evidence.",
      );
    }

    const operationIdentity = encodeProjectionKeyPart(
      projectionEvidence.operation,
    );

    return {
      payload: {
        eventId: [
          "okta-work-email-writeback",
          operationIdentity,
          encodeProjectionKeyPart(input.employeeNumber),
          encodeProjectionKeyPart(input.emittedAt),
        ].join("-"),
        personId: input.personId,
        contactPointId: input.contactPointId,
        providerName: "synthetic_okta",
        providerSubjectId: existingUser.externalId,
        providerValue: existingUser.email,
        targetContactType: "work_email",
        correlationId: [
          "okta",
          "mock",
          "work_email_writeback",
          operationIdentity,
          encodeProjectionKeyPart(input.employeeNumber),
          encodeProjectionKeyPart(input.emittedAt),
        ].join(":"),
        receivedAt: input.emittedAt,
        pocMarker: "synthetic_poc",
      },
      metadata: {
        provider: "okta",
        adapterMode: "mock",
        eventType: "work_email_writeback",
        projectionKey: input.projectionEvidence.projectionKey,
        synthetic: true,
      },
    };
  }

  async refreshWorkEmailWriteback(
    input: OktaWorkEmailWritebackRefreshInput,
  ): Promise<OktaRefreshedWorkEmailWritebackValue> {
    if (
      !areProjectionKeyFieldsWellFormed([
        input.providerSubjectId,
        input.refreshedAt,
        input.projectionEvidence.projectionKey,
      ])
    ) {
      throw new Error(
        "Synthetic writeback refresh fields must be well-formed Unicode strings.",
      );
    }

    if (
      input.projectionEvidence.provider !== "okta" ||
      input.projectionEvidence.adapterMode !== "mock" ||
      input.projectionEvidence.synthetic !== true
    ) {
      throw new Error(
        "Synthetic writeback refresh requires mock Okta projection evidence.",
      );
    }

    const existingUser = this.findUserByExternalId(input.providerSubjectId);
    if (existingUser === undefined) {
      throw new Error(
        "Synthetic writeback refresh requires an existing mock Okta user.",
      );
    }

    const projectionEvidence = readUserProjectionEvidenceForEmployee(
      input.projectionEvidence,
      existingUser.employeeNumber,
    );
    if (projectionEvidence === undefined) {
      throw new Error(
        "Synthetic writeback refresh projection evidence must match the provider subject.",
      );
    }

    if (projectionEvidence.effectiveAt !== existingUser.effectiveAt) {
      throw new Error(
        "Synthetic writeback refresh projection evidence must match the current provider state.",
      );
    }

    if (
      projectionEvidence.projectionKey !==
      this.currentUserProjectionKeyByEmployeeNumber.get(
        existingUser.employeeNumber,
      )
    ) {
      throw new Error(
        "Synthetic writeback refresh projection evidence must match the current provider state.",
      );
    }

    if (
      toTimestampMillis(input.refreshedAt) <
      toTimestampMillis(projectionEvidence.effectiveAt)
    ) {
      throw new Error(
        "Synthetic writeback refresh timestamp must not be earlier than the current provider state.",
      );
    }

    if (
      !this.successfulUserProjectionKeys.has(projectionEvidence.projectionKey)
    ) {
      throw new Error(
        "Synthetic writeback refresh requires successful mock Okta projection evidence.",
      );
    }

    if (existingUser.email.indexOf("@") <= 0) {
      throw new Error(
        "Synthetic writeback refresh provider email must be a skeleton email.",
      );
    }

    return {
      providerName: "synthetic_okta",
      providerSubjectId: existingUser.externalId,
      providerValue: existingUser.email,
      refreshedAt: input.refreshedAt,
      metadata: {
        provider: "okta",
        adapterMode: "mock",
        eventType: "work_email_refresh",
        projectionKey: projectionEvidence.projectionKey,
        synthetic: true,
      },
    };
  }

  private findUserByExternalId(
    externalId: string,
  ): SyntheticOktaUserFixture | undefined {
    for (const user of this.usersByEmployeeNumber.values()) {
      if (user.externalId === externalId) {
        return user;
      }
    }

    return undefined;
  }

  private isCurrentIdempotentCreateSkip(
    result: OktaMasteringProjectionResult,
  ): boolean {
    return (
      result.outcome === "skipped" &&
      result.operation === "create" &&
      result.reason === "already_exists" &&
      this.currentUserProjectionKeyByEmployeeNumber.get(
        result.employeeNumber,
      ) === result.metadata.projectionKey
    );
  }
}

function getProjectionEmployeeNumber(projection: OktaMasteringProjection) {
  return projection.operation === "disable"
    ? projection.employeeNumber
    : projection.desiredUser.employeeNumber;
}

function getProjectionEffectiveAt(projection: OktaMasteringProjection) {
  return projection.operation === "disable"
    ? projection.effectiveAt
    : projection.desiredUser.effectiveAt;
}
