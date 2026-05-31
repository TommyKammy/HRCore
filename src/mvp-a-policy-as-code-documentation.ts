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

const requiredNonProductionDocumentationPaths = [
  "README.md",
  "docs/mvp-a-onboarding-non-production-data-gate.md",
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
  const combinedRequiredDocumentation = requiredNonProductionDocumentationPaths
    .map((path) => inputs.documentationTextByPath.get(path) ?? "")
    .join("\n")
    .replace(/\s+/gu, " ")
    .trim();
  const findings: MvpAPolicyAsCodeFinding[] = [];

  for (const requiredText of requiredDocumentationText) {
    if (
      !combinedRequiredDocumentation.includes(
        requiredText.replace(/\s+/gu, " ").trim(),
      )
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

      const mentionedGates = affectedReadinessGateClaims.filter((gate) =>
        mentionsAffectedGate(segment, gate.aliases),
      );
      for (const gate of affectedReadinessGateClaims) {
        const claimBelongsToDocumentGate =
          documentGate?.subject === gate.subject &&
          hasDocumentScopedReadinessOverclaim(segment);
        if (
          !claimBelongsToDocumentGate &&
          !mentionedGates.some(
            (mentionedGate) => mentionedGate.subject === gate.subject,
          )
        ) {
          continue;
        }

        const claimHasIndependentApproval =
          mentionedGates.length === 1 &&
          mentionedGates[0].subject === gate.subject &&
          hasDocumentedIndependentReadinessApproval(segment);
        if (
          isExplicitlyBlockedOrDeferred(segment) ||
          claimHasIndependentApproval ||
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
  return aliases.some((alias) => matchesAlias(segment, alias));
}

function matchesAlias(segment: string, alias: string): boolean {
  const aliasPattern = escapeRegExp(alias);
  const suffixBoundary = alias.startsWith("#")
    ? `(?!\\d)`
    : `(?![\\p{L}\\p{N}_-])`;
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}_-])${aliasPattern}${suffixBoundary}`,
    "iu",
  ).test(segment);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
        .split(/[.]/u)
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
    /^(?:Status\s*:\s*)?Accepted\s*\.?$/iu.test(segment) ||
    /^(?:[-*]\s*)Accepted\s*\.?$/iu.test(segment) ||
    hasProductionLikeReadinessOverclaim(segment)
  );
}

function hasProductionLikeReadinessOverclaim(segment: string): boolean {
  return (
    /(?:^|[|:])\s*production-like(?:\s+|-)ready\b/iu.test(segment) ||
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
  if (hasBareReadinessTableCell(claimText)) {
    return false;
  }
  return /(?:must not|not be described as|not accepted|not yet accepted|no accepted|has not been accepted|have not been accepted|is not accepted|are not accepted|remain(?:s)? Proposed|remain(?:s)? blocked|stays? blocked|blocked for|No-go until|follow-up work|#\d+-class [^|]+ follow-up|before accepted|required before accepted|requires? a later accepted|requires? an? accepted [^|.]+ before|until a later accepted|later accepted two-key|\b(?:cannot|do not|does not)\b[^|.]{0,80}\b(?:describe|claim|treat|mark|count|classify|approve)\b[^|.]{0,80}\b(?:accepted|production-like(?:\s+|-)ready|production-like readiness))/iu.test(
    claimText,
  );
}

function hasBareReadinessTableCell(segment: string): boolean {
  if (!segment.includes("|")) {
    return false;
  }

  return segment
    .split("|")
    .map((cell) => cell.replace(/\s+/gu, " ").trim())
    .some(
      (cell) =>
        /^accepted$/iu.test(cell) ||
        /^production-like(?:\s+|-)ready(?:\s*:\s*(?:Go|Accepted|Yes))?$/iu.test(
          cell,
        ),
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
