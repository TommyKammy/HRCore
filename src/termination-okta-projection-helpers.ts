import type {
  OktaGroupProjectionResult,
  OktaMasteringAdapter,
  OktaMasteringProjectionResult,
} from "./okta-mastering-adapter.js";

export type OktaTerminationProfileProjectionStatus =
  | "projected"
  | "already_projected"
  | "skipped"
  | "retryable_failure"
  | "failed";

export type OktaTerminationGroupProjectionStatus =
  | "projected"
  | "already_projected"
  | "skipped"
  | "failed";

export interface OktaTerminationProjectionImpactEvidence {
  provider: "okta";
  adapterMode: "mock";
  synthetic: true;
  authoritativeForRbac: false;
  transactionRequestId: string;
  lifecycleEventId: string;
  applyCorrelationId: string;
  profile: {
    status: OktaTerminationProfileProjectionStatus;
    result: OktaMasteringProjectionResult;
  };
  groups: {
    status: OktaTerminationGroupProjectionStatus;
    result?: OktaGroupProjectionResult;
    skippedReason?: "profile_projection_not_successful";
  };
}

export async function projectTerminationMockOktaDisable(input: {
  oktaAdapter: OktaMasteringAdapter;
  employmentCode: string;
  effectiveAt: string;
}): Promise<OktaTerminationProjectionImpactEvidence["profile"]> {
  const result = await input.oktaAdapter.project({
    operation: "disable",
    employeeNumber: input.employmentCode,
    effectiveAt: input.effectiveAt,
  });

  return {
    status: toOktaTerminationProfileProjectionStatus(result),
    result,
  };
}

export async function projectTerminationMockOktaGroupRemoval(input: {
  oktaAdapter: OktaMasteringAdapter;
  employmentCode: string;
  effectiveAt: string;
  profile: OktaTerminationProjectionImpactEvidence["profile"];
}): Promise<OktaTerminationProjectionImpactEvidence["groups"]> {
  if (!isUsableTerminationProfileProjection(input.profile.result)) {
    return {
      status: "skipped",
      skippedReason: "profile_projection_not_successful",
    };
  }

  const result = await input.oktaAdapter.projectGroups({
    operation: "replace_user_groups",
    employeeNumber: input.employmentCode,
    groupKeys: [],
    effectiveAt: input.effectiveAt,
  });

  return {
    status: toOktaTerminationGroupProjectionStatus(result),
    result,
  };
}

export function buildTerminationOktaProjectionEvidence(input: {
  transactionRequestId: string;
  lifecycleEventId: string;
  applyCorrelationId: string;
  profile: OktaTerminationProjectionImpactEvidence["profile"];
  groups: OktaTerminationProjectionImpactEvidence["groups"];
}): OktaTerminationProjectionImpactEvidence {
  return {
    provider: "okta",
    adapterMode: "mock",
    synthetic: true,
    authoritativeForRbac: false,
    transactionRequestId: input.transactionRequestId,
    lifecycleEventId: input.lifecycleEventId,
    applyCorrelationId: input.applyCorrelationId,
    profile: input.profile,
    groups: input.groups,
  };
}

function isUsableTerminationProfileProjection(
  result: OktaMasteringProjectionResult,
): boolean {
  return (
    result.outcome === "success" ||
    (result.outcome === "skipped" &&
      result.operation === "disable" &&
      result.reason === "already_deprovisioned")
  );
}

function toOktaTerminationProfileProjectionStatus(
  result: OktaMasteringProjectionResult,
): OktaTerminationProfileProjectionStatus {
  switch (result.outcome) {
    case "success":
      return "projected";
    case "retryable_failure":
      return "retryable_failure";
    case "permanent_failure":
      return "failed";
    case "skipped":
      return result.operation === "disable" &&
        result.reason === "already_deprovisioned"
        ? "already_projected"
        : "skipped";
  }
}

function toOktaTerminationGroupProjectionStatus(
  result: OktaGroupProjectionResult,
): OktaTerminationGroupProjectionStatus {
  if (result.outcome === "success") {
    return "projected";
  }

  if (result.outcome === "skipped") {
    return result.reason === "already_projected"
      ? "already_projected"
      : "skipped";
  }

  return "failed";
}
