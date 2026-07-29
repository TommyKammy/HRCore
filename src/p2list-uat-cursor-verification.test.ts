import assert from "node:assert/strict";
import { test } from "node:test";

import { runP2ListUatCursorVerification } from "./p2list-uat-cursor-verification.js";

test("P2LIST formal UAT cursor verifier exercises all mandatory failure and mutation paths", async () => {
  const evidence = await runP2ListUatCursorVerification();

  assert.deepEqual(evidence, {
    cursorTtlSeconds: 900,
    tampered: {
      statusCode: 400,
      code: "cursor_invalid",
    },
    filterMismatch: {
      statusCode: 400,
      code: "cursor_filter_mismatch",
    },
    concurrentChange: {
      statusCode: 200,
      firstPageLastEmployeeId: "EMP-025",
      afterCursorEmployeeSeen: true,
      beforeCursorEmployeeSeen: false,
      overlapCount: 0,
    },
    expired: {
      statusCode: 400,
      code: "cursor_invalid",
    },
  });
});
