import { assertMvpAOnboardingEvidenceAuthorizationGate } from "./mvp-a-onboarding-evidence-authorization.js";
import { assertMvpAOnboardingNonProductionDataGate } from "./mvp-a-onboarding-non-production-data-gate.js";
import { assertMvpAOnboardingPiiExportGate } from "./mvp-a-onboarding-pii-export-gate.js";
import type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-types.js";

export function collectGateFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  for (const [subject, check] of [
    [
      inputs.piiExportGate.gateId,
      () => assertMvpAOnboardingPiiExportGate(inputs.piiExportGate),
    ],
    [
      inputs.evidenceAuthorizationGate.gateId,
      () =>
        assertMvpAOnboardingEvidenceAuthorizationGate(
          inputs.evidenceAuthorizationGate,
        ),
    ],
    [
      inputs.nonProductionDataGate.gateId,
      () =>
        assertMvpAOnboardingNonProductionDataGate(inputs.nonProductionDataGate),
    ],
  ] as const) {
    try {
      check();
    } catch (error) {
      findings.push({
        surface: "gate",
        path: "src",
        subject,
        message: getErrorMessage(error),
      });
    }
  }

  return findings;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
