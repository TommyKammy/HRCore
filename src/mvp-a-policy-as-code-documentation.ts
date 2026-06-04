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
  "(?:Author|Independent\\s+approver|Approver|Independent\\s+counter-approver|Counter-approver|Time-locked\\s+review\\s+window)";
const affectedReadinessGateAliasLabels = affectedReadinessGateClaims
  .flatMap((gate) => gate.aliases)
  .sort((left, right) => right.length - left.length)
  .map((alias) => {
    const suffixBoundary = alias.startsWith("#")
      ? `(?!\\d)`
      : `(?![\\p{L}\\p{N}_-])`;
    return `${escapeRegExp(alias)}${suffixBoundary}`;
  })
  .join("|");

const requiredNonProductionDocumentationPaths = [
  "README.md",
  "docs/mvp-a-onboarding-non-production-data-gate.md",
] as const;

const p2xBoundedPracticalUseArtifactPaths = [
  "docs/p2x-01-next-wave-recommendation-closeout.md",
  "docs/p2x-hr-practical-use-gap-assessment.md",
  "docs/p2x-local-bounded-operator-runbook.md",
  "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
  "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
  "docs/p2x-synthetic-test-data-governance.md",
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
  findings.push(...collectP2XBoundedPracticalUseArtifactFindings(inputs));

  return findings;
}

function collectP2XBoundedPracticalUseArtifactFindings(
  inputs: MvpAPolicyAsCodeInputs,
): MvpAPolicyAsCodeFinding[] {
  const findings: MvpAPolicyAsCodeFinding[] = [];

  for (const path of p2xBoundedPracticalUseArtifactPaths) {
    const text = inputs.documentationTextByPath.get(path);
    if (text === undefined) {
      findings.push({
        surface: "documentation",
        path,
        subject: "P2X bounded practical-use artifact",
        message:
          "P2X bounded practical-use artifact must be scanned by policy-as-code",
      });
      continue;
    }

    for (const rawSegment of splitClaimSegments(text)) {
      for (const {
        subject,
        claimSegment,
      } of p2xBoundedPracticalUseArtifactOverclaimClaims(rawSegment)) {
        if (
          isP2XBoundedPracticalUseArtifactClaimBlocked(claimSegment, subject)
        ) {
          continue;
        }

        findings.push({
          surface: "documentation",
          path,
          subject,
          message:
            "P2X bounded practical-use artifacts must not claim stronger readiness or prohibited production/data surfaces",
        });
      }
    }
  }

  return findings;
}

