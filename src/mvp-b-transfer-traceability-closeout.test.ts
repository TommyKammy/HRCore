import assert from "node:assert/strict";
import test from "node:test";

import { readRepoFile } from "./test-helpers/database.js";

test("MVP-B transfer trace closeout preserves production readiness defer wording", async () => {
  const closeout = await readRepoFile(
    "docs/mvp-b-transfer-traceability-closeout.md",
  );

  assert.match(closeout, /bounded non-production MVP-B transfer traceability/u);
  assert.match(closeout, /#11\/#12\/#14 remain owner-acknowledged defer/u);
  assert.doesNotMatch(closeout, /production-like-ready:\s*Go/u);
  assert.doesNotMatch(closeout, /production audit immutability is ready/u);
  assert.doesNotMatch(closeout, /live-provider ready/u);
});
