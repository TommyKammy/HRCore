import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { readRepoFile } from "./test-helpers/database.js";

const closeoutPath = "docs/p2list-07-formal-uat-closeout.md";
const visualEvidence = [
  "desktop-chromium-employee-list.png",
  "tablet-chromium-employee-list.png",
  "mobile-chromium-employee-list.png",
  "desktop-chromium-lifecycle-list.png",
  "tablet-chromium-lifecycle-list.png",
  "mobile-chromium-lifecycle-list.png",
] as const;

test("P2LIST-07 formal UAT package is reproducible without claiming the human verdict", async () => {
  const [closeout, readme, packageJson] = await Promise.all([
    readRepoFile(closeoutPath),
    readRepoFile("README.md"),
    readRepoFile("package.json"),
  ]);
  const normalized = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2LIST-07 Formal List UAT and Bounded Closeout",
    "Issue: #418",
    "Part of: #410",
    "Depends on: #415, #416, #417",
    "Automated bounded UAT candidate | Go",
    "Current-head list evidence | Regenerated and visually inspected",
    "Formal human HR workflow verdict | Pending human execution",
    "Issue #418 close eligibility | Blocked pending the formal human verdict",
    "Epic #410 bounded closeout | Blocked pending #418",
    "Production-like readiness | Blocked",
    "Current-Head Evidence Protocol",
    "Executable Dataset Handles",
    "Executable Authorization Checks",
    "Persona Matrix",
    "Formal Scenario Matrix",
    "Evidence Matrix",
    "Operator Runbook",
    "Finding Record",
    "Exit Rule",
    "npm run setup:p2list:uat",
    "npm run verify:p2list:uat",
    "npm run capture:web:evidence",
    "source .local/p2list-uat/api-environment.sh",
    "source .local/p2list-uat/web-environment.sh",
    "p2list-uat-support-correlation",
    "P2LIST_UAT_APPROVER_TOKEN",
    "P2LIST_UAT_SUPPORT_TOKEN",
    "ORG-UAT-OVER-CAP",
    "101 rows; export denied over cap",
    "403 permission_denied",
  ] as const) {
    assert.ok(
      normalized.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `${closeoutPath} must include ${requiredText}`,
    );
  }

  for (let sequence = 1; sequence <= 11; sequence += 1) {
    assert.match(
      closeout,
      new RegExp(
        `\\| P2LIST-UAT-${String(sequence).padStart(2, "0")} \\|`,
        "u",
      ),
      `${closeoutPath} must define P2LIST-UAT-${String(sequence).padStart(2, "0")}`,
    );
  }

  for (const persona of [
    "HR operator",
    "Approver",
    "HR Ops/support",
    "Bounded admin",
  ] as const) {
    assert.match(
      closeout,
      new RegExp(`\\|\\s*${escapeRegExp(persona)}\\s*\\|`, "u"),
      `${closeoutPath} must define the ${persona} boundary`,
    );
  }

  for (const requiredBoundary of [
    "real employee data",
    "live provider operation",
    "production credentials",
    "production authorization/RLS",
    "unrestricted search",
    "raw payload access",
    "broad export",
    "production audit immutability",
    "production retention/deletion",
    "legal/privacy approval",
    "two-key approval",
    "production-like readiness",
    "go-live",
  ] as const) {
    assert.match(
      normalized,
      new RegExp(escapeRegExp(requiredBoundary), "iu"),
      `${closeoutPath} must preserve the ${requiredBoundary} boundary`,
    );
  }

  assert.match(
    readme,
    /\[P2LIST-07 Formal List UAT and Bounded Closeout\]\(docs\/p2list-07-formal-uat-closeout\.md\)/u,
    "README must link the P2LIST-07 closeout package",
  );
  assert.match(
    packageJson,
    /"verify:p2list:uat"\s*:/u,
    "package.json must expose the focused P2LIST UAT verifier",
  );
  assert.match(
    packageJson,
    /"setup:p2list:uat"\s*:\s*"tsx src\/p2list-uat-fixture-setup\.ts"/u,
    "package.json must expose the reproducible P2LIST UAT setup",
  );
  assert.match(
    packageJson,
    /"verify:p2list:uat"[^]*dist\/p2list-request-identity\.test\.js/u,
    "the focused P2LIST UAT verifier must run request-identity coverage",
  );
  assert.match(
    packageJson,
    /"verify:p2list:uat"[^]*dist\/p2list-uat-fixture-setup\.test\.js/u,
    "the focused P2LIST UAT verifier must validate its generated fixture",
  );
  assert.doesNotMatch(
    closeout,
    /\/Users\/[^/\s]+|C:\\Users\\|production[-_ ]?(?:token|secret|password|credential)\s*[=:]\s*\S+/iu,
    `${closeoutPath} must not include workstation paths or credential material`,
  );
  assert.deepEqual(
    closeoutOverclaims(closeout),
    [],
    `${closeoutPath} must not promote pending human or blocked production surfaces`,
  );
});

test("P2LIST-07 visual evidence inventory covers employee and lifecycle lists", async () => {
  const closeout = await readRepoFile(closeoutPath);

  for (const file of visualEvidence) {
    assert.match(
      closeout,
      new RegExp(`\\(${escapeRegExp(`evidence/p2z-webui/${file}`)}\\)`, "u"),
      `${closeoutPath} must link ${file}`,
    );
    const metadata = await stat(
      path.join(process.cwd(), "docs", "evidence", "p2z-webui", file),
    );
    assert.ok(metadata.size > 1_000, `${file} must be a non-empty PNG`);
  }
});

test("P2LIST-07 closeout guard rejects false human and production promotion", () => {
  assert.deepEqual(
    closeoutOverclaims(
      [
        "Formal human HR workflow verdict | Pending human execution",
        "Production-like readiness | Blocked",
        "Go-live approval | Blocked",
      ].join("\n"),
    ),
    [],
  );

  for (const [subject, overclaim] of [
    ["formal human verdict", "| Formal human HR workflow verdict | Accepted |"],
    ["issue close", "| Issue #418 close eligibility | Go |"],
    ["epic close", "| Epic #410 bounded closeout | Accepted |"],
    ["production-like readiness", "| Production-like readiness | Ready |"],
    ["go-live approval", "| Go-live approval | Approved |"],
  ] as const) {
    assert.ok(
      closeoutOverclaims(overclaim).includes(subject),
      `closeout guard must reject ${overclaim}`,
    );
  }
});

function closeoutOverclaims(text: string): string[] {
  const findings: string[] = [];
  for (const [subject, pattern] of forbiddenPromotions) {
    if (pattern.test(text)) {
      findings.push(subject);
    }
  }
  return findings;
}

const forbiddenPromotions: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "formal human verdict",
    /\bFormal human HR workflow verdict\b\s*(?:\||:|-)?\s*(?:Accepted|Conditional|Go|Complete)\b/iu,
  ],
  [
    "issue close",
    /\bIssue #418 close eligibility\b\s*(?:\||:|-)?\s*(?:Go|Accepted|Ready|Complete)\b/iu,
  ],
  [
    "epic close",
    /\bEpic #410 bounded closeout\b\s*(?:\||:|-)?\s*(?:Go|Accepted|Ready|Complete)\b/iu,
  ],
  [
    "production-like readiness",
    /\bProduction-like readiness\b\s*(?:\||:|-)?\s*(?:Go|Accepted|Ready|Approved|Enabled)\b/iu,
  ],
  [
    "go-live approval",
    /\bGo-live approval\b\s*(?:\||:|-)?\s*(?:Go|Accepted|Ready|Approved|Enabled)\b/iu,
  ],
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
