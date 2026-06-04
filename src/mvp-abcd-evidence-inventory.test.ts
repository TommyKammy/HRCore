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