function isP2XBoundedPracticalUseArtifactClaimBlocked(
  segment: string,
  subject: string,
): boolean {
  const subjectPattern = p2xBlockedSubjectPatterns.find(
    ([blockedSubject]) => blockedSubject === subject,
  )?.[1];
  if (subjectPattern === undefined) {
    return false;
  }

  const claimText = stripReviewMetadata(segment);
  const subjectSource = subjectPattern.source;
  const sameClauseBlockerBeforeSubject = new RegExp(
    `\\b(?:No|not|must\\s+not|does\\s+not|do\\s+not|requires?\\s+(?:a\\s+later\\s+)?Accepted|before\\s+Accepted|required\\s+before\\s+Accepted)\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,180}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const noListBlockerBeforeSubject = new RegExp(
    `\\bNo\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const doNotUseListBlockerBeforeSubject = new RegExp(
    `\\b(?:do\\s+not\\s+use|must\\s+not\\s+use|does\\s+not\\s+(?:require|introduce|approve|accept)|not\\s+(?:require|introduce|approve|accept))\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const sameClauseBlockedShapeBeforeSubject = new RegExp(
    `\\b(?:Blocked(?:\\s+shape)?|Generic\\s+production\\s+acceptance)\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,500}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const blockedShapeBeforeSubject = new RegExp(
    `\\b(?:Blocked(?:\\s+shape)?|Generic\\s+production\\s+acceptance)\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const sameClauseCannotClaimBeforeSubject = new RegExp(
    `\\b(?:cannot|can't)\\s+claim\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,500}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const cannotClaimListBlockerBeforeSubject = new RegExp(
    `\\b(?:cannot|can't)\\s+claim\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
    "iu",
  );
  const subjectBeforeBlocker = new RegExp(
    `\\b(?:${subjectSource})\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,180}\\b(?:Blocked|blocked|deferred|not\\s+accepted|not\\s+approved|not\\s+enabled|not\\s+allowed|not\\s+ready|remain(?:s)?\\s+blocked|requires?\\s+(?:a\\s+later\\s+)?Accepted|required\\s+before\\s+Accepted|before\\s+Accepted)\\b`,
    "iu",
  );

  if (
    sameClauseBlockerBeforeSubject.test(claimText) ||
    sameClauseBlockedShapeBeforeSubject.test(claimText) ||
    sameClauseCannotClaimBeforeSubject.test(claimText) ||
    subjectBeforeBlocker.test(claimText)
  ) {
    return true;
  }

  if (hasAffirmativeStatusAttachedToSubject(claimText, subjectPattern)) {
    return false;
  }

  return (
    noListBlockerBeforeSubject.test(claimText) ||
    doNotUseListBlockerBeforeSubject.test(claimText) ||
    blockedShapeBeforeSubject.test(claimText) ||
    cannotClaimListBlockerBeforeSubject.test(claimText)
  );
}

function hasAffirmativeStatusAttachedToSubject(
  segment: string,
  subjectPattern: RegExp,
): boolean {
  const globalSubjectPattern = new RegExp(subjectPattern.source, "giu");
  for (const match of segment.matchAll(globalSubjectPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const subjectStartIndex = match.index;
    const subjectEndIndex = subjectStartIndex + match[0].length;
    const previousBreakIndex = Math.max(
      segment.lastIndexOf(",", subjectStartIndex),
      segment.lastIndexOf("|", subjectStartIndex),
      segment.lastIndexOf(";", subjectStartIndex),
      segment.lastIndexOf(".", subjectStartIndex),
    );
    const nextBreakIndexes = [",", "|", ";", "."]
      .map((breakChar) => segment.indexOf(breakChar, subjectEndIndex))
      .filter((index) => index !== -1);
    const nextBreakIndex =
      nextBreakIndexes.length === 0
        ? segment.length
        : Math.min(...nextBreakIndexes);
    const subjectPrefix = segment.slice(
      previousBreakIndex + 1,
      subjectStartIndex,
    );
    const subjectSuffix = segment.slice(subjectEndIndex, nextBreakIndex);

    if (hasAffirmativeStatusSuffix(subjectSuffix)) {
      return true;
    }

    if (hasAffirmativeStatusPrefix(subjectPrefix)) {
      return true;
    }
  }

  return false;
}

function hasAffirmativeStatusSuffix(value: string): boolean {
  return /^\s*(?:access\s+)?(?::\s*)?(?:(?:is|are|has\s+been|can\s+be)\s+)?(?:(?:Go|Accepted|Yes|ready|allowed|approved|enabled|available)\b|(?:processing|complete)\s*$)/iu.test(
    value,
  );
}

function hasAffirmativeStatusPrefix(value: string): boolean {
  return /\b(?:Go|Accepted|Yes|ready|allowed|approved|enabled|available|processing|complete)\s*:?\s*$/iu.test(
    value,
  );
}

function p2xBoundedPracticalUseArtifactOverclaimClaims(
  segment: string,
): Array<{ subject: string; claimSegment: string }> {
  const claimSegments = p2xClaimSegmentsForSurfaceStatus(segment);
  const prohibitedClaims: Array<[string, RegExp]> = [
    [
      "HR practical-use readiness",
      /\bHR\s+practical-use(?:\s+|-)ready\b\s*(?::\s*)?(?:Go|Accepted|Yes|ready|allowed|approved|enabled)?\b|\bHR\s+practical-use(?:\s+|-)readiness\b\s*(?::\s*|\s+(?:is\s+)?)?(?:Go|Accepted|Yes|ready|allowed|approved|enabled)\b|\bpractical-use\s+readiness\b\s*(?::\s*|\s+(?:is\s+)?)?(?:Go|Accepted|Yes|ready|allowed|approved|enabled)\b|\bready\s+for\s+HR\s+practical-use\b/iu,
    ],
    [
      "production-like readiness",
      /\bproduction-like(?:\s+|-)ready\b\s*(?::\s*)?(?:Go|Accepted|Yes|ready|allowed|approved|enabled)?\b|\bproduction-like(?:\s+|-)readiness\b\s*(?::\s*|\s+(?:is\s+)?)?(?:Go|Accepted|Yes|ready|allowed|approved|enabled)\b/iu,
    ],
    [
      "real employee data readiness",
      /\b(?:real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|go|enabled|available|process(?:es|ing)|uses?)\b[^.;]{0,60}\b(?:real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data)\b/iu,
    ],
    [
      "live IdP/Okta readiness",
      /\blive[-\s]+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\blive[-\s]+tenant[-\s]+(?:data|export)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\blive[-\s]+(?:IdP|Okta|provider|tenant[-\s]+(?:data|export))\b/iu,
    ],
    [
      "unrestricted raw payload readiness",
      /\b(?:unrestricted\s+)?raw[-\s]+payloads?(?:\s+access)?\b(?:[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)|\s+is\s+(?:approved|allowed|enabled|ready|available))\b|\b(?:ready|approved|go|enabled|allows?|permit(?:s|ted)?|exposes?|views?)\b[^.;]{0,60}\b(?:unrestricted\s+)?raw[-\s]+payloads?(?:\s+access)?\b/iu,
    ],
    [
      "production queue/DLQ readiness",
      /\b(?:production\s+(?:scheduler\/queue\/DLQ|queue\/DLQ|queue|DLQ)|queue\/DLQ)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\b(?:production\s+(?:scheduler\/queue\/DLQ|queue\/DLQ|queue|DLQ)|queue\/DLQ)\b/iu,
    ],
    [
      "production ops readiness",
      /\bproduction\s+(?:ops|operations)(?:\s+(?:readiness|authority))?\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\bproduction\s+(?:ops|operations)(?:\s+(?:readiness|authority))?\b/iu,
    ],
    [
      "production authorization/RLS readiness",
      /\bproduction\s+authorization\/RLS\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\bproduction\s+authorization\/RLS\b/iu,
    ],
    [
      "production audit immutability readiness",
      /\bproduction\s+audit\s+immutability\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\bproduction\s+audit\s+immutability\b/iu,
    ],
    [
      "production audit/archive readiness",
      /\b(?:production\s+audit\s+(?:readiness|archive)|broad\s+audit\s+search|compliance\s+archive|WORM(?:\/Object\s+Lock)?|Object\s+Lock)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\b(?:production\s+audit\s+(?:readiness|archive)|broad\s+audit\s+search|compliance\s+archive|WORM(?:\/Object\s+Lock)?|Object\s+Lock)\b/iu,
    ],
    [
      "production backup/restore readiness",
      /\b(?:production\s+(?:backup|restore|backup\/restore|backup\s+and\s+restore)|backup\/restore\s+operation|production\s+restore\s+(?:policy|approval))\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|processing|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|processing|complete)\b[^.;]{0,60}\b(?:production\s+(?:backup|restore|backup\/restore|backup\s+and\s+restore)|backup\/restore\s+operation|production\s+restore\s+(?:policy|approval))\b/iu,
    ],
    [
      "support-console readiness",
      /\b(?:support-console\s+(?:custody|sessions?)|production\s+support\s+process|support\s+access\s+model)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\b(?:support-console\s+(?:custody|sessions?)|production\s+support\s+process|support\s+access\s+model)\b/iu,
    ],
    [
      "regulated data/credential readiness",
      /\b(?:payroll(?:\/benefit)?\s+data|payroll\s+or\s+benefit\s+data|benefit\s+data|production\s+credentials?|regulated\s+identifiers?|sensitive\s+personal\s+information)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|allowed|approved|accepted|go|enabled|available|process(?:es|ing)|uses?)\b[^.;]{0,60}\b(?:payroll(?:\/benefit)?\s+data|payroll\s+or\s+benefit\s+data|benefit\s+data|production\s+credentials?|regulated\s+identifiers?|sensitive\s+personal\s+information)\b/iu,
    ],
    [
      "retention/deletion runtime readiness",
      /\bretention\/deletion(?:\s+(?:runtime|jobs?|requests?))?\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\bretention\/deletion(?:\s+(?:runtime|jobs?|requests?))?\b/iu,
    ],
    [
      "broad export readiness",
      /\b(?:broad\s+(?:CSV(?:\/|\s+))?export|CSV\/export)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|go|enabled|available)\b[^.;]{0,60}\b(?:broad\s+(?:CSV(?:\/|\s+))?export|CSV\/export)\b/iu,
    ],
    [
      "legal/privacy acceptance",
      /\blegal\/privacy(?:\s+(?:acceptance|runtime))?\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\blegal\/privacy(?:\s+(?:acceptance|runtime))?\b/iu,
    ],
    [
      "two-key Accepted approval",
      /\btwo-key\b[^.;]{0,60}\b(?:Accepted|approval\s+(?:is\s+)?(?:accepted|approved|complete|ready|go)|acceptance(?:\s+(?:is\s+)?(?:accepted|approved|complete|ready|go|enabled)|\s*:\s*(?:Go|Accepted|Yes|ready|allowed|approved|enabled)))\b|\bAccepted\b[^.;]{0,60}\btwo-key\s+(?:approval|acceptance)\b/iu,
    ],
  ];

  const claimsBySubject = new Map<string, string>();
  for (const claimSegment of claimSegments) {
    for (const [subject, pattern] of prohibitedClaims) {
      if (pattern.test(claimSegment) && !claimsBySubject.has(subject)) {
        claimsBySubject.set(subject, claimSegment);
      }
    }

    for (const [subject, subjectPattern] of p2xBlockedSubjectPatterns) {
      if (
        subjectPattern.test(claimSegment) &&
        hasAffirmativeStatusAttachedToSubject(claimSegment, subjectPattern) &&
        !claimsBySubject.has(subject)
      ) {
        claimsBySubject.set(subject, claimSegment);
      }
    }
  }

  return [...claimsBySubject].map(([subject, claimSegment]) => ({
    subject,
    claimSegment,
  }));
}

function p2xClaimSegmentsForSurfaceStatus(segment: string): string[] {
  if (!isTableRowSegment(segment)) {
    return [normalizeP2XClaimSegmentForSurfaceStatus(segment)];
  }

  const cells = parseMarkdownTableCells(segment).filter(
    (cell) => cell.length > 0,
  );
  const claimSegments = [...cells];
  for (const statusCell of cells) {
    if (!isSimpleP2XAffirmativeStatusCell(statusCell)) {
      continue;
    }
    for (const subjectCell of cells) {
      if (
        subjectCell === statusCell ||
        isSimpleP2XAffirmativeStatusCell(subjectCell)
      ) {
        continue;
      }
      claimSegments.push(`${subjectCell} ${statusCell}`);
    }
  }

  return claimSegments.map(normalizeP2XClaimSegmentForSurfaceStatus);
}

function isSimpleP2XAffirmativeStatusCell(cell: string): boolean {
  return /^(?:Go|Accepted|Yes|ready|allowed|approved|enabled|available|processing|complete)$/iu.test(
    cell.replace(/\s+/gu, " ").trim(),
  );
}

function normalizeP2XClaimSegmentForSurfaceStatus(segment: string): string {
  return segment.replace(/\s+/gu, " ").trim();
}

const p2xBlockedSubjectPatterns: Array<[string, RegExp]> = [
  [
    "HR practical-use readiness",
    /HR\s+practical-use(?:\s+|-)read(?:y|iness)|practical-use\s+readiness|ready\s+for\s+HR\s+practical-use/iu,
  ],
  [
    "production-like readiness",
    /production-like(?:\s+|-)read(?:y|iness)|production-like\s+readiness\s+surface/iu,
  ],
  [
    "real employee data readiness",
    /real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data/iu,
  ],
  [
    "live IdP/Okta readiness",
    /live[-\s]+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?|live[-\s]+IdP\/Okta|live[-\s]+tenant[-\s]+(?:data|export)/iu,
  ],
  [
    "unrestricted raw payload readiness",
    /(?:unrestricted\s+)?raw[-\s]+payloads?/iu,
  ],
  [
    "production queue/DLQ readiness",
    /production\s+(?:queue\/DLQ|queue|DLQ)|production\s+scheduler\/queue\/DLQ|queue\/DLQ/iu,
  ],
  [
    "production ops readiness",
    /production\s+(?:ops|operations)(?:\s+(?:readiness|authority))?/iu,
  ],
  [
    "production authorization/RLS readiness",
    /production\s+authorization\/RLS/iu,
  ],
  [
    "production audit immutability readiness",
    /production\s+audit\s+immutability/iu,
  ],
  [
    "production audit/archive readiness",
    /production\s+audit\s+(?:readiness|archive)|broad\s+audit\s+search|compliance\s+archive|WORM(?:\/Object\s+Lock)?|Object\s+Lock/iu,
  ],
  [
    "production backup/restore readiness",
    /production\s+(?:backup|restore|backup\/restore|backup\s+and\s+restore)|backup\/restore\s+operation|production\s+restore\s+(?:policy|approval)/iu,
  ],
  [
    "support-console readiness",
    /support-console\s+(?:custody|sessions?)|production\s+support\s+process|support\s+access\s+model/iu,
  ],
  [
    "regulated data/credential readiness",
    /payroll(?:\/benefit)?\s+data|payroll\s+or\s+benefit\s+data|benefit\s+data|production\s+credentials?|regulated\s+identifiers?|sensitive\s+personal\s+information/iu,
  ],
  [
    "retention/deletion runtime readiness",
    /retention\/deletion(?:\s+runtime)?/iu,
  ],
  ["broad export readiness", /broad\s+(?:CSV(?:\/|\s+))?export|CSV\/export/iu],
  [
    "legal/privacy acceptance",
    /legal\/privacy(?:\s+(?:acceptance|runtime))?/iu,
  ],
  [
    "two-key Accepted approval",
    /two-key(?:\s+Accepted(?:\s+claim)?|\b[^|.;]{0,80}\b(?:approval|acceptance|Accepted))/iu,
  ],
];

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
      const claimSegment = stripReviewMetadata(segment);
      if (!hasAffectedReadinessOverclaim(claimSegment)) {
        continue;
      }

      for (const gate of affectedReadinessGateClaims) {
        const gateIsMentioned = hasClaimGateMention(segment, gate.aliases);
        const rawGateClaimSegments = gateIsMentioned
          ? getGateScopedClaimSegments(segment, gate)
          : [segment];
        for (const rawGateClaimSegment of rawGateClaimSegments) {
          const gateClaimSegment = stripReviewMetadata(rawGateClaimSegment);
          const claimBelongsToDocumentGate =
            documentGate?.subject === gate.subject &&
            hasDocumentScopedReadinessOverclaim(claimSegment);
          const gateHasOverclaim =
            gateIsMentioned && hasAffectedReadinessOverclaim(gateClaimSegment);
          if (!claimBelongsToDocumentGate && !gateHasOverclaim) {
            continue;
          }

          const claimHasIndependentApproval =
            gateHasOverclaim &&
            hasDocumentedIndependentReadinessApproval(rawGateClaimSegment);
          if (
            isExplicitlyBlockedOrDeferred(rawGateClaimSegment) ||
            claimHasIndependentApproval ||
            (documentGate?.subject === gate.subject &&
              documentHasIndependentApproval)
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
  return aliases.some((alias) => findAliasIndex(segment, alias) !== -1);
}

function hasClaimGateMention(
  segment: string,
  aliases: readonly string[],
): boolean {
  return findAliasIndexes(segment, aliases).some(
    (index) => !isDependencyGateMention(segment, index),
  );
}

function findAliasIndex(segment: string, alias: string): number {
  const aliasPattern = escapeRegExp(alias);
  const suffixBoundary = alias.startsWith("#")
    ? `(?!\\d)`
    : `(?![\\p{L}\\p{N}_-])`;
  const match = new RegExp(
    `(^|[^\\p{L}\\p{N}_-])(${aliasPattern})${suffixBoundary}`,
    "iu",
  ).exec(segment);

  if (match === null) {
    return -1;
  }

  return match.index + match[1].length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function splitClaimSegments(text: string): string[] {
  const segments: string[] = [];
  let pendingProseLines: string[] = [];
  let currentGateHeading: { level: number; text: string } | undefined =
    undefined;
  let currentTableHeaderCells: string[] | undefined = undefined;
  let fencedCodeBlockMarker: "`" | "~" | undefined = undefined;

  const flushPendingProse = (): void => {
    if (pendingProseLines.length === 0) {
      return;
    }

    const normalizedProse = pendingProseLines
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    pendingProseLines = [];
    if (normalizedProse.length === 0) {
      return;
    }

    const proseSegments = normalizedProse
      .split(/(?<!\b\d)\.(?=\s+|$)/u)
      .map((segment) => segment.replace(/\s+/gu, " ").trim())
      .filter((segment) => segment.length > 0);
    let pendingGateSentenceContext: string | undefined = undefined;
    for (const proseSegment of proseSegments) {
      let contextualSegment = applyCurrentGateHeadingContext(
        proseSegment,
        currentGateHeading?.text,
      );
      const segmentMentionsAffectedGate = affectedReadinessGateClaims.some(
        (gate) => mentionsAffectedGate(contextualSegment, gate.aliases),
      );
      if (
        pendingGateSentenceContext !== undefined &&
        !segmentMentionsAffectedGate &&
        isStatusOrReadinessSegment(contextualSegment)
      ) {
        contextualSegment = `${pendingGateSentenceContext} ${contextualSegment}`;
        pendingGateSentenceContext = undefined;
      } else {
        pendingGateSentenceContext =
          segmentMentionsAffectedGate &&
          !isStatusOrReadinessSegment(contextualSegment)
            ? contextualSegment
            : undefined;
      }

      segments.push(contextualSegment);
    }
  };

  for (const line of text.split(/\r?\n/u)) {
    const normalizedLine = line.replace(/\s+/gu, " ").trim();
    const fenceMarkerMatch = /^(`{3,}|~{3,})/u.exec(line.trimStart());
    if (fencedCodeBlockMarker !== undefined) {
      if (fenceMarkerMatch?.[1].startsWith(fencedCodeBlockMarker)) {
        fencedCodeBlockMarker = undefined;
      }
      continue;
    }

    if (fenceMarkerMatch !== null) {
      flushPendingProse();
      currentTableHeaderCells = undefined;
      fencedCodeBlockMarker = fenceMarkerMatch[1].startsWith("`") ? "`" : "~";
      continue;
    }

    if (normalizedLine.length === 0) {
      flushPendingProse();
      currentTableHeaderCells = undefined;
      continue;
    }

    if (normalizedLine.includes("|")) {
      flushPendingProse();
      const tableCells = parseMarkdownTableCells(normalizedLine);
      if (isMarkdownTableSeparatorRow(tableCells)) {
        continue;
      }

      const tableSegment =
        currentTableHeaderCells === undefined
          ? normalizedLine
          : applyDependencyHeaderContextToTableRow(
              tableCells,
              currentTableHeaderCells,
            );
      segments.push(
        applyCurrentGateHeadingContext(tableSegment, currentGateHeading?.text),
      );
      currentTableHeaderCells ??= tableCells;
      continue;
    }

    currentTableHeaderCells = undefined;

    const headingMatch = /^(#{1,6})\s+/u.exec(normalizedLine);
    if (headingMatch !== null) {
      flushPendingProse();
      const headingLevel = headingMatch[1].length;
      const headingMentionsAffectedGate = affectedReadinessGateClaims.some(
        (gate) => mentionsAffectedGate(normalizedLine, gate.aliases),
      );
      if (headingMentionsAffectedGate) {
        currentGateHeading = { level: headingLevel, text: normalizedLine };
      } else if (
        currentGateHeading !== undefined &&
        headingLevel <= currentGateHeading.level
      ) {
        currentGateHeading = undefined;
      }
      segments.push(normalizedLine);
      continue;
    }

    if (/^(?:[-*+]\s+|\d+\.\s+)/u.test(normalizedLine)) {
      flushPendingProse();
    }

    pendingProseLines.push(normalizedLine);
  }

  flushPendingProse();

  return segments;
}

function parseMarkdownTableCells(line: string): string[] {
  const trimmedLine = line.trim();
  const content =
    trimmedLine.startsWith("|") && trimmedLine.endsWith("|")
      ? trimmedLine.slice(1, -1)
      : trimmedLine;
  return content.split("|").map((cell) => cell.replace(/\s+/gu, " ").trim());
}

function isMarkdownTableSeparatorRow(cells: readonly string[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, "")))
  );
}

function applyDependencyHeaderContextToTableRow(
  cells: readonly string[],
  headerCells: readonly string[],
): string {
  const labeledCells = cells.map((cell, index) => {
    const headerCell = headerCells[index] ?? "";
    if (!isDependencyHeaderCell(headerCell) || cell.length === 0) {
      return cell;
    }

    return `dependency: ${cell}`;
  });

  return `| ${labeledCells.join(" | ")} |`;
}

function isDependencyHeaderCell(headerCell: string): boolean {
  return /\b(?:dependencies|dependency|depends?\s+on|blocked\s+by|requires?|prerequisites?)\b/iu.test(
    headerCell,
  );
}

function applyCurrentGateHeadingContext(
  segment: string,
  currentGateHeading: string | undefined,
): string {
  if (
    currentGateHeading === undefined ||
    segment.length === 0 ||
    affectedReadinessGateClaims.some((gate) =>
      mentionsAffectedGate(segment, gate.aliases),
    ) ||
    !isStatusOrReadinessSegment(segment)
  ) {
    return segment;
  }

  return `${currentGateHeading} ${segment}`;
}

function isStatusOrReadinessSegment(segment: string): boolean {
  return (
    hasAcceptedStatusClaim(segment) ||
    hasProductionLikeReadinessOverclaim(segment)
  );
}

function getGateScopedClaimSegments(
  segment: string,
  gate: (typeof affectedReadinessGateClaims)[number],
): string[] {
  if (isTableRowSegment(segment)) {
    return getGateScopedTableClaimSegments(segment, gate);
  }

  const gatePositions = findAliasIndexes(segment, gate.aliases).filter(
    (gatePosition) => !isDependencyGateMention(segment, gatePosition),
  );
  const otherAffectedGatePositions = findOtherAffectedGateAliasIndexes(
    segment,
    gate,
  );
  const scopedSegments = gatePositions
    .map((gatePosition) => {
      const nextGatePosition = otherAffectedGatePositions.find(
        (affectedGatePosition) =>
          affectedGatePosition > gatePosition &&
          !isDependencyGateMention(segment, affectedGatePosition),
      );
      const gateScopedSegment = segment
        .slice(gatePosition, nextGatePosition)
        .trim();
      if (
        nextGatePosition === undefined ||
        hasAffectedReadinessOverclaim(stripReviewMetadata(gateScopedSegment))
      ) {
        return gateScopedSegment;
      }

      const hardBreakAfterGate = findNextHardClaimBreak(segment, gatePosition);
      const sharedClaimSegment = segment
        .slice(gatePosition, hardBreakAfterGate)
        .trim();
      return hasAffectedReadinessOverclaim(
        stripReviewMetadata(sharedClaimSegment),
      )
        ? sharedClaimSegment
        : gateScopedSegment;
    })
    .filter((scopedSegment) => scopedSegment.length > 0);
  return scopedSegments.length === 0 ? [segment] : scopedSegments;
}

function getGateScopedTableClaimSegments(
  segment: string,
  gate: (typeof affectedReadinessGateClaims)[number],
): string[] {
  const cells = parseMarkdownTableCells(segment);
  const gateCellIndexes = findAffectedGateTableCellIndexes(cells);
  const matchingGateCellIndexes = gateCellIndexes
    .filter(({ affectedGate }) => affectedGate.subject === gate.subject)
    .map(({ index }) => index);

  const scopedSegments = matchingGateCellIndexes
    .map((gateCellIndex) =>
      getGateScopedTableCells(
        cells,
        gateCellIndexes.map(({ index }) => index),
        gateCellIndex,
      ),
    )
    .map((scopedCells) => `| ${scopedCells.join(" | ")} |`)
    .filter((scopedSegment) => scopedSegment.length > 0);

  return scopedSegments.length === 0 ? [segment] : scopedSegments;
}

function findAffectedGateTableCellIndexes(cells: readonly string[]): {
  affectedGate: (typeof affectedReadinessGateClaims)[number];
  index: number;
}[] {
  return cells.flatMap((cell, index) =>
    affectedReadinessGateClaims
      .filter((gate) => hasClaimGateMention(cell, gate.aliases))
      .map((affectedGate) => ({ affectedGate, index })),
  );
}

function getGateScopedTableCells(
  cells: readonly string[],
  gateCellIndexes: readonly number[],
  gateCellIndex: number,
): string[] {
  const uniqueGateCellIndexes = Array.from(new Set(gateCellIndexes)).sort(
    (left, right) => left - right,
  );
  let gateClusterStart = gateCellIndex;
  while (uniqueGateCellIndexes.includes(gateClusterStart - 1)) {
    gateClusterStart -= 1;
  }

  let gateClusterEnd = gateCellIndex;
  while (uniqueGateCellIndexes.includes(gateClusterEnd + 1)) {
    gateClusterEnd += 1;
  }

  const previousGateCellIndex = uniqueGateCellIndexes
    .filter((index) => index < gateClusterStart)
    .at(-1);
  const nextGateCellIndex = uniqueGateCellIndexes.find(
    (index) => index > gateClusterEnd,
  );
  const scopedStart = previousGateCellIndex === undefined ? 0 : gateCellIndex;
  const scopedEnd = nextGateCellIndex ?? cells.length;

  return cells
    .slice(scopedStart, scopedEnd)
    .map((cell) => cell.replace(/\s+/gu, " ").trim())
    .filter((cell) => cell.length > 0);
}

function findNextHardClaimBreak(segment: string, startIndex: number): number {
  const nextBreakIndex = segment.slice(startIndex).search(/[.;]/u);
  return nextBreakIndex === -1 ? segment.length : startIndex + nextBreakIndex;
}

function isTableRowSegment(segment: string): boolean {
  return parseMarkdownTableCells(segment).length > 1;
}

function findOtherAffectedGateAliasIndexes(
  segment: string,
  gate: (typeof affectedReadinessGateClaims)[number],
): number[] {
  return Array.from(
    new Set(
      affectedReadinessGateClaims
        .filter((affectedGate) => affectedGate.subject !== gate.subject)
        .flatMap((affectedGate) =>
          findAliasIndexes(segment, affectedGate.aliases),
        ),
    ),
  ).sort((left, right) => left - right);
}

function isDependencyGateMention(
  segment: string,
  gatePosition: number,
): boolean {
  const prefix = segment.slice(Math.max(0, gatePosition - 40), gatePosition);
  return /\b(?:depends?\s+on|dependency\s*:|dependency|blocked\s+by|requires?)\s+$/iu.test(
    prefix,
  );
}

function findAliasIndexes(
  segment: string,
  aliases: readonly string[],
): number[] {
  return Array.from(
    new Set(
      aliases
        .flatMap((alias) => findAllAliasIndexes(segment, alias))
        .filter((index) => index !== -1),
    ),
  ).sort((left, right) => left - right);
}

function findAllAliasIndexes(segment: string, alias: string): number[] {
  const indexes: number[] = [];
  let searchStart = 0;
  while (searchStart < segment.length) {
    const index = findAliasIndex(segment.slice(searchStart), alias);
    if (index === -1) {
      break;
    }

    const absoluteIndex = searchStart + index;
    indexes.push(absoluteIndex);
    searchStart = absoluteIndex + alias.length;
  }

  return indexes;
}

function stripReviewMetadata(segment: string): string {
  const metadataPattern = new RegExp(
    `\\b${reviewMetadataLabels}:\\s*.*?(?=\\s*(?:[,;]\\s*)?(?:${reviewMetadataLabels}:|${affectedReadinessGateAliasLabels})|[|;\\r\\n]|$)`,
    "giu",
  );
  return segment.replace(metadataPattern, "");
}

function hasAffectedReadinessOverclaim(segment: string): boolean {
  return (
    hasAcceptedStatusClaim(segment) ||
    hasAcceptedReadinessClaim(segment) ||
    hasProductionLikeReadinessOverclaim(segment)
  );
}

function hasDocumentScopedReadinessOverclaim(segment: string): boolean {
  return (
    hasAcceptedStatusClaim(segment) ||
    hasProductionLikeReadinessOverclaim(segment)
  );
}

function hasAcceptedStatusClaim(segment: string): boolean {
  const normalizedSegment = segment
    .replace(/\*/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return (
    /^(?:[-+]|\d+\.)?\s*Accepted\b/iu.test(normalizedSegment) ||
    /^Status\s*:\s*Accepted\b/iu.test(normalizedSegment) ||
    /^\|?\s*Status\s*\|\s*Accepted\b/iu.test(normalizedSegment)
  );
}

function hasProductionLikeReadinessOverclaim(segment: string): boolean {
  return (
    /\bready\s+for\s+production-like\s+use\b/iu.test(segment) ||
    /\bproduction-like(?:\s+|-)ready\b/iu.test(segment) ||
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
  const claimText = stripReviewMetadata(segment);
  if (hasBareReadinessTableCell(claimText)) {
    return false;
  }
  if (hasUnblockedReadinessOverclaim(claimText)) {
    return false;
  }
  return /(?:not be described as|not accepted|not yet accepted|no accepted|not production-like(?:\s+|-)ready|not yet production-like(?:\s+|-)ready|no production-like(?:\s+|-)ready|has not been accepted|have not been accepted|is not accepted|are not accepted|remain(?:s)? Proposed|remain(?:s)? blocked|stays? blocked|blocked for|No-go until|#\d+-class [^|]+ follow-up|before accepted|required before accepted|requires? a later accepted|requires? (?:an? )?accepted [^|.]+ before|until a later accepted|later accepted two-key|\b(?:cannot|do not|does not|must not)\b[^|.]{0,80}\b(?:describe|claim|treat|mark|count|classify|approve|be described as|be treated as)\b[^|.]{0,80}\b(?:accepted|production-like(?:\s+|-)ready|production-like readiness))/iu.test(
    claimText,
  );
}

function hasUnblockedReadinessOverclaim(segment: string): boolean {
  return (
    hasUnblockedAcceptedReadinessOccurrence(segment) ||
    hasUnblockedReadinessOccurrence(
      segment,
      /\bproduction-like(?:\s+|-)ready\b/giu,
    )
  );
}

function hasUnblockedAcceptedReadinessOccurrence(segment: string): boolean {
  const normalizedSegment = normalizeAcceptedReadinessClaimText(segment);
  for (const match of normalizedSegment.matchAll(/\baccepted\b/giu)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }

    if (
      isAcceptedReadinessClaimShape(
        normalizedSegment,
        index,
        match[0].length,
      ) &&
      !isReadinessOccurrenceBlocked(normalizedSegment.slice(0, index))
    ) {
      return true;
    }
  }

  return false;
}

function hasAcceptedReadinessClaim(segment: string): boolean {
  const normalizedSegment = normalizeAcceptedReadinessClaimText(segment);
  for (const match of normalizedSegment.matchAll(/\baccepted\b/giu)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }

    if (
      isAcceptedReadinessClaimShape(normalizedSegment, index, match[0].length)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeAcceptedReadinessClaimText(segment: string): string {
  return segment.replace(/\*/gu, "");
}

function isAcceptedReadinessClaimShape(
  segment: string,
  index: number,
  length: number,
): boolean {
  const prefix = segment.slice(Math.max(0, index - 40), index);
  const suffix = segment.slice(index + length, index + length + 40);
  return (
    /(?:^|[\s|:])(?:is|are|be|been|become|treated\s+as|described\s+as|marked\s+as|classified\s+as|Status\s*:?)?\s*$/iu.test(
      prefix,
    ) && /^(?:\s*(?:[|.;,]|$)|\s+(?:with|for)\b)/iu.test(suffix)
  );
}

function hasUnblockedReadinessOccurrence(
  segment: string,
  pattern: RegExp,
): boolean {
  for (const match of segment.matchAll(pattern)) {
    const index = match.index;
    if (index === undefined) {
      continue;
    }

    if (!isReadinessOccurrenceBlocked(segment.slice(0, index))) {
      return true;
    }
  }

  return false;
}

function isReadinessOccurrenceBlocked(prefix: string): boolean {
  const localPrefix =
    prefix
      .split(/\b(?:but|however)\b|[.;]/iu)
      .at(-1)
      ?.replace(/\s+/gu, " ")
      .trim() ?? "";
  return /(?:\b(?:not|no|without|pending|incomplete|uncompleted|before|until|later)\b|\b(?:required|requires?|blocked|no-go)\b[^|]{0,40}\b(?:before|until|for)?|\b(?:cannot|do not|does not|must not|has not been|have not been|is not|are not)\b)[^|]{0,80}$/iu.test(
    localPrefix,
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
  const authorValues = readReviewMetadataValues(text, ["Author"]);
  const approverValues = readReviewMetadataValues(text, [
    "Independent\\s+approver",
    "Approver",
  ]);
  const counterApproverValues = readReviewMetadataValues(text, [
    "Independent\\s+counter-approver",
    "Counter-approver",
  ]);
  const reviewWindowValues = readReviewMetadataValues(text, [
    "Time-locked\\s+review\\s+window",
  ]);

  const concreteAuthors = authorValues.filter(hasConcreteReviewMetadataValue);
  const concreteApprovers = approverValues.filter(
    hasConcreteReviewMetadataValue,
  );
  const concreteCounterApprovers = counterApproverValues.filter(
    hasConcreteReviewMetadataValue,
  );
  const completedReviewWindows = reviewWindowValues.filter(
    hasCompletedReviewWindow,
  );

  return concreteApprovers.some((approver) =>
    concreteCounterApprovers.some(
      (counterApprover) =>
        !sameReviewMetadataValue(approver, counterApprover) &&
        completedReviewWindows.length > 0 &&
        (authorValues.length === 0 ||
          concreteAuthors.some(
            (author) =>
              !sameReviewMetadataValue(author, approver) &&
              !sameReviewMetadataValue(author, counterApprover),
          )),
    ),
  );
}

function readReviewMetadataValues(
  text: string,
  labels: readonly string[],
): string[] {
  const labelPattern = labels.join("|");
  const metadataValuePattern = new RegExp(
    `(?:^|[|;,\\r\\n])\\s*(?:[-*]\\s+)?(?:${labelPattern}):\\s*(.*?)(?=\\s*(?:[,;]\\s*)?${reviewMetadataLabels}:|[|\\r\\n]|$)`,
    "giu",
  );
  return Array.from(text.matchAll(metadataValuePattern), (match) =>
    match[1].replace(/\s+/gu, " ").trim(),
  );
}

function hasConcreteReviewMetadataValue(value: string): boolean {
  return (
    value.length > 0 &&
    !/\b(?:Required before Accepted|No|None|TBD|TODO|placeholder|missing|absent|unavailable|unknown|unrecorded|not required|waived?|ditto)\b|not\s+recorded|\b(?:same\s+as|same\s+person|as\s+above|see\s+(?:above|approver|counter-approver|author)|refer(?:s|red)?\s+to)\b/iu.test(
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
    !/(?:\b(?:not|no|without|pending|incomplete|uncompleted)\b[^|;\n\r]{0,80}\bcompleted\b|\b(?:scheduled|planned|expected|will)\b[^|;\n\r]{0,40}\bcompleted\b|\bto\s+be\s+completed\b|\bcompleted\b[^|;\n\r]{0,40}\b(?:no|false|pending|not|required)\b)/iu.test(
      value,
    )
  );
}
