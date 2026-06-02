import { OnboardingTransactionRequestValidationError } from "./onboarding-transaction-request-error.js";

export function requireTerminationTenantEnvironmentId(
  name: string,
  value: unknown,
): "repo_owned_synthetic_mvp_c_termination" {
  if (value !== "repo_owned_synthetic_mvp_c_termination") {
    throw new OnboardingTransactionRequestValidationError(
      `${name} must be repo_owned_synthetic_mvp_c_termination`,
    );
  }

  return value;
}
