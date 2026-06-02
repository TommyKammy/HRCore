import type { OktaMasteringAdapter } from "./okta-mastering-adapter.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { readOnboardingTransactionRequestById } from "./onboarding-transaction-request-readers.js";
import {
  buildTerminationOktaProjectionEvidence,
  projectTerminationMockOktaDisable,
  projectTerminationMockOktaGroupRemoval,
  type OktaTerminationProjectionImpactEvidence,
} from "./termination-okta-projection-helpers.js";
import {
  applyApprovedTerminationTransactionRequest,
  parsePersistedTerminationApplyPayload,
  type AppliedTerminationTransactionRequestResult,
  type ApplyApprovedTerminationTransactionRequestInput,
} from "./termination-transaction-request-apply.js";

export type {
  OktaTerminationGroupProjectionStatus,
  OktaTerminationProfileProjectionStatus,
  OktaTerminationProjectionImpactEvidence,
} from "./termination-okta-projection-helpers.js";

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

  const profile = await projectTerminationMockOktaDisable({
    oktaAdapter,
    employmentCode,
    effectiveAt: input.appliedAt,
  });
  const groups = await projectTerminationMockOktaGroupRemoval({
    oktaAdapter,
    employmentCode,
    effectiveAt: input.appliedAt,
    profile,
  });

  return {
    ...applied,
    oktaProjection: buildTerminationOktaProjectionEvidence({
      transactionRequestId: applied.transactionRequestId,
      lifecycleEventId: applied.lifecycleEventId,
      applyCorrelationId: applied.correlationId,
      profile,
      groups,
    }),
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
