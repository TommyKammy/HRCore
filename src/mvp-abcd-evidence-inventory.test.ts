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
    assert.doesNotMatch(
      matrix,
      new RegExp(`${gate}[^\\n|]*(Accepted|production-like ready)`, "iu"),
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
