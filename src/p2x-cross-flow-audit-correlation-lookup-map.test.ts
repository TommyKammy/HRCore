import assert from "node:assert/strict";
import test from "node:test";

import { readRepoFile } from "./test-helpers/database.js";

const lookupMapPath = "docs/p2x-cross-flow-audit-correlation-lookup-map.md";

test("P2X cross-flow audit and correlation lookup map covers bounded evidence without readiness upgrades", async () => {
  const lookupMap = await readRepoFile(lookupMapPath);

  assert.match(lookupMap, /# P2X Cross-Flow Audit and Correlation Lookup Map/u);
  assert.match(lookupMap, /docs\/p2x-local-bounded-operator-runbook\.md/u);
  assert.match(
    lookupMap,
    /docs\/p2x-synthetic-practical-use-rehearsal-checklist\.md/u,
  );

  for (const flow of [
    "MVP-A onboarding",
    "MVP-B transfer",
    "MVP-C termination",
    "MVP-D CSV import/export guard",
    "MVP-D local Ops job status",
    "MVP-D DLQ decisions",
  ] as const) {
    assert.match(lookupMap, new RegExp(`\\|\\s*${flow}\\s*\\|`, "u"));
  }

  for (const field of [
    "correlation id",
    "request id",
    "job id",
    "actor",
    "subject",
    "tenant/environment",
    "failed-path expectation",
  ] as const) {
    assert.match(lookupMap, new RegExp(`\\|\\s*${field}\\s*\\|`, "u"));
  }

  for (const blocker of [
    "production audit immutability",
    "broad audit search",
    "compliance archive",
    "live provider audit",
    "support-console custody",
  ] as const) {
    assert.match(lookupMap, new RegExp(blocker, "u"));
  }

  assert.match(lookupMap, /No real employee data/u);
  assert.match(lookupMap, /No live IdP\/Okta/u);
  assert.match(lookupMap, /No unrestricted raw payload/u);
  assert.match(lookupMap, /No broad CSV export/u);
  assert.match(lookupMap, /No production queue\/DLQ/u);
  assert.match(lookupMap, /No retention\/deletion runtime/u);
  assert.match(lookupMap, /No two-key\s+Accepted claim/u);
  assert.match(lookupMap, /No HR practical-use readiness/u);
  assert.match(lookupMap, /No production-like readiness surface/u);
  assert.doesNotMatch(lookupMap, /production audit readiness:\s*Go/iu);
  assert.doesNotMatch(lookupMap, /production audit ready:\s*Go/iu);
  assert.doesNotMatch(lookupMap, /production-like readiness:\s*Go/iu);
  assert.doesNotMatch(lookupMap, /production-like ready:\s*Go/iu);
});
