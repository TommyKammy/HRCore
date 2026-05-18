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
      errorCode: "mock_invalid_group_operation" | "mock_unknown_group";
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

const LOCAL_OKTA_ENV_KEYS = [
  "HRCORE_OKTA_BASE_URL",
  "HRCORE_OKTA_CLIENT_ID",
  "HRCORE_OKTA_CLIENT_SECRET",
] as const;

type LocalOktaEnvKey = (typeof LOCAL_OKTA_ENV_KEYS)[number];

export function createSyntheticOktaUserFixture(
  fixture: SyntheticOktaUserFixture,
): SyntheticOktaUserFixture {
  return { ...fixture };
}

export function resolveLocalOktaMasteringConfig(
  env: Partial<Record<LocalOktaEnvKey, string | undefined>> = process.env,
): BlockedOktaMasteringConfig | LocalRealOktaMasteringConfig {
  const missing = LOCAL_OKTA_ENV_KEYS.filter((key) =>
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
    baseUrl: readTrustedLocalOktaValue(env, "HRCORE_OKTA_BASE_URL"),
    clientId: readTrustedLocalOktaValue(env, "HRCORE_OKTA_CLIENT_ID"),
    clientSecret: readTrustedLocalOktaValue(env, "HRCORE_OKTA_CLIENT_SECRET"),
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

    return withMockMetadata(result);
  }

  async projectGroups(
    projection: OktaGroupProjection,
  ): Promise<OktaGroupProjectionResult> {
    const normalizedGroupKeys = normalizeGroupKeys(projection.groupKeys);

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

function encodeProjectionKeyPart(value: string): string {
  return encodeURIComponent(value);
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
