import type {
  OktaGroupProjectionResult,
  OktaMasteringAdapter,
  OktaMasteringProjectionResult,
  SyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import { readOnboardingTransactionRequestById } from "./onboarding-transaction-request-readers.js";
import type {
  ApplyApprovedTransferTransactionRequestInput,
  AppliedTransferTransactionRequestResult,
  ExistingTransferTransactionRequestRow,
} from "./transfer-transaction-request-apply.js";
import {
  applyApprovedTransferTransactionRequest,
  parsePersistedTransferApplyPayload,
} from "./transfer-transaction-request-apply.js";
import type { TransferTransactionRequestPayload } from "./transfer-transaction-request-contract.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";

export type OktaTransferProfileProjectionStatus =
  | "projected"
  | "skipped"
  | "retryable_failure"
  | "failed";

export type OktaTransferGroupProjectionStatus =
  | "projected"
  | "already_projected"
  | "skipped"
  | "failed";

export interface OktaTransferProjectionImpactEvidence {
  provider: "okta";
  adapterMode: "mock";
  synthetic: true;
  authoritativeForRbac: false;
  transactionRequestId: string;
  lifecycleEventId: string;
  applyCorrelationId: string;
  profile: {
    status: OktaTransferProfileProjectionStatus;
    result: OktaMasteringProjectionResult;
  };
  groups: {
    status: OktaTransferGroupProjectionStatus;
    result?: OktaGroupProjectionResult;
    skippedReason?: "profile_projection_not_successful";
  };
}

export interface AppliedTransferTransactionRequestWithOktaProjectionResult extends AppliedTransferTransactionRequestResult {
  oktaProjection: OktaTransferProjectionImpactEvidence;
}

export interface ApplyApprovedTransferTransactionRequestWithOktaProjectionInput extends ApplyApprovedTransferTransactionRequestInput {
  oktaAdapter: OktaMasteringAdapter;
}

export async function applyApprovedTransferTransactionRequestWithOktaProjection(
  db: OnboardingTransactionRequestDatabase,
  input: ApplyApprovedTransferTransactionRequestWithOktaProjectionInput,
): Promise<AppliedTransferTransactionRequestWithOktaProjectionResult> {
  const { oktaAdapter, ...applyInput } = input;
  const applied = applyApprovedTransferTransactionRequest(db, applyInput);
  const existing = readOnboardingTransactionRequestById(
    db,
    applied.transactionRequestId,
  );
  if (!existing || existing.request_type !== "transfer") {
    throw new Error("Okta transfer projection requires an applied transfer");
  }

  const payload = parsePersistedTransferApplyPayload(existing);
  const employmentCode = readTransferEmploymentCode(db, applied.employmentId);
  const currentUser =
    oktaAdapter.readSyntheticUserByEmployeeNumber(employmentCode);
  const profileResult = await oktaAdapter.project({
    operation: "update",
    desiredUser: buildMvpBTransferOktaUserProjection({
      existing,
      payload,
      employmentCode,
      effectiveAt: input.appliedAt,
      currentUser,
    }),
  });
  const profileStatus = toOktaTransferProfileProjectionStatus(profileResult);

  let groupProjection:
    | OktaTransferProjectionImpactEvidence["groups"]
    | undefined;
  if (profileResult.outcome === "success") {
    const groupResult = await oktaAdapter.projectGroups({
      operation: "replace_user_groups",
      employeeNumber: employmentCode,
      groupKeys: buildMvpBTransferOktaGroupKeys(payload),
      effectiveAt: input.appliedAt,
    });
    groupProjection = {
      status: toOktaTransferGroupProjectionStatus(groupResult),
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

function readTransferEmploymentCode(
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
    throw new Error("Okta transfer projection requires applied employment");
  }

  return row.employment_code;
}

function buildMvpBTransferOktaUserProjection(input: {
  existing: ExistingTransferTransactionRequestRow;
  payload: TransferTransactionRequestPayload;
  employmentCode: string;
  effectiveAt: string;
  currentUser?: SyntheticOktaUserFixture | undefined;
}): SyntheticOktaUserFixture {
  const { givenName, familyName } = splitSyntheticDisplayName(
    input.existing.display_name,
  );

  return {
    externalId:
      input.currentUser?.externalId ??
      `synthetic-okta-user-${input.existing.person_id}`,
    employeeNumber: input.employmentCode,
    email:
      input.currentUser?.email ?? `${input.existing.person_id}@example.invalid`,
    displayName: input.existing.display_name,
    givenName,
    familyName,
    status: input.currentUser?.status ?? "active",
    departmentCode: input.payload.targetAssignment.departmentReference,
    managerExternalId: input.payload.targetAssignment.managerReference,
    effectiveAt: input.effectiveAt,
  };
}

function buildMvpBTransferOktaGroupKeys(
  payload: TransferTransactionRequestPayload,
): string[] {
  return [
    `DEPT-${payload.targetAssignment.departmentReference}`,
    `ORG-${payload.targetAssignment.organizationReference}`,
  ];
}

function toOktaTransferProfileProjectionStatus(
  result: OktaMasteringProjectionResult,
): OktaTransferProfileProjectionStatus {
  switch (result.outcome) {
    case "success":
      return "projected";
    case "retryable_failure":
      return "retryable_failure";
    case "permanent_failure":
      return "failed";
    case "skipped":
      return "skipped";
  }
}

function toOktaTransferGroupProjectionStatus(
  result: OktaGroupProjectionResult,
): OktaTransferGroupProjectionStatus {
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

function splitSyntheticDisplayName(displayName: string): {
  givenName: string;
  familyName: string;
} {
  const parts = displayName.trim().split(/\s+/u);
  const givenName = parts[0] ?? displayName;
  const familyName = parts.slice(1).join(" ") || givenName;

  return { givenName, familyName };
}
