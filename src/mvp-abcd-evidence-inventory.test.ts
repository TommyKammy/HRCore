import assert from "node:assert/strict";
import test from "node:test";

import { readRepoFile } from "./test-helpers/database.js";

test("MVP-A/B/C/D evidence inventory preserves bounded traceability shape", async () => {
  const inventory = await readRepoFile(
    "docs/mvp-abcd-bounded-evidence-inventory.md",
  );

  for (const flow of ["MVP-A", "MVP-B", "MVP-C", "MVP-D"] as const) {
    assert.match(inventory, new RegExp(`\\|\\s*${flow}\\s*\\|`, "u"));
  }

  for (const surface of [
    "request",
    "approval",
    "apply",
    "provider mock projection",
    "writeback",
    "CSV/Ops/DLQ",
    "audit correlation",
    "closeout document",
  ] as const) {
    assert.match(inventory, new RegExp(`\\|\\s*${surface}\\s*\\|`, "u"));
  }

  assert.match(inventory, /bounded\/non-production E2E/u);
  assert.match(inventory, /bounded evidence hardening/u);
  assert.match(inventory, /behavior-preserving refactor/u);
  assert.match(inventory, /stronger-readiness gap/u);
  assert.match(inventory, /No practical-use or production-like readiness/u);
  assert.match(inventory, /No real employee data/u);
  assert.match(inventory, /No live IdP\/Okta/u);
  assert.match(inventory, /No unrestricted raw payload/u);
  assert.match(inventory, /No broad CSV export/u);
  assert.match(inventory, /No production queue\/DLQ/u);
  assert.match(inventory, /No retention\/deletion runtime/u);
  assert.match(inventory, /No two-key\s+Accepted claim/u);
  assert.doesNotMatch(inventory, /HR practical-use ready:\s*Go/u);
  assert.doesNotMatch(inventory, /production-like ready:\s*Go/u);
});

