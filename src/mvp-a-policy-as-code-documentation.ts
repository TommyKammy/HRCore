import type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-types.js";

const affectedReadinessGateClaims = [
  {
    subject: "P0-R05 / #11",
    aliases: ["P0-R05", "#11", "ADR 0011"],
  },
  {
    subject: "P0-R06 / #12",
    aliases: ["P0-R06", "#12", "ADR 0012"],
  },
  {
    subject: "P0-R08 / #14",
    aliases: ["P0-R08", "#14", "ADR 0014"],
  },
] as const;

export function collectDocumentationFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const requiredDocumentationText = [
    "mvp_a_onboarding_non_production_data_handling_v1",
    "repo_owned_synthetic_fixture",
    "approved_non_production_dataset",
    "mvp_a_onboarding_pii_export_closed_v1",
    "#202",
    "#203 legal/privacy approval evidence placeholder",
    "#203 independent data-owner approval placeholder",
    "#203 two-key approval record placeholder",
    "does not approve legal approval, privacy approval, real-data processing, production-like data processing, raw payload viewing, CSV/export, download logs, watermark/manifest behavior, My Number, Specific Personal Information, or sensitive personal information",
  ];
  const combinedDocumentation = [...inputs.documentationTextByPath.values()]
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();
  const findings: MvpAPolicyAsCodeFinding[] = [];

  for (const requiredText of requiredDocumentationText) {
    if (
      !combinedDocumentation.includes(requiredText.replace(/\s+/gu, " ").trim())
    ) {
      findings.push({
        surface: "documentation",
        path: "README.md docs/mvp-a-onboarding-non-production-data-gate.md",
        subject: requiredText,
        message:
          "MVP-A non-production data gate documentation is missing required blocker or boundary text",
      });
    }
  }

  findings.push(...collectAffectedReadinessGateFindings(inputs));

  return findings;
}

function collectAffectedReadinessGateFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];

  for (const [path, text] of inputs.documentationTextByPath) {
    if (hasDocumentedIndependentReadinessApproval(text)) {
      continue;
    }

    const claimSegments = splitClaimSegments(text);
    for (const segment of claimSegments) {
      if (isExplicitlyBlockedOrDeferred(segment)) {
        continue;
      }

      if (!hasAffectedReadinessOverclaim(segment)) {
        continue;
      }

      for (const gate of affectedReadinessGateClaims) {
        if (gate.aliases.some((alias) => segment.includes(alias))) {
          findings.push({
            surface: "documentation",
            path,
            subject: gate.subject,
            message:
              "Affected readiness gate must not be described as Accepted or production-like ready without documented independent approval",
          });
        }
      }
    }
  }

  return findings;
}

function splitClaimSegments(text: string): string[] {
  return text
    .split(/\n{2,}|\r?\n|[.;]/u)
    .map((segment) => segment.replace(/\s+/gu, " ").trim())
    .filter((segment) => segment.length > 0);
}

function hasAffectedReadinessOverclaim(segment: string): boolean {
  return (
    /\bAccepted\b/u.test(segment) ||
    /\bproduction-like\s+(?:ready|readiness\s*:\s*(?:Go|Accepted)|readiness\s+is\s+(?:Go|Accepted))\b/iu.test(
      segment,
    )
  );
}

function isExplicitlyBlockedOrDeferred(segment: string): boolean {
  return /(?:must not|cannot|do not|does not|not be described as|remain(?:s)? Proposed|remain(?:s)? blocked|stays? blocked|blocked for|follow-up work|#\d+-class [^|]+ follow-up|before Accepted|required before Accepted|requires? a later Accepted|until a later Accepted|later Accepted two-key)/iu.test(
    segment,
  );
}

function hasDocumentedIndependentReadinessApproval(text: string): boolean {
  const normalizedText = text.replace(/\s+/gu, " ").trim();
  return (
    /Independent approver:\s*(?!Required before Accepted|No\b|None\b|TBD\b|TODO\b|placeholder\b)[^.;\n]+/iu.test(
      normalizedText,
    ) &&
    /Independent counter-approver:\s*(?!Required before Accepted|No\b|None\b|TBD\b|TODO\b|placeholder\b)[^.;\n]+/iu.test(
      normalizedText,
    ) &&
    /Time-locked review window:\s*(?!Required before Accepted|No\b|None\b|TBD\b|TODO\b|placeholder\b)[^.;\n]+completed/iu.test(
      normalizedText,
    )
  );
}
