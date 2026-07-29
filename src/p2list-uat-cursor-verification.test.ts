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
      firstPageLastEmployeeId: "EMP-025",
      mutatedUntraversedEmployeeId: "EMP-101",
      acceptedAsOf: "2026-07-29",
      acceptedOrganizationCode: "ORG-UAT-OVER-CAP",
      futureOrganizationCode: "ORG-UAT-FUTURE",
      returnedOrganizationCode: "ORG-UAT-OVER-CAP",
      pageCount: 5,
      traversedRowCount: 101,
      uniqueRowCount: 101,
      omittedEmployeeIds: [],
      duplicateEmployeeIds: [],
      acceptedAtProjectionPreserved: true,
    },
    expired: {
      statusCode: 400,
      code: "cursor_invalid",
    },
  });
});
