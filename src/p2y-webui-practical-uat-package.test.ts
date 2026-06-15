import assert from "node:assert/strict";
import test from "node:test";

import { readRepoFile } from "./test-helpers/database.js";

const uatPackagePath = "docs/p2y-webui-practical-uat-package.md";

test("P2Y WebUI practical UAT package covers bounded browser scenarios", async () => {
  const uatPackage = await readRepoFile(uatPackagePath);
  const normalizedText = uatPackage.replace(/\s+/gu, " ");

  for (const scenario of [
    "onboarding",
    "transfer",
    "termination",
    "CSV/Ops/DLQ",
    "support review",
    "audit review",
  ] as const) {
    assert.match(
      uatPackage,
      new RegExp(`\\|\\s*${scenario}\\s*\\|`, "iu"),
      `${uatPackagePath} must define the ${scenario} browser UAT scenario`,
    );
  }

  for (const checklistField of [
    "completed",
    "blocked",
    "workaround",
    "defect",
    "post-UAT backlog",
  ] as const) {
    assert.match(
      normalizedText,
      new RegExp(`\\b${checklistField}\\b`, "iu"),
      `${uatPackagePath} must include the ${checklistField} checklist field`,
    );
  }

  for (const triageClass of ["blocker", "must-fix", "post-UAT"] as const) {
    assert.match(
      uatPackage,
      new RegExp(`\\|\\s*${triageClass}\\s*\\|`, "iu"),
      `${uatPackagePath} must define ${triageClass} triage guidance`,
    );
  }

  for (const runbookTopic of [
    "daily operation",
    "approval",
    "support review",
    "DLQ handling",
  ] as const) {
    assert.match(
      normalizedText,
      new RegExp(`\\b${runbookTopic}\\b`, "iu"),
      `${uatPackagePath} must include non-engineer runbook guidance for ${runbookTopic}`,
    );
  }

  for (const evidenceField of [
    "actor",
    "tenant/environment",
    "subject binding",
    "correlation id",
    "evidence version",
    "cleanup status",
  ] as const) {
    assert.match(
      normalizedText,
      new RegExp(`\\b${evidenceField}\\b`, "iu"),
      `${uatPackagePath} must record UI audit/correlation evidence expectations for ${evidenceField}`,
    );
  }

  for (const dataBoundary of [
    "synthetic/non-production UAT data pack",
    "No real employee data",
    "No live IdP/Okta",
    "No production authorization/RLS",
    "No unrestricted raw payload",
    "No broad CSV export",
    "No production queue/DLQ",
    "No retention/deletion runtime",
    "No legal/privacy approval",
    "No two-key approval",
    "No go-live approval",
    "No production-like readiness",
  ] as const) {
    assert.match(
      normalizedText,
      new RegExp(dataBoundary.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
      `${uatPackagePath} must preserve ${dataBoundary}`,
    );
  }

  assert.doesNotMatch(
    uatPackage,
    /\/Users\/[^/\s]+|C:\\Users\\/u,
    `${uatPackagePath} must not include workstation-local absolute paths`,
  );
  assert.deepEqual(
    p2yUatPackageOverclaims(uatPackage),
    [],
    `${uatPackagePath} must not promote UAT evidence into HR practical-use or production-like readiness`,
  );
});

function p2yUatPackageOverclaims(text: string): string[] {
  const findings: string[] = [];
  for (const [subject, pattern] of p2yForbiddenPromotionPatterns) {
    if (pattern.test(text) && !findings.includes(subject)) {
      findings.push(subject);
    }
  }
  return findings;
}

const p2yForbiddenPromotionPatterns: Array<[string, RegExp]> = [
  [
    "HR practical-use readiness",
    /\b(?:HR\s+)?practical-use\s+readiness\b\s*(?::\s*|\s+(?:is\s+)?)?(?:Go|Accepted|Yes|ready|approved|enabled)\b|\bready\s+for\s+HR\s+practical-use\b/iu,
  ],
  [
    "production-like readiness",
    /\bproduction-like\s+readiness\b\s*(?::\s*|\s+(?:is\s+)?)?(?:Go|Accepted|Yes|ready|approved|enabled)\b|\bproduction-like\s+ready\b\s*(?::\s*)?(?:Go|Accepted|Yes|ready|approved|enabled)?\b/iu,
  ],
  [
    "real employee data readiness",
    /\breal\s+employee\s+data\b[^.;]{0,80}\b(?:ready|allowed|approved|accepted|enabled|available)\b|\b(?:ready|allowed|approved|accepted|enabled|available)\b[^.;]{0,80}\breal\s+employee\s+data\b/iu,
  ],
  [
    "live provider readiness",
    /\b(?:live\s+(?:IdP|Okta|provider)|production\s+credentials?)\b[^.;]{0,80}\b(?:ready|allowed|approved|accepted|enabled|available)\b|\b(?:ready|allowed|approved|accepted|enabled|available)\b[^.;]{0,80}\b(?:live\s+(?:IdP|Okta|provider)|production\s+credentials?)\b/iu,
  ],
  [
    "approval substitution",
    /\b(?:legal\/privacy|two-key|go-live)\s+approval\b[^.;]{0,80}\b(?:ready|complete|approved|accepted|substituted|replaced)\b/iu,
  ],
];
