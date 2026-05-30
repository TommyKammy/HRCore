export type MvpAOnboardingBindingGateId =
  "mvp_a_onboarding_actor_subject_tenant_binding_v1";

export interface MvpAOnboardingBindingGate {
  gateId: MvpAOnboardingBindingGateId;
  readiness: "repo_owned_synthetic_non_production_only";
  requiredBindings: readonly MvpAOnboardingRequiredBinding[];
  trustedSyntheticActorPrefixes: readonly string[];
  effectiveSyntheticActorPrefixes: readonly string[];
  syntheticTenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding";
  remainingBlockedBoundaries: readonly string[];
}

export type MvpAOnboardingRequiredBinding =
  | "trusted_actor"
  | "effective_actor"
  | "subject_employee"
  | "tenant_environment"
  | "request_owner"
  | "correlation";

export interface MvpAOnboardingBindingGateEvidence {
  trustedActorId: string | undefined;
  effectiveActorIds: readonly string[];
  subjectEmployeeId: string;
  tenantEnvironmentId: string;
  requestOwnerId: string | undefined;
  requestedCorrelationId?: string;
  rootCorrelationId: string;
  linkedCorrelationIds: readonly string[];
}

const requiredBindings: readonly MvpAOnboardingRequiredBinding[] = [
  "trusted_actor",
  "effective_actor",
  "subject_employee",
  "tenant_environment",
  "request_owner",
  "correlation",
];

const trustedSyntheticActorPrefixes = ["operator-"] as const;
const effectiveSyntheticActorPrefixes = ["operator-", "worker-"] as const;

const remainingBlockedBoundaries = [
  "live Okta tenant binding",
  "production credential custody",
  "real personnel data",
  "enterprise identity governance",
  "production actor directory",
  "production tenant roles",
] as const;

const placeholderBindingTokens = new Set([
  "todo",
  "tbd",
  "unknown",
  "placeholder",
  "sample",
  "example",
  "dummy",
  "fake",
  "admin",
  "anonymous",
]);

export const mvpAOnboardingBindingGate: MvpAOnboardingBindingGate =
  Object.freeze({
    gateId: "mvp_a_onboarding_actor_subject_tenant_binding_v1",
    readiness: "repo_owned_synthetic_non_production_only",
    requiredBindings: Object.freeze([...requiredBindings]),
    trustedSyntheticActorPrefixes: Object.freeze([
      ...trustedSyntheticActorPrefixes,
    ]),
    effectiveSyntheticActorPrefixes: Object.freeze([
      ...effectiveSyntheticActorPrefixes,
    ]),
    syntheticTenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
    remainingBlockedBoundaries: Object.freeze([...remainingBlockedBoundaries]),
  });

export function assertMvpAOnboardingBindingGate(
  gate: MvpAOnboardingBindingGate,
): void {
  if (gate.gateId !== "mvp_a_onboarding_actor_subject_tenant_binding_v1") {
    throw new Error("MVP-A onboarding binding gate has an unsupported id");
  }
  if (gate.readiness !== "repo_owned_synthetic_non_production_only") {
    throw new Error(
      "MVP-A onboarding binding gate must stay synthetic non-production only",
    );
  }
  assertExactSet("required binding", gate.requiredBindings, requiredBindings);
  assertExactSet(
    "trusted synthetic actor prefix",
    gate.trustedSyntheticActorPrefixes,
    trustedSyntheticActorPrefixes,
  );
  assertExactSet(
    "effective synthetic actor prefix",
    gate.effectiveSyntheticActorPrefixes,
    effectiveSyntheticActorPrefixes,
  );
  if (
    gate.syntheticTenantEnvironmentId !==
    "repo_owned_synthetic_mvp_a_onboarding"
  ) {
    throw new Error(
      "MVP-A onboarding binding gate must use the repo-owned synthetic tenant environment",
    );
  }
  assertExactSet(
    "remaining blocked boundary",
    gate.remainingBlockedBoundaries,
    remainingBlockedBoundaries,
  );
}

