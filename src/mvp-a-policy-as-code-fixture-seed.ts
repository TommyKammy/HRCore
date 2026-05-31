import { assertMvpAOnboardingFixtureSeedText } from "./mvp-a-onboarding-non-production-data-gate.js";
import type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-types.js";

export function collectFixtureSeedFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];
  for (const [path, text] of inputs.fixtureSeedTextByPath) {
    try {
      assertMvpAOnboardingFixtureSeedText(
        inputs.nonProductionDataGate,
        path,
        text,
      );
    } catch (error) {
      findings.push({
        surface: "fixture-seed",
        path,
        subject: "fixture-seed text",
        message: getErrorMessage(error),
      });
    }
  }

  return findings;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
