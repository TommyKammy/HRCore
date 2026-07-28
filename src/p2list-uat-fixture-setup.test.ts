import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import { verifyP2ListSyntheticDatasetManifest } from "./p2list-read-model-types.js";
import {
  p2ListUatManifestSecret,
  p2ListUatSupportCorrelationId,
  p2ListUatTokens,
  prepareP2ListUatFixture,
} from "./p2list-uat-fixture-setup.js";

test("P2LIST formal UAT setup creates a reproducible bounded dataset and environments", async () => {
  const outputDirectory = await mkdtemp(
    path.join(tmpdir(), "hrcore-p2list-uat-"),
  );
  try {
    const result = await prepareP2ListUatFixture(outputDirectory);
    const [manifestText, apiEnvironment, webEnvironment] = await Promise.all([
      readFile(result.manifestPath, "utf8"),
      readFile(result.apiEnvironmentPath, "utf8"),
      readFile(result.webEnvironmentPath, "utf8"),
    ]);
    const provenance = verifyP2ListSyntheticDatasetManifest(
      JSON.parse(manifestText),
      p2ListUatManifestSecret,
    );

    assert.equal(result.employeeCount, 100);
    assert.equal(result.lifecycleRequestCount, 3);
    assert.equal(provenance.values("employment").length, 100);
    assert.equal(provenance.values("transaction_request").length, 3);
    assert.equal(provenance.values("audit_event").length, 1);
    assert.match(apiEnvironment, /P2LIST_EMPLOYEE_ACTORS_JSON/u);
    assert.match(apiEnvironment, /P2LIST_EMPLOYEE_MANIFEST_PATH/u);
    assert.match(webEnvironment, /VITE_P2LIST_HR_OPERATOR_TOKEN/u);
    for (const token of Object.values(p2ListUatTokens)) {
      assert.ok(
        apiEnvironment.includes(token) || webEnvironment.includes(token),
        "generated environments must bind every synthetic persona token",
      );
    }

    const database = await openLocalSyntheticWritebackDatabase(
      `file:${result.databasePath}`,
    );
    try {
      const employeeCount = database
        .prepare("SELECT COUNT(*) AS count FROM employment")
        .get() as { count: number };
      const organizationCounts = (
        database.prepare(
          `
            SELECT organization_code, COUNT(*) AS count
            FROM assignment
            GROUP BY organization_code
            ORDER BY organization_code
          `,
        ) as unknown as {
          all(): Array<{ organization_code: string; count: number }>;
        }
      ).all();
      const lifecycleTypes = (
        database.prepare(
          "SELECT request_type FROM transaction_request ORDER BY request_type",
        ) as unknown as {
          all(): Array<{ request_type: string }>;
        }
      ).all();
      const supportEvidence = database
        .prepare(
          "SELECT COUNT(*) AS count FROM p2list_audit_event WHERE correlation_id = ?",
        )
        .get(p2ListUatSupportCorrelationId) as { count: number };

      assert.equal(employeeCount.count, 100);
      assert.deepEqual(
        organizationCounts.map((row) => ({ ...row })),
        [
          { organization_code: "ORG-UAT-25", count: 25 },
          { organization_code: "ORG-UAT-26", count: 26 },
          { organization_code: "ORG-UAT-49", count: 49 },
        ],
      );
      assert.deepEqual(
        lifecycleTypes.map((row) => row.request_type),
        ["hire", "terminate", "transfer"],
      );
      assert.equal(supportEvidence.count, 1);
    } finally {
      database.close();
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
