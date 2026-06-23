import assert from "node:assert/strict";
import test from "node:test";

import { readRepoFile } from "./test-helpers/database.js";

const closeoutPath = "docs/p2y-webui-practical-readiness-review-closeout.md";

test("P2Y WebUI practical-use readiness review closeout records candidate verdict without production promotion", async () => {
  const [closeout, readme] = await Promise.all([
    readRepoFile(closeoutPath),
    readRepoFile("README.md"),
  ]);
  const normalizedCloseout = closeout.replace(/\s+/gu, " ").trim();

  for (const requiredText of [
    "# P2Y WebUI Practical-Use Readiness Review Closeout",
    "Issue: #395",
    "Part of: #388",
    "Depends on: #389, #390, #391, #392, #393, #394",
    "Readiness Verdict",
    "HR practical-use candidate: Go",
    "production-like readiness: Blocked",
    "go-live approval: Blocked",
    "real employee data: Blocked",
    "live provider operation: Blocked",
    "production authorization/RLS: Blocked",
    "unrestricted raw payload: Blocked",
    "broad CSV export: Blocked",
    "legal/privacy approval: Blocked",
    "two-key approval: Blocked",
    "Reviewed Evidence",
    "UAT findings",
    "accessibility/usability findings",
    "supportability findings",
    "security/masking/audit findings",
    "role-gate findings",
    "Completed Outcomes",
    "Blocked Outcomes",
    "Deferred Outcomes",
    "Workaround Outcomes",
    "Residual Risks",
    "Blocked Production-Like Surfaces",
    "Next Safest Wave Recommendation",
    "Verification Commands",
    'npm test -- --test-name-pattern "P2Y WebUI practical-use readiness review"',
    "npm run verify:pre-pr",
    "No Surface Expansion Confirmation",
  ]) {
    assert.ok(
      normalizedCloseout.includes(requiredText.replace(/\s+/gu, " ").trim()),
      `missing P2Y readiness closeout text: ${requiredText}`,
    );
  }

  assert.deepEqual(
    p2yReadinessCloseoutOverclaims(closeout),
    [],
    `${closeoutPath} must not promote blocked production-like surfaces`,
  );
  assert.doesNotMatch(
    closeout,
    /(?:\/Users\/|C:\\Users\\|CREATE\s+TABLE|ALTER\s+TABLE|DELETE\s+FROM|UPDATE\s+.*SET|okta\.com|access_key|secret_access_key|api_token|production\s+credential)/iu,
    `${closeoutPath} must not include workstation-local paths, implementation commands, live provider hosts, or credential material`,
  );
  assert.match(
    readme,
    /\[P2Y WebUI Practical-Use Readiness Review Closeout\]\(docs\/p2y-webui-practical-readiness-review-closeout\.md\)/u,
    "README must link the P2Y final readiness review closeout",
  );
});

test("P2Y WebUI practical-use readiness review closeout guard rejects stronger-readiness overclaims", () => {
  assert.deepEqual(
    p2yReadinessCloseoutOverclaims(
      [
        "HR practical-use candidate: Go.",
        "production-like readiness: Blocked.",
        "go-live approval: Blocked.",
        "real employee data: Blocked.",
        "live provider operation: Blocked.",
        "production authorization/RLS: Blocked.",
        "unrestricted raw payload: Blocked.",
        "broad CSV export: Blocked.",
        "legal/privacy approval: Blocked.",
        "two-key approval: Blocked.",
      ].join("\n"),
    ),
    [],
    "the bounded HR practical-use candidate verdict is the only allowed Go surface",
  );

  for (const [subject, overclaim] of [
    ["production-like readiness", "production-like readiness: Go."],
    ["go-live approval", "go-live approval: Accepted."],
    ["real employee data", "real employee data is approved."],
    ["live provider operation", "live provider operation is enabled."],
    ["production authorization/RLS", "production authorization/RLS: Ready."],
    ["production audit immutability", "production audit immutability: Go."],
    ["unrestricted raw payload", "unrestricted raw payload is enabled."],
    ["broad CSV export", "broad CSV export is approved."],
    ["production queue/DLQ", "production queue/DLQ is ready."],
    ["retention/deletion runtime", "retention/deletion runtime is available."],
    ["legal/privacy approval", "legal/privacy approval is complete."],
    ["two-key approval", "two-key approval is accepted."],
  ] as const) {
    assert.ok(
      p2yReadinessCloseoutOverclaims(overclaim).includes(subject),
      `P2Y readiness closeout guard must reject ${overclaim}`,
    );
  }
});

function p2yReadinessCloseoutOverclaims(text: string): string[] {
  const findings: string[] = [];
  for (const [subject, pattern] of p2yForbiddenReadinessPatterns) {
    if (pattern.test(text) && !findings.includes(subject)) {
      findings.push(subject);
    }
  }
  return findings;
}

const p2yForbiddenReadinessPatterns: Array<[string, RegExp]> = [
  [
    "production-like readiness",
    /\bproduction-like\s+readiness\b\s*(?::\s*|\s+(?:is\s+)?)?(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b|\bproduction-like\s+ready\b\s*(?::\s*)?(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)?\b/iu,
  ],
  [
    "go-live approval",
    /\bgo-live\s+approval\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "real employee data",
    /\breal\s+employee\s+data\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "live provider operation",
    /\blive\s+(?:IdP\/Okta\/provider|IdP|Okta|provider)\s+operation\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "production authorization/RLS",
    /\bproduction\s+authorization\/RLS\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "production audit immutability",
    /\bproduction\s+audit\s+immutability\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "unrestricted raw payload",
    /\bunrestricted\s+raw\s+payload\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "broad CSV export",
    /\bbroad\s+CSV\s+export\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "production queue/DLQ",
    /\bproduction\s+queue\/DLQ\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "retention/deletion runtime",
    /\bretention\/deletion\s+runtime\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "legal/privacy approval",
    /\blegal\/privacy\s+approval\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
  [
    "two-key approval",
    /\btwo-key\s+approval\b[^.;]{0,80}\b(?:Go|Accepted|Yes|ready|approved|enabled|allowed|available|complete|cleared)\b/iu,
  ],
];
