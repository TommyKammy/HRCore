import type {
  OktaGroupProjectionResult,
  OktaMasteringAdapter,
  OktaMasteringProjectionResult,
} from "./okta-mastering-adapter.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { readOnboardingTransactionRequestById } from "./onboarding-transaction-request-readers.js";
import {
  applyApprovedTerminationTransactionRequest,
  parsePersistedTerminationApplyPayload,
  type AppliedTerminationTransactionRequestResult,
  type ApplyApprovedTerminationTransactionRequestInput,
} from "./termination-transaction-request-apply.js";

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

export interface AppliedTerminationTransactionRequestWithOktaProjectionResult extends AppliedTerminationTransactionRequestResult {
  oktaProjection: OktaTerminationProjectionImpactEvidence;
}

export interface ApplyApprovedTerminationTransactionRequestWithOktaProjectionInput extends ApplyApprovedTerminationTransactionRequestInput {
  oktaAdapter: OktaMasteringAdapter;
}

export async function applyApprovedTerminationTransactionRequestWithOktaProjection(
  db: OnboardingTransactionRequestDatabase,
  input: ApplyApprovedTerminationTransactionRequestWithOktaProjectionInput,
): Promise<AppliedTerminationTransactionRequestWithOktaProjectionResult> {
  const { oktaAdapter, ...applyInput } = input;
  const applied = applyApprovedTerminationTransactionRequest(db, applyInput);
  const existing = readOnboardingTransactionRequestById(
    db,
    applied.transactionRequestId,
  );
  if (!existing || existing.request_type !== "terminate") {
    throw new Error(
      "Okta termination projection requires an applied termination",
    );
  }

  const payload = parsePersistedTerminationApplyPayload(existing);
  const employmentCode = readTerminationEmploymentCode(
    db,
    applied.employmentId,
  );
  if (employmentCode !== payload.currentEmployment.employmentCode) {
    throw new Error(
      "Okta termination projection requires applied employment to match the termination payload",
    );
  }

  const profileResult = await oktaAdapter.project({
    operation: "disable",
    employeeNumber: employmentCode,
    effectiveAt: input.appliedAt,
  });
  const profileStatus = toOktaTerminationProfileProjectionStatus(profileResult);

  let groupProjection:
    | OktaTerminationProjectionImpactEvidence["groups"]
    | undefined;
  if (isUsableTerminationProfileProjection(profileResult)) {
    const groupResult = await oktaAdapter.projectGroups({
      operation: "replace_user_groups",
      employeeNumber: employmentCode,
      groupKeys: [],
      effectiveAt: input.appliedAt,
    });
    groupProjection = {
      status: toOktaTerminationGroupProjectionStatus(groupResult),
      result: groupResult,
    };
  } else {
    groupProjection = {
      status: "skipped",
      skippedReason: "profile_projection_not_successful",
    };
  }

  return {
    ...applied,
    oktaProjection: {
      provider: "okta",
      adapterMode: "mock",
      synthetic: true,
      authoritativeForRbac: false,
      transactionRequestId: applied.transactionRequestId,
      lifecycleEventId: applied.lifecycleEventId,
      applyCorrelationId: applied.correlationId,
      profile: {
        status: profileStatus,
        result: profileResult,
      },
      groups: groupProjection,
    },
  };
}

function readTerminationEmploymentCode(
  db: OnboardingTransactionRequestDatabase,
  employmentId: string,
): string {
  const row = db
    .prepare(
      `
        SELECT employment_code
        FROM employment
        WHERE id = ?
        LIMIT 1
      `,
    )
    .get(employmentId) as { employment_code: string } | undefined;
  if (!row) {
    throw new Error("Okta termination projection requires applied employment");
  }

  return row.employment_code;
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
