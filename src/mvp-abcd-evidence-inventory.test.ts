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
        "production-like ready: Go.",
        "real employee data is ready.",
        "live IdP/Okta operation is enabled.",
        "production queue/DLQ ready: Go.",
        "retention/deletion runtime ready: Go.",
        "broad CSV export is allowed.",
        "two-key Accepted approval is complete.",
      ].join("\n"),
    ),
    [
      "HR practical-use readiness",
      "production-like readiness",
      "real employee data readiness",
      "live IdP/Okta readiness",
      "production queue/DLQ readiness",
      "retention/deletion runtime readiness",
      "broad export readiness",
      "two-key Accepted approval",
    ],
    "guard must fail closed for prohibited P2X readiness and data-surface claims",
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
  for (const line of text.split(/\r?\n/u)) {
    const normalizedLine = line.replace(/\s+/gu, " ").trim();
    if (
      normalizedLine.length === 0 ||
      p2xLineIsExplicitlyBlocked(normalizedLine)
    ) {
      continue;
    }

    for (const [subject, pattern] of p2xProhibitedClaimPatterns) {
      if (pattern.test(normalizedLine) && !findings.includes(subject)) {
        findings.push(subject);
      }
    }
  }

  return findings;
}

function p2xLineIsExplicitlyBlocked(line: string): boolean {
  return /\b(?:Blocked|Blocked shape|Generic production acceptance|No|not|not HR practical-use readiness|not production-like readiness|does not require|does not introduce|does not approve|is introduced by|readiness upgrade|remain(?:s)? blocked)\b/iu.test(
    line,
  );
}

const p2xProhibitedClaimPatterns: Array<[string, RegExp]> = [
  [
    "HR practical-use readiness",
    /\bHR\s+practical-use(?:\s+|-)read(?:y|iness)\s*(?::\s*)?(?:Go|Accepted|Yes|ready)?\b|\bpractical-use\s+readiness\s*(?::\s*)?(?:Go|Accepted|Yes|ready)?\b|\bready\s+for\s+HR\s+practical-use\b/iu,
  ],
  ["production-like readiness", /\bproduction-like(?:\s+|-)ready\b/iu],
  [
    "real employee data readiness",
    /\breal\s+employee\s+data\b[^|.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^|.;]{0,60}\breal\s+employee\s+data\b/iu,
  ],
  [
    "live IdP/Okta readiness",
    /\blive\s+(?:IdP|Okta|provider)(?:\/(?:Okta|provider))?\b[^|.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^|.;]{0,60}\blive\s+(?:IdP|Okta|provider)\b/iu,
  ],
  [
    "production queue/DLQ readiness",
    /\bproduction\s+(?:queue|DLQ|queue\/DLQ)\b[^|.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^|.;]{0,60}\bproduction\s+(?:queue|DLQ|queue\/DLQ)\b/iu,
  ],
  [
    "retention/deletion runtime readiness",
    /\bretention\/deletion\s+runtime\b[^|.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^|.;]{0,60}\bretention\/deletion\s+runtime\b/iu,
  ],
  [
    "broad export readiness",
    /\bbroad\s+(?:CSV\s+)?export\b[^|.;]{0,60}\b(?:ready|allowed|approved|accepted|go|enabled)\b|\b(?:ready|approved|accepted|go|enabled)\b[^|.;]{0,60}\bbroad\s+(?:CSV\s+)?export\b/iu,
  ],
  [
    "two-key Accepted approval",
    /\btwo-key\b[^|.;]{0,60}\b(?:Accepted|approval\s+(?:accepted|approved|complete|ready|go))\b|\bAccepted\b[^|.;]{0,60}\btwo-key\s+approval\b/iu,
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
