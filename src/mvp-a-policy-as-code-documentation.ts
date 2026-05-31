import type {
  MvpAPolicyAsCodeFinding,
  MvpAPolicyAsCodeInputs,
} from "./mvp-a-policy-as-code-types.js";

const affectedReadinessGateClaims = [
  {
    subject: "P0-R05 / #11",
    documentPath: "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
    aliases: [
      "P0-R05",
      "#11",
      "ADR 0011",
      "docs/adr/0011-data-scope-policy-dsl-rls-boundary.md",
    ],
  },
  {
    subject: "P0-R06 / #12",
    documentPath:
      "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
    aliases: [
      "P0-R06",
      "#12",
      "ADR 0012",
      "docs/adr/0012-audit-event-hash-chain-worm-object-lock-boundary.md",
    ],
  },
  {
    subject: "P0-R08 / #14",
    documentPath:
      "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
    aliases: [
      "P0-R08",
      "#14",
      "ADR 0014",
      "docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md",
    ],
  },
] as const;

const reviewMetadataLabels =
  "(?:Independent\\s+approver|Approver|Independent\\s+counter-approver|Counter-approver|Time-locked\\s+review\\s+window)";

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
    const documentGate = findAffectedReadinessGateForDocumentPath(path);
    const documentHasIndependentApproval =
      documentGate !== undefined &&
      hasDocumentedIndependentReadinessApproval(text);

    const claimSegments = splitClaimSegments(text);
    for (const segment of claimSegments) {
      if (!hasAffectedReadinessOverclaim(segment)) {
        continue;
      }

      for (const gate of affectedReadinessGateClaims) {
        const claimBelongsToDocumentGate =
          documentGate?.subject === gate.subject &&
          hasDocumentScopedReadinessOverclaim(segment);
        if (
          !claimBelongsToDocumentGate &&
          !mentionsAffectedGate(segment, gate.aliases)
        ) {
          continue;
        }

        if (
          isExplicitlyBlockedOrDeferred(segment) ||
          hasDocumentedIndependentReadinessApproval(segment) ||
          (claimBelongsToDocumentGate && documentHasIndependentApproval)
        ) {
          continue;
        }

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

  return findings;
}

function findAffectedReadinessGateForDocumentPath(
  path: string,
): (typeof affectedReadinessGateClaims)[number] | undefined {
  return affectedReadinessGateClaims.find((gate) => path === gate.documentPath);
}

function mentionsAffectedGate(
  segment: string,
  aliases: readonly string[],
): boolean {
  const normalizedSegment = segment.toLowerCase();
  return aliases.some((alias) =>
    normalizedSegment.includes(alias.toLowerCase()),
  );
}

function splitClaimSegments(text: string): string[] {
  const segments: string[] = [];

  for (const line of text.split(/\r?\n/u)) {
    const normalizedLine = line.replace(/\s+/gu, " ").trim();
    if (normalizedLine.length === 0) {
      continue;
    }

    if (normalizedLine.includes("|")) {
      segments.push(normalizedLine);
      continue;
    }

    segments.push(
      ...normalizedLine
        .split(/[.;]/u)
        .map((segment) => segment.replace(/\s+/gu, " ").trim())
        .filter((segment) => segment.length > 0),
    );
  }

  return segments;
}

function hasAffectedReadinessOverclaim(segment: string): boolean {
  return (
    /\baccepted\b/iu.test(segment) ||
    hasProductionLikeReadinessOverclaim(segment)
  );
}

function hasDocumentScopedReadinessOverclaim(segment: string): boolean {
  return (
    /^accepted$/iu.test(segment) || hasProductionLikeReadinessOverclaim(segment)
  );
}

function hasProductionLikeReadinessOverclaim(segment: string): boolean {
  return (
    /(?:^|\|)\s*production-like(?:\s+|-)ready\s*(?:\||$)/iu.test(segment) ||
    /\b(?:is|are|be|become|treated\s+as|described\s+as)\s+production-like(?:\s+|-)ready\b/iu.test(
      segment,
    ) ||
    /\bproduction-like(?:\s+|-)ready\s*:\s*(?:Go|Accepted|Yes)\b/iu.test(
      segment,
    ) ||
    /\bproduction-like(?:\s+|-)readiness\s*(?::\s*|\s+is\s+)(?:Go|Accepted|ready)\b/iu.test(
      segment,
    )
  );
}

function isExplicitlyBlockedOrDeferred(segment: string): boolean {
  const metadataPattern = new RegExp(
    `\\b${reviewMetadataLabels}:\\s*[^|]+`,
    "giu",
  );
  const claimText = segment.replace(metadataPattern, "");
  return /(?:must not|cannot|do not|does not|not be described as|not accepted|not yet accepted|no accepted|has not been accepted|have not been accepted|is not accepted|are not accepted|remain(?:s)? Proposed|remain(?:s)? blocked|stays? blocked|blocked for|No-go until|before accepted|required before accepted|requires? a later accepted|requires? an? accepted [^|.]+ before|accepted [^|.]{0,80} evidence|until a later accepted|later accepted two-key)/iu.test(
    claimText,
  );
}

function hasDocumentedIndependentReadinessApproval(text: string): boolean {
  const approver = readReviewMetadataValue(text, [
    "Independent\\s+approver",
    "Approver",
  ]);
  const counterApprover = readReviewMetadataValue(text, [
    "Independent\\s+counter-approver",
    "Counter-approver",
  ]);
  const reviewWindow = readReviewMetadataValue(text, [
    "Time-locked\\s+review\\s+window",
  ]);

  return (
    approver !== undefined &&
    counterApprover !== undefined &&
    reviewWindow !== undefined &&
    hasConcreteReviewMetadataValue(approver) &&
    hasConcreteReviewMetadataValue(counterApprover) &&
    !sameReviewMetadataValue(approver, counterApprover) &&
    hasCompletedReviewWindow(reviewWindow)
  );
}

function readReviewMetadataValue(
  text: string,
  labels: readonly string[],
): string | undefined {
  const labelPattern = labels.join("|");
  const metadataValuePattern = new RegExp(
    `(?:^|[|;\\r\\n])\\s*(?:[-*]\\s+)?(?:${labelPattern}):\\s*(.*?)(?=\\s*(?:;\\s*)?${reviewMetadataLabels}:|[|\\r\\n]|$)`,
    "iu",
  );
  const match = metadataValuePattern.exec(text);
  return match?.[1].replace(/\s+/gu, " ").trim();
}

function hasConcreteReviewMetadataValue(value: string): boolean {
  return (
    value.length > 0 &&
    !/\b(?:Required before Accepted|No|None|TBD|TODO|placeholder)\b/iu.test(
      value,
    )
  );
}

function sameReviewMetadataValue(left: string, right: string): boolean {
  return (
    normalizeReviewMetadataValue(left) === normalizeReviewMetadataValue(right)
  );
}

function normalizeReviewMetadataValue(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

function hasCompletedReviewWindow(value: string): boolean {
  return (
    hasConcreteReviewMetadataValue(value) &&
    /\bcompleted\b/iu.test(value) &&
    !/(?:\b(?:not|no|without|pending|incomplete|uncompleted)\b[^|;\n\r]{0,80}\bcompleted\b|\bcompleted\b[^|;\n\r]{0,40}\b(?:no|false|pending|not|required)\b)/iu.test(
      value,
    )
  );
}
