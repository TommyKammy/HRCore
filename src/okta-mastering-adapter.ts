import type { SyntheticWorkEmailWritebackInput } from "./writeback-ingest.js";

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

export interface OktaWorkEmailWritebackEventMetadata {
  provider: "okta";
  adapterMode: "mock";
  eventType: "work_email_writeback";
  projectionKey: string;
  synthetic: true;
}

export interface OktaEmittedWorkEmailWritebackEvent {
  payload: SyntheticWorkEmailWritebackInput;
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

type OktaMasteringProjectionResultCore =
  | {
      outcome: "success";
      operation: OktaMasteringOperation;
      employeeNumber: string;
      externalId: string;
      effectiveAt: string;
    }
  | {
      outcome: "skipped";
      operation: OktaMasteringOperation;
      employeeNumber: string;
      reason: "already_exists" | "already_deprovisioned" | "missing_user";
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
  project(
    projection: OktaMasteringProjection,
  ): Promise<OktaMasteringProjectionResult>;
  projectGroups(
    projection: OktaGroupProjection,
  ): Promise<OktaGroupProjectionResult>;
  emitWorkEmailWriteback(
    input: OktaWorkEmailWritebackEmissionInput,
  ): Promise<OktaEmittedWorkEmailWritebackEvent>;
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

const LOCAL_OKTAENV_PREFIX = "HRCORE_" + "OKTA" + "_";
const LOCAL_OKTAENV_KEYS = [
  `${LOCAL_OKTAENV_PREFIX}BASE_URL`,
  `${LOCAL_OKTAENV_PREFIX}CLIENT_ID`,
  `${LOCAL_OKTAENV_PREFIX}CLIENT_SECRET`,
] as const;

type LocalOktaEnvKey = (typeof LOCAL_OKTAENV_KEYS)[number];

const INVALID_PROJECTION_KEY_MESSAGE =
  "Synthetic projection key fields must be well-formed Unicode strings.";

export function createSyntheticOktaUserFixture(
  fixture: SyntheticOktaUserFixture,
): SyntheticOktaUserFixture {
  return { ...fixture };
}

export function resolveLocalOktaMasteringConfig(
  env: Partial<Record<LocalOktaEnvKey, string | undefined>> = process.env,
): BlockedOktaMasteringConfig | LocalRealOktaMasteringConfig {
  const missing = LOCAL_OKTAENV_KEYS.filter((key) =>
    isMissingOrPlaceholder(env[key]),
  );

  if (missing.length > 0) {
    return {
      mode: "blocked",
      reason: "missing_trusted_local_credentials",
      missing,
    };
  }

  return {
    mode: "local_real",
    baseUrl: readTrustedLocalOktaValue(env, LOCAL_OKTAENV_KEYS[0]),
    clientId: readTrustedLocalOktaValue(env, LOCAL_OKTAENV_KEYS[1]),
    clientSecret: readTrustedLocalOktaValue(env, LOCAL_OKTAENV_KEYS[2]),
  };
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

  constructor(config: MockOktaMasteringConfig) {
    for (const user of config.initialUsers ?? []) {
      this.usersByEmployeeNumber.set(user.employeeNumber, { ...user });
    }
    for (const group of config.initialGroups ?? []) {
      this.groupsByKey.set(group.groupKey, { ...group });
    }
    this.forcedFailures = config.forcedFailures ?? {};
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
        result = this.create(projection.desiredUser);
        break;
      case "update":
        result = this.update(projection.desiredUser);
        break;
      case "disable":
        result = this.disable(
          projection.employeeNumber,
          projection.effectiveAt,
        );
        break;
    }

    const resultWithMetadata = withMockMetadata(result);
    if (resultWithMetadata.outcome === "success") {
      this.successfulUserProjectionKeys.add(
        resultWithMetadata.metadata.projectionKey,
      );
    }
    return resultWithMetadata;
  }

  async projectGroups(
    projection: OktaGroupProjection,
  ): Promise<OktaGroupProjectionResult> {
    const normalizedGroupKeys = normalizeGroupKeys(projection.groupKeys);
    if (
      !areProjectionKeyFieldsWellFormed([
        projection.employeeNumber,
        projection.effectiveAt,
        ...normalizedGroupKeys,
      ])
    ) {
      return withMockGroupMetadata({
        outcome: "permanent_failure",
        operation: "replace_user_groups",
        employeeNumber: projection.employeeNumber,
        errorCode: "mock_invalid_projection_key",
        message: INVALID_PROJECTION_KEY_MESSAGE,
        groupKeys: normalizedGroupKeys,
        effectiveAt: projection.effectiveAt,
      });
    }

    if (projection.operation !== "replace_user_groups") {
      return withMockGroupMetadata({
        outcome: "permanent_failure",
        operation: "replace_user_groups",
        employeeNumber: projection.employeeNumber,
        errorCode: "mock_invalid_group_operation",
        message: "Synthetic group projection operation is not supported.",
        groupKeys: normalizedGroupKeys,
        effectiveAt: projection.effectiveAt,
      });
    }

    const unknownGroupKeys = normalizedGroupKeys.filter(
      (groupKey) => !this.groupsByKey.has(groupKey),
    );
    if (unknownGroupKeys.length > 0) {
      return withMockGroupMetadata({
        outcome: "permanent_failure",
        operation: "replace_user_groups",
        employeeNumber: projection.employeeNumber,
        errorCode: "mock_unknown_group",
        message: "Synthetic group projection references unknown group keys.",
        groupKeys: normalizedGroupKeys,
        effectiveAt: projection.effectiveAt,
      });
    }

    if (!this.usersByEmployeeNumber.has(projection.employeeNumber)) {
      return withMockGroupMetadata({
        outcome: "skipped",
        operation: "replace_user_groups",
        employeeNumber: projection.employeeNumber,
        reason: "missing_user",
        groupKeys: normalizedGroupKeys,
        effectiveAt: projection.effectiveAt,
      });
    }

    const currentGroupKeys =
      this.groupKeysByEmployeeNumber.get(projection.employeeNumber) ?? [];
    if (areSameGroupSet(currentGroupKeys, normalizedGroupKeys)) {
      return withMockGroupMetadata({
        outcome: "skipped",
        operation: "replace_user_groups",
        employeeNumber: projection.employeeNumber,
        reason: "already_projected",
        groupKeys: normalizedGroupKeys,
        effectiveAt: projection.effectiveAt,
      });
    }

    this.groupKeysByEmployeeNumber.set(projection.employeeNumber, [
      ...normalizedGroupKeys,
    ]);

    return withMockGroupMetadata({
      outcome: "success",
      operation: "replace_user_groups",
      employeeNumber: projection.employeeNumber,
      groupKeys: normalizedGroupKeys,
      effectiveAt: projection.effectiveAt,
    });
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

    return {
      payload: {
        eventId: [
          "okta-work-email-writeback",
          encodeProjectionKeyPart(projectionEvidence.operation),
          encodeProjectionKeyPart(input.employeeNumber),
          encodeProjectionKeyPart(input.emittedAt),
        ].join("-"),
        personId: input.personId,
        contactPointId: input.contactPointId,
        providerName: "synthetic_okta",
        providerSubjectId: existingUser.externalId,
        providerValue: input.workEmail,
        targetContactType: "work_email",
        correlationId: [
          "okta",
          "mock",
          "work_email_writeback",
          encodeProjectionKeyPart(projectionEvidence.operation),
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

  private create(
    desiredUser: SyntheticOktaUserFixture,
  ): OktaMasteringProjectionResultCore {
    if (this.usersByEmployeeNumber.has(desiredUser.employeeNumber)) {
      return {
        outcome: "skipped",
        operation: "create",
        employeeNumber: desiredUser.employeeNumber,
        reason: "already_exists",
        effectiveAt: desiredUser.effectiveAt,
      };
    }

    this.usersByEmployeeNumber.set(desiredUser.employeeNumber, {
      ...desiredUser,
    });

    return successResult("create", desiredUser);
  }

  private update(
    desiredUser: SyntheticOktaUserFixture,
  ): OktaMasteringProjectionResultCore {
    if (!this.usersByEmployeeNumber.has(desiredUser.employeeNumber)) {
      return {
        outcome: "skipped",
        operation: "update",
        employeeNumber: desiredUser.employeeNumber,
        reason: "missing_user",
        effectiveAt: desiredUser.effectiveAt,
      };
    }

    this.usersByEmployeeNumber.set(desiredUser.employeeNumber, {
      ...desiredUser,
    });

    return successResult("update", desiredUser);
  }

  private disable(
    employeeNumber: string,
    effectiveAt: string,
  ): OktaMasteringProjectionResultCore {
    const existingUser = this.usersByEmployeeNumber.get(employeeNumber);

    if (existingUser === undefined) {
      return {
        outcome: "skipped",
        operation: "disable",
        employeeNumber,
        reason: "missing_user",
        effectiveAt,
      };
    }

    if (existingUser.status === "deprovisioned") {
      return {
        outcome: "skipped",
        operation: "disable",
        employeeNumber,
        reason: "already_deprovisioned",
        effectiveAt,
      };
    }

    const disabledUser = {
      ...existingUser,
      status: "deprovisioned" as const,
      effectiveAt,
    };
    this.usersByEmployeeNumber.set(employeeNumber, disabledUser);

    return successResult("disable", disabledUser);
  }
}

function successResult(
  operation: OktaMasteringOperation,
  user: SyntheticOktaUserFixture,
): OktaMasteringProjectionResultCore {
  return {
    outcome: "success",
    operation,
    employeeNumber: user.employeeNumber,
    externalId: user.externalId,
    effectiveAt: user.effectiveAt,
  };
}

function withMockMetadata(
  result: OktaMasteringProjectionResultCore,
): OktaMasteringProjectionResult {
  return {
    ...result,
    metadata: {
      adapterMode: "mock",
      provider: "okta",
      projectionKey: [
        "okta",
        "mock",
        encodeProjectionKeyPart(result.operation),
        encodeProjectionKeyPart(result.employeeNumber),
        encodeProjectionKeyPart(result.effectiveAt),
      ].join(":"),
      synthetic: true,
    },
  };
}

function withMockGroupMetadata(
  result: OktaGroupProjectionResultCore,
): OktaGroupProjectionResult {
  const groupKeys = [...result.groupKeys];

  return {
    ...result,
    groupKeys,
    metadata: {
      adapterMode: "mock",
      provider: "okta",
      projectionKey: [
        "okta",
        "mock",
        encodeProjectionKeyPart(result.operation),
        encodeProjectionKeyPart(result.employeeNumber),
        encodeProjectionKeyPart(JSON.stringify(groupKeys)),
        encodeProjectionKeyPart(result.effectiveAt),
      ].join(":"),
      synthetic: true,
    },
  };
}

type WritebackProjectionEvidence = {
  operation: "create" | "update";
  projectionKey: string;
};

function readMatchingWritebackProjectionEvidence(
  input: OktaWorkEmailWritebackEmissionInput,
): WritebackProjectionEvidence | undefined {
  const projectionKeyParts = input.projectionEvidence.projectionKey.split(":");
  if (projectionKeyParts.length !== 5) {
    return undefined;
  }

  try {
    const [provider, adapterMode, operation, employeeNumber, effectiveAt] =
      projectionKeyParts.map(decodeURIComponent);

    if (
      provider !== "okta" ||
      adapterMode !== "mock" ||
      (operation !== "create" && operation !== "update") ||
      employeeNumber !== input.employeeNumber ||
      effectiveAt !== input.emittedAt
    ) {
      return undefined;
    }

    return {
      operation,
      projectionKey: input.projectionEvidence.projectionKey,
    };
  } catch {
    return undefined;
  }
}

function encodeProjectionKeyPart(value: string): string {
  return encodeURIComponent(toWellFormedString(value));
}

function areProjectionKeyFieldsWellFormed(values: string[]): boolean {
  return values.every(isWellFormedString);
}

function isWellFormedString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (isHighSurrogate(codeUnit)) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (!isLowSurrogate(nextCodeUnit)) {
        return false;
      }
      index += 1;
      continue;
    }

    if (isLowSurrogate(codeUnit)) {
      return false;
    }
  }

  return true;
}

function toWellFormedString(value: string): string {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (isHighSurrogate(codeUnit)) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (isLowSurrogate(nextCodeUnit)) {
        result += value[index] + value[index + 1];
        index += 1;
      } else {
        result += "\uFFFD";
      }
      continue;
    }

    result += isLowSurrogate(codeUnit) ? "\uFFFD" : value[index];
  }

  return result;
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}

function normalizeGroupKeys(groupKeys: string[]): string[] {
  return Array.from(new Set(groupKeys.map((groupKey) => groupKey.trim()))).sort(
    compareGroupKeys,
  );
}

function compareGroupKeys(left: string, right: string): number {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
}

function areSameGroupSet(left: string[], right: string[]): boolean {
  const normalizedLeft = normalizeGroupKeys(left);
  const normalizedRight = normalizeGroupKeys(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every(
      (groupKey, index) => groupKey === normalizedRight[index],
    )
  );
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

function isMissingOrPlaceholder(value: string | undefined): boolean {
  const normalizedValue = value?.trim();
  return (
    normalizedValue === undefined ||
    normalizedValue === "" ||
    /^<[^>]+>$/.test(normalizedValue) ||
    /^(todo|placeholder|example|sample)$/i.test(normalizedValue)
  );
}

function readTrustedLocalOktaValue(
  env: Partial<Record<LocalOktaEnvKey, string | undefined>>,
  key: LocalOktaEnvKey,
): string {
  const value = env[key];
  if (value === undefined || isMissingOrPlaceholder(value)) {
    throw new Error(`Missing trusted local Okta config value: ${key}`);
  }
  return value.trim();
}
