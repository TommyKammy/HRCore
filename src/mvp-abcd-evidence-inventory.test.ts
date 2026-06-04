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
      /No two-key\s+Accepted claim/u,
      `${path} must preserve the two-key Accepted blocker`,
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
        "No real employee data, but HR practical-use readiness: Go.",
        "No real employee data but practical-use readiness is Go.",
        "HR practical-use readiness: Go, but real employee data remains blocked.",
        "production-like ready: Go.",
        "real employee data is ready.",
        "live-provider operation is enabled.",
        "live tenant data is approved.",
        "live tenant export is enabled.",
        "Raw payload access is approved.",
        "production scheduler/queue/DLQ ready: Go.",
        "retention/deletion requests are allowed.",
        "broad CSV/export is allowed.",
        "two-key approval is complete.",
      ].join("\n"),
    ),
    [
      "HR practical-use readiness",
      "production-like readiness",
      "real employee data readiness",
      "live IdP/Okta readiness",
      "unrestricted raw payload readiness",
      "production queue/DLQ readiness",
      "retention/deletion runtime readiness",
      "broad export readiness",
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
        "| Surface | Status |",
        "| --- | --- |",
        "| real employee data | approved |",
        "| live IdP/Okta | enabled |",
      ].join("\n"),
    ),
    ["real employee data readiness", "live IdP/Okta readiness"],
    "guard must fail closed for P2X table-cell status overclaims",
  );
});

const p2xBoundedPracticalUseArtifactPaths = [
  "docs/p2x-local-bounded-operator-runbook.md",
  "docs/p2x-synthetic-practical-use-rehearsal-checklist.md",
  "docs/p2x-cross-flow-audit-correlation-lookup-map.md",
  "docs/p2x-synthetic-test-data-governance.md",
] as const;

function p2xBoundedPracticalUseArtifactOverclaims(text: string): string[] {
  const findings: string[] = [];
  for (const segment of p2xClaimSegments(text)) {
    const normalizedLine = segment.replace(/\s+/gu, " ").trim();
    if (normalizedLine.length === 0) {
      continue;
    }

    for (const [subject, pattern] of p2xProhibitedClaimPatterns) {
      const claimSegments = p2xClaimSegmentsForSurfaceStatus(normalizedLine);
      if (
        claimSegments.some((claimSegment) => pattern.test(claimSegment)) &&
        !p2xLineBlocksSubject(normalizedLine, subject) &&
        !findings.includes(subject)
      ) {
        findings.push(subject);
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
  for (let index = 0; index < cells.length - 1; index += 1) {
    const leftCell = cells[index];
    const rightCell = cells[index + 1];
    if (isSimpleP2XAffirmativeStatusCell(rightCell)) {
      claimSegments.push(`${leftCell} ${rightCell}`);
    }
    if (isSimpleP2XAffirmativeStatusCell(leftCell)) {
      claimSegments.push(`${leftCell} ${rightCell}`);
    }
  }

  return claimSegments.map(normalizeP2XClaimSegmentForSurfaceStatus);
}

function isTableRowSegment(segment: string): boolean {
  return /^\s*\|.*\|\s*$/u.test(segment);
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

  const subjectSource = subjectPattern.source;
  return (
    new RegExp(
      `\\b(?:No|not|must\\s+not|does\\s+not|do\\s+not|requires?\\s+(?:a\\s+later\\s+)?Accepted|before\\s+Accepted|required\\s+before\\s+Accepted)\\b(?:(?!\\b(?:but|however|yet)\\b)[^,|.;]){0,180}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\bNo\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:Blocked(?:\\s+shape)?|Generic\\s+production\\s+acceptance)\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,500}\\b(?:${subjectSource})\\b`,
      "iu",
    ).test(line) ||
    new RegExp(
      `\\b(?:${subjectSource})\\b(?:(?!\\b(?:but|however|yet)\\b)[^|.;]){0,180}\\b(?:Blocked|blocked|deferred|not\\s+accepted|not\\s+approved|not\\s+enabled|not\\s+allowed|not\\s+ready|remain(?:s)?\\s+blocked|requires?\\s+(?:a\\s+later\\s+)?Accepted|required\\s+before\\s+Accepted|before\\s+Accepted)\\b`,
      "iu",
    ).test(line)
  );
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
    /\b(?:real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|processing)\b|\b(?:ready|approved|go|enabled|process(?:es|ing)|uses?)\b[^.;]{0,60}\b(?:real[-\s]+employee[-\s]+data|real[-\s]+data|employee[-\s]+data)\b/iu,
  ],
  [
    "live IdP/Okta readiness",
    /\blive[-\s]+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\blive[-\s]+tenant[-\s]+(?:data|export)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^.;]{0,60}\blive[-\s]+(?:IdP|Okta|provider|tenant[-\s]+(?:data|export))\b/iu,
  ],
  [
    "unrestricted raw payload readiness",
    /\b(?:unrestricted\s+)?raw[-\s]+payloads?(?:\s+access)?\b(?:[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled|available)|\s+is\s+(?:approved|allowed|enabled|ready|available))\b|\b(?:ready|approved|go|enabled|allows?|permit(?:s|ted)?|exposes?|views?)\b[^.;]{0,60}\b(?:unrestricted\s+)?raw[-\s]+payloads?(?:\s+access)?\b/iu,
  ],
  [
    "production queue/DLQ readiness",
    /\b(?:production\s+(?:scheduler\/queue\/DLQ|queue|DLQ|queue\/DLQ)|queue\/DLQ)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^.;]{0,60}\b(?:production\s+(?:scheduler\/queue\/DLQ|queue|DLQ|queue\/DLQ)|queue\/DLQ)\b/iu,
  ],
  [
    "retention/deletion runtime readiness",
    /\bretention\/deletion(?:\s+(?:runtime|jobs?|requests?))?\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^.;]{0,60}\bretention\/deletion(?:\s+(?:runtime|jobs?|requests?))?\b/iu,
  ],
  [
    "broad export readiness",
    /\b(?:broad\s+(?:CSV(?:\/|\s+))?export|CSV\/export)\b[^.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|go|enabled)\b[^.;]{0,60}\b(?:broad\s+(?:CSV(?:\/|\s+))?export|CSV\/export)\b/iu,
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
    /live[-\s]+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?|live[-\s]+IdP\/Okta|live[-\s]+tenant[-\s]+(?:data|export)/iu,
  ],
  [
    "unrestricted raw payload readiness",
    /(?:unrestricted\s+)?raw[-\s]+payloads?/iu,
  ],
  [
    "production queue/DLQ readiness",
    /production\s+(?:queue|DLQ|queue\/DLQ)|production\s+scheduler\/queue\/DLQ|queue\/DLQ/iu,
  ],
  [
    "retention/deletion runtime readiness",
    /retention\/deletion(?:\s+runtime)?/iu,
  ],
  ["broad export readiness", /broad\s+(?:CSV(?:\/|\s+))?export|CSV\/export/iu],
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