export function assertMvpAOnboardingBindingGateEvidence(
  gate: MvpAOnboardingBindingGate,
  evidence: MvpAOnboardingBindingGateEvidence,
): void {
  assertMvpAOnboardingBindingGate(gate);

  const trustedActorId = requireBoundBinding(
    "trusted actor",
    evidence.trustedActorId,
  );
  requireTrustedSyntheticActor(gate, trustedActorId);

  const requestOwnerId = requireBoundBinding(
    "request owner",
    evidence.requestOwnerId,
  );
  requireTrustedSyntheticActor(gate, requestOwnerId);
  if (requestOwnerId !== trustedActorId) {
    throw new Error(
      "MVP-A onboarding binding gate requires request owner to match the trusted actor",
    );
  }

  if (evidence.effectiveActorIds.length === 0) {
    throw new Error(
      "MVP-A onboarding binding gate requires at least one effective actor",
    );
  }
  for (const actorId of evidence.effectiveActorIds) {
    requireEffectiveSyntheticActor(gate, actorId);
  }

  requireBoundBinding("subject employee", evidence.subjectEmployeeId);
  if (evidence.tenantEnvironmentId !== gate.syntheticTenantEnvironmentId) {
    throw new Error(
      "MVP-A onboarding binding gate requires the explicit repo-owned synthetic tenant environment",
    );
  }

  const rootCorrelationId = requireBoundBinding(
    "root correlation",
    evidence.rootCorrelationId,
  );
  const requestedCorrelationId = requireBoundBinding(
    "requested correlation",
    evidence.requestedCorrelationId ?? evidence.rootCorrelationId,
  );
  const linkedCorrelationIds = evidence.linkedCorrelationIds.map(
    (correlationId) => requireBoundBinding("linked correlation", correlationId),
  );
  if (evidence.linkedCorrelationIds.length === 0) {
    throw new Error(
      "MVP-A onboarding binding gate requires linked correlation evidence",
    );
  }
  if (
    requestedCorrelationId !== rootCorrelationId &&
    linkedCorrelationIds.every(
      (correlationId) => correlationId !== requestedCorrelationId,
    )
  ) {
    throw new Error(
      "MVP-A onboarding binding gate requires the requested correlation to match root or linked evidence",
    );
  }
}

function requireEffectiveSyntheticActor(
  gate: MvpAOnboardingBindingGate,
  actorId: string,
): void {
  const boundActorId = requireBoundBinding("actor", actorId);
  const matchedPrefix = gate.effectiveSyntheticActorPrefixes.find((prefix) =>
    boundActorId.startsWith(prefix),
  );
  if (!matchedPrefix) {
    throw new Error(
      "MVP-A onboarding binding gate rejects untrusted actor evidence",
    );
  }
  requireConcreteActorSuffix(boundActorId, matchedPrefix);
}

function requireTrustedSyntheticActor(
  gate: MvpAOnboardingBindingGate,
  actorId: string,
): void {
  const boundActorId = requireBoundBinding("actor", actorId);
  const matchedPrefix = gate.trustedSyntheticActorPrefixes.find((prefix) =>
    boundActorId.startsWith(prefix),
  );
  if (!matchedPrefix) {
    throw new Error(
      "MVP-A onboarding binding gate rejects untrusted actor evidence",
    );
  }
  requireConcreteActorSuffix(boundActorId, matchedPrefix);
}

function requireConcreteActorSuffix(actorId: string, prefix: string): void {
  const suffix = actorId.slice(prefix.length);
  if (!/[a-z0-9]/iu.test(suffix)) {
    throw new Error(
      "MVP-A onboarding binding gate requires concrete actor evidence after the synthetic prefix",
    );
  }
}

function requireBoundBinding(
  bindingName: string,
  value: string | undefined,
): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(
      `MVP-A onboarding binding gate requires explicit ${bindingName} evidence`,
    );
  }

  const boundValue = value.trim();
  if (isPlaceholderBinding(boundValue)) {
    throw new Error(
      `MVP-A onboarding binding gate rejects placeholder ${bindingName} evidence`,
    );
  }

  return boundValue;
}

function isPlaceholderBinding(value: string): boolean {
  const normalized = value.toLowerCase();
  const tokens = normalized.split(/[^a-z0-9]+/u).filter(Boolean);
  return tokens.some((token) => isPlaceholderBindingToken(token));
}

function isPlaceholderBindingToken(token: string): boolean {
  if (placeholderBindingTokens.has(token)) {
    return true;
  }

  for (const placeholderToken of placeholderBindingTokens) {
    const suffix = token.slice(placeholderToken.length);
    if (
      token.startsWith(placeholderToken) &&
      suffix.length > 0 &&
      /^\d+$/u.test(suffix)
    ) {
      return true;
    }
  }
  return false;
}

function assertExactSet(
  name: string,
  actualValues: readonly string[],
  expectedValues: readonly string[],
): void {
  if (actualValues.length !== expectedValues.length) {
    throw new Error(`MVP-A onboarding binding gate has incomplete ${name}s`);
  }

  const actualSet = new Set(actualValues);
  if (actualSet.size !== actualValues.length) {
    throw new Error(`MVP-A onboarding binding gate duplicates ${name}s`);
  }

  for (const expectedValue of expectedValues) {
    if (!actualSet.has(expectedValue)) {
      throw new Error(
        `MVP-A onboarding binding gate is missing ${expectedValue} ${name}`,
      );
    }
  }
}