test("P2X production-like blocker matrix keeps stronger readiness blocked", async () => {
  const matrix = await readRepoFile(
    "docs/p2x-production-like-blocker-matrix.md",
  );

  for (const surface of [
    "real employee data",
    "live Okta/provider operation",
    "production authorization/RLS",
    "production audit immutability",
    "raw payload and CSV export",
    "production scheduler/queue/DLQ",
    "production ops",
    "legal/privacy runtime",
    "retention/deletion",
    "future-extension surfaces",
  ] as const) {
    assert.match(matrix, new RegExp(`\\|\\s*${surface}\\s*\\|`, "u"));
  }

  for (const gate of ["P0-R05 / #11", "P0-R06 / #12", "P0-R08 / #14"]) {
    assert.match(matrix, new RegExp(gate, "u"));
  }

  const currentStatusClaims =
    gateStatusClaimsFromProductionLikeBlockerMatrix(matrix);
  assert.deepEqual(
    currentStatusClaims,
    [],
    "P0 gates must not claim Accepted or production-like ready in the blocker matrix current-status cells",
  );
  assert.deepEqual(
    gateStatusClaimsFromProductionLikeBlockerMatrix(
      [
        "| Blocker surface | Owner gate or anchor | Current status | Required next evidence | Decision required before stronger claim |",
        "| --- | --- | --- | --- | --- |",
        "| production authorization/RLS | P0-R05 / #11 | Accepted | follow-up evidence | two-key decision |",
        "| production audit immutability | P0-R06 / #12 | production-like ready | follow-up evidence | architecture decision |",
        "| raw payload and CSV export | P0-R08 / #14 | Blocked; requires an Accepted raw-view/export permissions decision | follow-up evidence | legal/privacy decision |",
      ].join("\n"),
    ),
    [
      "P0-R05 / #11: Accepted",
      "P0-R06 / #12: production-like ready",
      "P0-R08 / #14: Blocked; requires an Accepted raw-view/export permissions decision",
    ],
    "guard must match forbidden gate status claims when the claim is in a later table cell",
  );

  for (const [gate, expectedStatus] of [
    [
      "P0-R05 / #11",
      "Blocked; bounded app checks are not production RBAC/RLS authority",
    ],
    [
      "P0-R06 / #12",
      "Blocked; local audit/correlation evidence is mutable repository proof",
    ],
    [
      "P0-R08 / #14",
      "Blocked; only bounded synthetic CSV and denied-export evidence exists",
    ],
  ] as const) {
    assert.equal(
      productionLikeBlockerMatrixStatus(matrix, gate),
      expectedStatus,
      `${gate} must remain explicitly blocked in the blocker matrix current-status cell`,
    );
  }

  assert.match(matrix, /#240/u);
  assert.match(matrix, /two-key decision/u);
  assert.match(matrix, /legal\/privacy decision/u);
  assert.match(matrix, /operational decision/u);
  assert.match(matrix, /architecture decision/u);
  assert.match(matrix, /No application behavior/u);
  assert.match(matrix, /No real employee data/u);
  assert.match(matrix, /No live IdP\/Okta/u);
  assert.match(matrix, /No unrestricted raw payload/u);
  assert.match(matrix, /No broad CSV export/u);
  assert.match(matrix, /No production queue\/DLQ/u);
  assert.match(matrix, /No retention\/deletion runtime/u);
  assert.match(matrix, /No two-key\s+Accepted claim/u);
  assert.match(matrix, /No production-like readiness surface/u);
  assert.doesNotMatch(matrix, /production-like ready:\s*Go/u);
  assert.doesNotMatch(matrix, /HR practical-use ready:\s*Go/u);
});

test("P2X bounded practical-use artifacts keep stronger readiness blocked", async () => {
  const artifacts = await Promise.all(
    p2xBoundedPracticalUseArtifactPaths.map(async (path) => ({
      path,
      text: await readRepoFile(path),
    })),
  );

  for (const { path, text } of artifacts) {
    const normalizedText = text.replace(/\s+/gu, " ");
    assert.match(
      normalizedText,
      /No real employee data/u,
      `${path} must preserve the real employee data blocker`,
    );
    assert.match(
      normalizedText,
      /No live IdP\/Okta/u,
      `${path} must preserve the live IdP/Okta blocker`,
    );
    assert.match(
      normalizedText,
      /No unrestricted raw payload/u,
      `${path} must preserve the unrestricted raw payload blocker`,
    );
    assert.match(
      normalizedText,
      /No broad CSV export/u,
      `${path} must preserve the broad CSV export blocker`,
    );
    assert.match(
      normalizedText,
      /No production queue\/DLQ/u,
      `${path} must preserve the production queue/DLQ blocker`,
    );
    assert.match(
      normalizedText,
      /No retention\/deletion runtime/u,
      `${path} must preserve the retention/deletion blocker`,
    );
    assert.match(
      normalizedText,
      /No two-key\s+(?:Accepted|approval) claim/u,
      `${path} must preserve the two-key approval blocker`,
    );
    assert.match(
      normalizedText,
      /No HR practical-use readiness/u,
      `${path} must preserve the HR practical-use blocker`,
    );
    assert.match(
      normalizedText,
      /No production-like readiness/u,
      `${path} must preserve the production-like blocker`,
    );
    assert.deepEqual(
      p2xBoundedPracticalUseArtifactOverclaims(text),
      [],
      `${path} must not contain stronger readiness overclaims`,
    );
  }

  assert.deepEqual(
    p2xBoundedPracticalUseArtifactOverclaims(
      [
        "HR practical-use readiness: Go.",
        "No real employee data, HR practical-use readiness: Go.",
        "No unrestricted raw payload, production-like readiness: Go.",
        "No real employee data, but HR practical-use readiness: Go.",
        "No real employee data but practical-use readiness is Go.",
        "HR practical-use readiness: Go, but real employee data remains blocked.",
        "production-like ready: Go.",
        "real employee data is ready.",
        "live-provider operation is enabled.",
        "live tenant data is approved.",
        "live tenant export is enabled.",
        "live tenant binding: Go.",
        "named tenant binding: Go.",
        "Raw payload access is approved.",
        "production scheduler/queue/DLQ ready: Go.",
        "production ops readiness: Go.",
        "production authorization/RLS is approved.",
        "production RBAC authority is ready.",
        "PostgreSQL RLS source of truth is approved.",
        "authorization/data-scope design acceptance: Go.",
        "actor/role/tenant binding is approved.",
        "trusted proxy identity boundary is ready.",
        "query-layer enforcement is approved.",
        "service-layer enforcement is approved.",
        "negative enforcement tests are complete.",
        "mixed-boundary fail-closed evidence is approved.",
        "production audit immutability is accepted.",
        "production audit readiness: Go.",
        "production backup is approved.",
        "production restore approval is complete.",
        "backup/restore operation is ready.",
        "Do not use production credentials, support-console custody is approved.",
        "support-console custody is approved.",
        "production support process is enabled.",
        "payroll data is approved.",
        "regulated identifiers are allowed.",
        "production credentials are enabled.",
        "provider credentials are ready.",
        "placeholder credentials are allowed.",
        "missing credential source is approved.",
        "trusted credential source is approved.",
        "credential custody owner: Go.",
        "secret rotation readiness: Go.",
        "revocation plan is approved.",
        "secret revocation plan is ready.",
        "webhook runtime custody: Go.",
        "webhook custody boundary is approved.",
        "webhook source is approved.",
        "untrusted webhook source is allowed.",
        "provider audit search: Go.",
        "audit search boundary is approved.",
        "provider retry/error custody: Go.",
        "provider error and retry custody record is ready.",
        "retry/error custody is ready.",
        "error and retry custody is approved.",
        "provider rollback behavior: Go.",
        "rollback path is ready.",
        "tested rollback behavior is approved.",
        "unknown tenant is allowed.",
        "unsupported provider event is enabled.",
        "stale provider state is enabled.",
        "retention/deletion requests are allowed.",
        "broad CSV/export is allowed.",
        "legal/privacy acceptance is approved.",
        "two-key approval is complete.",
        "Surface | Evidence | Status",
        "--- | --- | ---",
        "real employee data | repository-only evidence reference that is intentionally long enough to exceed the prose detector window | approved",
        "| real employee data | approved | No real employee data remains blocked |",
      ].join("\n"),
    ),
    [
      "HR practical-use readiness",
      "production-like readiness",
      "real employee data readiness",
      "live IdP/Okta readiness",
      "live tenant binding",
      "unrestricted raw payload readiness",
      "production queue/DLQ readiness",
      "production ops readiness",
      "production authorization/RLS readiness",
      "production audit immutability readiness",
      "production audit/archive readiness",
      "production backup/restore readiness",
      "support-console readiness",
      "regulated data/credential readiness",
      "secret rotation readiness",
      "webhook runtime custody",
      "provider audit search",
      "provider retry/error custody",
      "provider rollback behavior",
      "retention/deletion runtime readiness",
      "broad export readiness",
      "legal/privacy acceptance",
      "two-key Accepted approval",
    ],
    "guard must fail closed for prohibited P2X readiness and data-surface claims",
  );

  assert.deepEqual(
    p2xBoundedPracticalUseArtifactOverclaims(
      [
        "HR practical-use readiness review is documentation-only.",
        "This updates the HR practical-use readiness checklist.",
        "The production-like readiness blocker remains in force.",
        "The production-like readiness review is documentation-only.",
        "Raw payload viewing remains closed.",
        "| Allowed bounded surface | Blocked surface |",
        "| --- | --- |",
        "| explicitly approved non-production data | real employee data |",
      ].join("\n"),
    ),
    [],
    "guard must allow non-affirmative P2X surface mentions",
  );

  assert.deepEqual(
    p2xBoundedPracticalUseArtifactOverclaims(
      [
        "production RBAC authority is not approved.",
        "PostgreSQL RLS source of truth is not ready.",
        "authorization/data-scope design acceptance remains blocked.",
        "actor/role/tenant binding is not allowed.",
        "trusted proxy identity boundary is not accepted.",
        "query-layer enforcement remains blocked.",
        "service-layer enforcement is not enabled.",
        "negative enforcement tests are not ready.",
        "mixed-boundary fail-closed evidence remains blocked.",
      ].join("\n"),
    ),
    [],
    "guard must allow explicitly blocked P2X authorization alias wording",
  );

  assert.deepEqual(
    p2xBoundedPracticalUseArtifactOverclaims(
      [
        "Accepted authorization/data-scope design exists with trusted proxy identity boundary.",
        "The accepted authorization/data-scope design includes PostgreSQL RLS source of truth.",
        "Accepted authorization/data-scope design covers negative enforcement tests.",
      ].join("\n"),
    ),
    ["production authorization/RLS readiness"],
    "guard must fail closed for accepted authorization design promotion wording",
  );

  assert.deepEqual(
    p2xBoundedPracticalUseArtifactOverclaims(
      [
        "| Surface | Status |",
        "| --- | --- |",
        "| real employee data | complete |",
        "| live IdP/Okta | processing |",
        "| support-console custody | available |",
        "| regulated identifiers | available |",
        "| production backup | complete |",
      ].join("\n"),
    ),
    [
      "real employee data readiness",
      "live IdP/Okta readiness",
      "support-console readiness",
      "regulated data/credential readiness",
      "production backup/restore readiness",
    ],
    "guard must fail closed for P2X table-cell status overclaims",
  );
});

test("P2X final closeout stays inside stronger-readiness guard coverage", async () => {
  const closeout = await readRepoFile(
    "docs/p2x-01-next-wave-recommendation-closeout.md",
  );
  const normalizedText = closeout.replace(/\s+/gu, " ");

  for (const blocker of [
    /HR practical-use ready: Blocked/u,
    /production-like ready: Blocked/u,
    /real employee data: Blocked/u,
    /live Okta tenant operation: Blocked/u,
    /production queue\/DLQ ready: Blocked/u,
    /retention\/deletion runtime ready: Blocked/u,
    /two-key acceptance .*: Blocked/u,
  ]) {
    assert.match(
      normalizedText,
      blocker,
      "P2X final closeout must preserve stronger-readiness blockers",
    );
  }

  assert.deepEqual(
    p2xBoundedPracticalUseArtifactOverclaims(closeout),
    [],
    "P2X final closeout must not contain stronger readiness overclaims",
  );
});

const p2xBoundedPracticalUseArtifactPaths = [
  "docs/p2x-02-bounded-practical-use-follow-up-closeout.md",
  "docs/p2x-hr-practical-use-gap-assessment.md",
  "docs/p2x-local-bounded-operator-runbook.md",
  "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
  "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
  "docs/p2x-synthetic-test-data-governance.md",
  "docs/p2x-closeout-reference-inventory.md",
  "docs/p2x-03-bounded-closeout-synchronization-closeout.md",
  "docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md",
  "docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md",
  "docs/p2x-04-production-authorization-rls-prerequisite-lane.md",
] as const;

function p2xBoundedPracticalUseArtifactOverclaims(text: string): string[] {
  const findings: string[] = [];
  for (const segment of p2xClaimSegments(text)) {
    const normalizedLine = segment.replace(/\s+/gu, " ").trim();
    if (normalizedLine.length === 0) {
      continue;
    }

    for (const [subject, pattern] of p2xProhibitedClaimPatterns) {
      for (const claimSegment of p2xClaimSegmentsForSurfaceStatus(
        normalizedLine,
      )) {
        if (
          pattern.test(claimSegment) &&
          !p2xLineBlocksSubject(claimSegment, subject) &&
          !findings.includes(subject)
        ) {
          findings.push(subject);
        }
      }
    }

    for (const [subject, subjectPattern] of p2xBlockedSubjectPatterns) {
      for (const claimSegment of p2xClaimSegmentsForSurfaceStatus(
        normalizedLine,
      )) {
        if (
          subjectPattern.test(claimSegment) &&
          hasAffirmativeStatusAttachedToSubject(claimSegment, subjectPattern) &&
          !p2xLineBlocksSubject(claimSegment, subject) &&
          !findings.includes(subject)
        ) {
          findings.push(subject);
        }
      }
    }
  }

  return findings;
}

function normalizeP2XClaimSegmentForSurfaceStatus(segment: string): string {
  return segment.replace(/\s+/gu, " ").trim();
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

function isTableRowSegment(segment: string): boolean {
  return parseMarkdownTableCells(segment).length > 1;
}

function parseMarkdownTableCells(line: string): string[] {
  const trimmedLine = line.trim();
  const content =
    trimmedLine.startsWith("|") && trimmedLine.endsWith("|")
      ? trimmedLine.slice(1, -1)
      : trimmedLine;
  return content.split("|").map((cell) => cell.replace(/\s+/gu, " ").trim());
}

function isSimpleP2XAffirmativeStatusCell(cell: string): boolean {
  return /^(?:Go|Accepted|Yes|ready|allowed|approved|enabled|available|processing|complete)$/iu.test(
    cell.replace(/\s+/gu, " ").trim(),
  );
}

function p2xClaimSegments(text: string): string[] {
  const segments: string[] = [];
  let proseLines: string[] = [];

  const flushProse = (): void => {
    if (proseLines.length === 0) {
      return;
    }

    segments.push(
      ...proseLines
        .join(" ")
        .replace(/\s+/gu, " ")
        .trim()
        .split(/(?<!\b\d)\.(?=\s+|$)/u)
        .map((segment) => segment.replace(/\s+/gu, " ").trim())
        .filter((segment) => segment.length > 0),
    );
    proseLines = [];
  };

  for (const line of text.split(/\r?\n/u)) {
    const normalizedLine = line.replace(/\s+/gu, " ").trim();
    if (normalizedLine.length === 0) {
      flushProse();
      continue;
    }

    if (
      normalizedLine.includes("|") ||
      /^(?:[-*+]\s+|\d+\.\s+)/u.test(normalizedLine)
    ) {
      flushProse();
      segments.push(normalizedLine);
      continue;
    }

    proseLines.push(normalizedLine);
  }

  flushProse();
  return segments;
}

function p2xLineBlocksSubject(line: string, subject: string): boolean {
  const subjectPattern = p2xBlockedSubjectPatterns.find(
    ([blockedSubject]) => blockedSubject === subject,
  )?.[1];
  if (subjectPattern === undefined) {
    throw new Error(`blocked subject pattern exists for ${subject}`);
  }

  if (
    subject === "production authorization/RLS readiness" &&
    isP2XAuthorizationPrerequisiteEvidenceLine(line)
  ) {
    return true;
  }

  const subjectSource = subjectPattern.source;
  if (
    new RegExp(
      `\\b(?:No|not|must\\s+not|does\\s+not|do\\s+not|requires?\\s+(?:a\\s+later\\s+)?Accepted|before\\s+Accepted|required\\s+before\\s+Accepted)\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,180}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:Blocked(?:\\s+shape)?|Generic\\s+production\\s+acceptance)\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:cannot|can't)\\s+claim\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:${subjectSource})\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,180}\\b(?:Blocked|blocked|deferred|not\\s+accepted|not\\s+approved|not\\s+enabled|not\\s+allowed|not\\s+ready|remain(?:s)?\\s+blocked|requires?\\s+(?:a\\s+later\\s+)?Accepted|required\\s+before\\s+Accepted|before\\s+Accepted)\\b`,
      "iu",
    ).test(line)
  ) {
    return true;
  }

  if (hasAffirmativeStatusAttachedToSubject(line, subjectPattern)) {
    return false;
  }

  return (
    new RegExp(
      `\\bNo\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:do\\s+not\\s+(?:use|update)|must\\s+not\\s+(?:use|update)|does\\s+not\\s+(?:require|introduce|approve|accept|update)|not\\s+(?:require|introduce|approve|accept|update))\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:Blocked(?:\\s+shape)?|Generic\\s+production\\s+acceptance)\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:cannot|can't)\\s+claim\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line)
  );
}

function isP2XAuthorizationPrerequisiteEvidenceLine(line: string): boolean {
  return (
    /\b(?:must\s+be\s+supplied|required(?:\s+(?:before|next|future|separate|evidence|stronger|claim|promotion)){0,6}|before\s+(?:any\s+)?(?:stronger\s+)?claim|before\s+promotion)\b[^.;|]{0,180}\baccepted\s+authorization\/data-scope\s+design\b[^.;|]{0,180}\b(?:trusted\s+proxy\s+identity|PostgreSQL\s+RLS|negative\s+enforcement\s+tests?|actors?)\b/iu.test(
      line,
    ) ||
    /\bproduction\s+authorization\/RLS\b[^.;|]{0,180}\bremains\s+blocked\s+on\s+accepted\s+authorization\/data-scope\s+design\b/iu.test(
      line,
    )
  );
}

function hasAffirmativeStatusAttachedToSubject(
  line: string,
  subjectPattern: RegExp,
): boolean {
  const globalSubjectPattern = new RegExp(subjectPattern.source, "giu");
  for (const match of line.matchAll(globalSubjectPattern)) {
    if (match.index === undefined) {
      continue;
    }

    const subjectStartIndex = match.index;
    const subjectEndIndex = subjectStartIndex + match[0].length;
    const previousBreakIndex = Math.max(
      line.lastIndexOf(",", subjectStartIndex),
      line.lastIndexOf("|", subjectStartIndex),
      line.lastIndexOf(";", subjectStartIndex),
      line.lastIndexOf(".", subjectStartIndex),
    );
    const nextBreakIndexes = [",", "|", ";", "."]
      .map((breakChar) => line.indexOf(breakChar, subjectEndIndex))
      .filter((index) => index !== -1);
    const nextBreakIndex =
      nextBreakIndexes.length === 0
        ? line.length
        : Math.min(...nextBreakIndexes);
    const subjectPrefix = line.slice(previousBreakIndex + 1, subjectStartIndex);
    const subjectSuffix = line.slice(subjectEndIndex, nextBreakIndex);

    if (
      /^\s*(?:access\s+)?(?::\s*)?(?:(?:is|are|has\s+been|can\s+be)\s+)?(?:(?:Go|Accepted|Yes|ready|allowed|approved|enabled|available)\b|(?:processing|complete)\s*$)/iu.test(
        subjectSuffix,
      )
    ) {
      return true;
    }

    if (
      /\b(?:Go|Accepted|Yes|ready|allowed|approved|enabled|available|processing|complete)\s*:?\s*$/iu.test(
        subjectPrefix,
      )
    ) {
      return true;
    }
  }

  return false;
}

const p2xProhibitedClaimPatterns: Array<[string, RegExp]> = [
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
    /\b(?:real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|processing)\b|\b(?:ready|approved|go|enabled|available|process(?:es|ing)|uses?)\b[^.;]{0,60}\b(?:real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data)\b/iu,
  ],
  [
    "live IdP/Okta readiness",
    /\b(?:live[-\s]+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?|live[-\s]+tenant[-\s]+(?:data|export)|unknown\s+tenant|unsupported\s+provider\s+event|stale\s+provider\s+state)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\b(?:live[-\s]+(?:IdP|Okta|provider|tenant[-\s]+(?:data|export))|unknown\s+tenant|unsupported\s+provider\s+event|stale\s+provider\s+state)\b/iu,
  ],
  [
    "live tenant binding",
    /\b(?:live|named)\s+tenant\s+binding\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|complete)\b[^.;]{0,60}\b(?:live|named)\s+tenant\s+binding\b/iu,
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
    /\b(?:production\s+authorization\/RLS|production\s+RBAC(?:\s+authority)?|PostgreSQL\s+RLS(?:\s+source\s+of\s+truth)?|authorization\/data-scope\s+design(?:\s+acceptance)?|actor\/role\/tenant\s+binding|trusted\s+proxy\s+identity(?:\s+boundary)?|query-layer\s+enforcement|service-layer\s+enforcement|negative\s+enforcement\s+tests?|mixed-boundary\s+fail-closed\s+evidence)\b(?:[^.;|]{0,60}\b(?:ready|approved|go|enabled|available|complete)\b|[^.;|]{0,20}\b(?:(?:is|are|has\s+been|can\s+be)\s+|:\s*)(?:allowed|accepted)\b)|\b(?:ready|approved|go|enabled|available)\b[^.;|]{0,60}\b(?:production\s+authorization\/RLS|production\s+RBAC(?:\s+authority)?|PostgreSQL\s+RLS(?:\s+source\s+of\s+truth)?|authorization\/data-scope\s+design(?:\s+acceptance)?|actor\/role\/tenant\s+binding|trusted\s+proxy\s+identity(?:\s+boundary)?|query-layer\s+enforcement|service-layer\s+enforcement|negative\s+enforcement\s+tests?|mixed-boundary\s+fail-closed\s+evidence)\b|\b(?:allowed|accepted)\b[^.;|]{0,60}\b(?:production\s+authorization\/RLS|production\s+RBAC(?:\s+authority)?|PostgreSQL\s+RLS(?:\s+source\s+of\s+truth)?)\b/iu,
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
    /\b(?:support-console\s+(?:custody|sessions?|authority)|production\s+support\s+process|support\s+access\s+model)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|approved|accepted|go|enabled|available)\b[^.;]{0,60}\b(?:support-console\s+(?:custody|sessions?|authority)|production\s+support\s+process|support\s+access\s+model)\b/iu,
  ],
  [
    "regulated data/credential readiness",
    /\b(?:payroll(?:\/benefit)?\s+data|payroll\s+or\s+benefit\s+data|benefit\s+data|production\s+credentials?|provider\s+credentials?|placeholder\s+credentials?|trusted\s+credential\s+source|credential\s+custody\s+owner|missing\s+credential\s+source|regulated\s+identifiers?|sensitive\s+personal\s+information)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)\b|\b(?:ready|allowed|approved|accepted|go|enabled|available|process(?:es|ing)|uses?)\b[^.;]{0,60}\b(?:payroll(?:\/benefit)?\s+data|payroll\s+or\s+benefit\s+data|benefit\s+data|production\s+credentials?|provider\s+credentials?|placeholder\s+credentials?|trusted\s+credential\s+source|credential\s+custody\s+owner|missing\s+credential\s+source|regulated\s+identifiers?|sensitive\s+personal\s+information)\b/iu,
  ],
  [
    "secret rotation readiness",
    /\b(?:secret\s+rotation(?:\s+readiness)?|(?:secret\s+)?revocation\s+plan)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|complete)\b[^.;]{0,60}\b(?:secret\s+rotation(?:\s+readiness)?|(?:secret\s+)?revocation\s+plan)\b/iu,
  ],
  [
    "webhook runtime custody",
    /\b(?:webhook\s+(?:runtime\s+custody|custody\s+boundary|source)|untrusted\s+webhook\s+source)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|complete)\b[^.;]{0,60}\b(?:webhook\s+(?:runtime\s+custody|custody\s+boundary|source)|untrusted\s+webhook\s+source)\b/iu,
  ],
  [
    "provider audit search",
    /\b(?:provider\s+audit\s+search|audit\s+search\s+boundary)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|complete)\b[^.;]{0,60}\b(?:provider\s+audit\s+search|audit\s+search\s+boundary)\b/iu,
  ],
  [
    "provider retry/error custody",
    /\b(?:provider\s+)?(?:retry\/error\s+custody|error\s+and\s+retry\s+custody(?:\s+record)?)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|complete)\b[^.;]{0,60}\b(?:provider\s+)?(?:retry\/error\s+custody|error\s+and\s+retry\s+custody(?:\s+record)?)\b/iu,
  ],
  [
    "provider rollback behavior",
    /\b(?:provider\s+rollback\s+behavior|rollback\s+path|tested\s+rollback\s+behavior)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available|complete)\b|\b(?:ready|approved|accepted|go|enabled|available|complete)\b[^.;]{0,60}\b(?:provider\s+rollback\s+behavior|rollback\s+path|tested\s+rollback\s+behavior)\b/iu,
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
    /\btwo-key\b[^.;]{0,60}\b(?:Accepted|approval\s+(?:is\s+)?(?:accepted|approved|complete|ready|go))\b|\bAccepted\b[^.;]{0,60}\btwo-key\s+approval\b/iu,
  ],
];

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
    /live[-\s]+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?|live[-\s]+IdP\/Okta|live[-\s]+tenant[-\s]+(?:data|export)|unknown\s+tenant|unsupported\s+provider\s+event|stale\s+provider\s+state/iu,
  ],
  ["live tenant binding", /(?:live|named)\s+tenant\s+binding/iu],
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
    /production\s+authorization\/RLS|production\s+RBAC(?:\s+authority)?|PostgreSQL\s+RLS(?:\s+source\s+of\s+truth)?|authorization\/data-scope\s+design(?:\s+acceptance)?|actor\/role\/tenant\s+binding|trusted\s+proxy\s+identity(?:\s+boundary)?|query-layer\s+enforcement|service-layer\s+enforcement|negative\s+enforcement\s+tests?|mixed-boundary\s+fail-closed\s+evidence/iu,
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
    /support-console\s+(?:custody|sessions?|authority)|production\s+support\s+process|support\s+access\s+model/iu,
  ],
  [
    "regulated data/credential readiness",
    /payroll(?:\/benefit)?\s+data|payroll\s+or\s+benefit\s+data|benefit\s+data|production\s+credentials?|provider\s+credentials?|placeholder\s+credentials?|trusted\s+credential\s+source|credential\s+custody\s+owner|missing\s+credential\s+source|regulated\s+identifiers?|sensitive\s+personal\s+information/iu,
  ],
  [
    "secret rotation readiness",
    /secret\s+rotation(?:\s+readiness)?|(?:secret\s+)?revocation\s+plan/iu,
  ],
  [
    "webhook runtime custody",
    /webhook\s+(?:runtime\s+custody|custody\s+boundary|source)|untrusted\s+webhook\s+source/iu,
  ],
  [
    "provider audit search",
    /provider\s+audit\s+search|audit\s+search\s+boundary/iu,
  ],
  [
    "provider retry/error custody",
    /(?:provider\s+)?(?:retry\/error\s+custody|error\s+and\s+retry\s+custody(?:\s+record)?)/iu,
  ],
  [
    "provider rollback behavior",
    /provider\s+rollback\s+behavior|rollback\s+path|tested\s+rollback\s+behavior/iu,
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
    /two-key(?:\s+Accepted(?:\s+claim)?|\b[^|.;]{0,80}\b(?:approval|Accepted))/iu,
  ],
];

function gateStatusClaimsFromProductionLikeBlockerMatrix(
  matrix: string,
): string[] {
  return productionLikeBlockerMatrixRows(matrix)
    .filter(({ ownerGate }) =>
      ["P0-R05 / #11", "P0-R06 / #12", "P0-R08 / #14"].some((gate) =>
        ownerGate.includes(gate),
      ),
    )
    .flatMap(({ ownerGate, currentStatus }) =>
      ["P0-R05 / #11", "P0-R06 / #12", "P0-R08 / #14"]
        .filter((gate) => ownerGate.includes(gate))
        .filter(() =>
          /\b(?:Accepted|production-like ready)\b/iu.test(currentStatus),
        )
        .map((gate) => `${gate}: ${currentStatus}`),
    );
}

function productionLikeBlockerMatrixStatus(
  matrix: string,
  gate: "P0-R05 / #11" | "P0-R06 / #12" | "P0-R08 / #14",
): string | undefined {
  return productionLikeBlockerMatrixRows(matrix).find(({ ownerGate }) =>
    ownerGate.includes(gate),
  )?.currentStatus;
}

function productionLikeBlockerMatrixRows(
  matrix: string,
): Array<{ ownerGate: string; currentStatus: string }> {
  const tableRows = markdownTableRows(matrix);
  const header = tableRows[0] ?? [];
  const ownerGateIndex = header.indexOf("Owner gate or anchor");
  const currentStatusIndex = header.indexOf("Current status");
  assert.notEqual(
    ownerGateIndex,
    -1,
    "blocker matrix owner-gate column exists",
  );
  assert.notEqual(
    currentStatusIndex,
    -1,
    "blocker matrix current-status column exists",
  );

  return tableRows.slice(1).map((row) => ({
    ownerGate: row[ownerGateIndex] ?? "",
    currentStatus: row[currentStatusIndex] ?? "",
  }));
}

function markdownTableRows(markdown: string): string[][] {
  return markdown
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && line.endsWith("|"))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/u.test(cell.trim())));
}
