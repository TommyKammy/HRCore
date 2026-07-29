import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import { verifyP2ListSyntheticDatasetManifest } from "./p2list-read-model-types.js";
import {
  p2ListUatExportDenialCorrelationIds,
  p2ListUatManifestSecret,
  p2ListUatSupportCorrelationIds,
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

    assert.equal(result.employeeCount, 101);
    assert.equal(result.lifecycleRequestCount, 3);
    assert.equal(provenance.values("employment").length, 101);
    assert.equal(provenance.values("transaction_request").length, 3);
    assert.equal(provenance.values("audit_event").length, 0);
    assert.match(apiEnvironment, /P2LIST_EMPLOYEE_ACTORS_JSON/u);
    assert.match(apiEnvironment, /P2LIST_EMPLOYEE_MANIFEST_PATH/u);
    assert.match(apiEnvironment, /P2LIST_UAT_APPROVER_TOKEN/u);
    assert.match(apiEnvironment, /P2LIST_UAT_SUPPORT_TOKEN/u);
    assert.match(webEnvironment, /VITE_P2LIST_HR_OPERATOR_TOKEN/u);
    assert.match(
      webEnvironment,
      /VITE_P2LIST_UAT_RESPONSE_DROP_MODE='response_drop_once'/u,
    );
    for (const correlationId of Object.values(
      p2ListUatExportDenialCorrelationIds,
    )) {
      assert.match(
        correlationId,
        /^p2list-ui-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        "runtime denial handles must be accepted as client correlations",
      );
    }
    for (const correlationId of [
      ...Object.values(p2ListUatSupportCorrelationIds),
      ...Object.values(p2ListUatExportDenialCorrelationIds),
    ]) {
      assert.ok(
        apiEnvironment.includes(correlationId),
        `generated support scope must bind ${correlationId}`,
      );
    }
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
      const employeeGroupCounts = (
        database.prepare(
          `
            SELECT
              SUM(CASE WHEN display_name LIKE 'UAT-G100-G26-G25%' THEN 1 ELSE 0 END) AS rows_25,
              SUM(CASE WHEN display_name LIKE 'UAT-G100-G26%' THEN 1 ELSE 0 END) AS rows_26,
              SUM(CASE WHEN display_name LIKE 'UAT-G100%' THEN 1 ELSE 0 END) AS rows_100,
              SUM(CASE WHEN display_name LIKE 'UAT-G%' THEN 1 ELSE 0 END) AS rows_101
            FROM person
            JOIN employment ON employment.person_id = person.id
          `,
        ) as unknown as {
          get(): {
            rows_25: number;
            rows_26: number;
            rows_100: number;
            rows_101: number;
          };
        }
      ).get();
      const lifecycleTypes = (
        database.prepare(
          "SELECT request_type FROM transaction_request ORDER BY request_type",
        ) as unknown as {
          all(): Array<{ request_type: string }>;
        }
      ).all();
      const formulaPosition = database
        .prepare(
          `
            SELECT assignment.position_code
            FROM assignment
            JOIN employment ON employment.id = assignment.employment_id
            WHERE employment.employment_code = 'EMP-001'
          `,
        )
        .get() as { position_code: string };
      const supportEvidence = (
        database.prepare(
          `
            SELECT event_id, correlation_id, event_type, policy_decision,
                   reason_code, data_scope_id, filter_fingerprint
            FROM p2list_audit_event
            ORDER BY correlation_id, event_type
          `,
        ) as unknown as {
          all(): Array<{
            event_id: string;
            correlation_id: string;
            event_type: string;
            policy_decision: string;
            reason_code: string | null;
            data_scope_id: string;
            filter_fingerprint: string;
          }>;
        }
      ).all();

      assert.equal(employeeCount.count, 101);
      assert.deepEqual(
        organizationCounts.map((row) => ({ ...row })),
        [{ organization_code: "ORG-UAT-OVER-CAP", count: 101 }],
      );
      assert.deepEqual(
        { ...employeeGroupCounts },
        {
          rows_25: 25,
          rows_26: 26,
          rows_100: 100,
          rows_101: 101,
        },
      );
      assert.deepEqual(
        lifecycleTypes.map((row) => row.request_type),
        ["hire", "terminate", "transfer"],
      );
      assert.equal(formulaPosition.position_code, "=1+1");
      for (const event of supportEvidence) {
        assert.match(
          event.event_id,
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
        );
        assert.match(event.data_scope_id, /^[A-Za-z0-9_-]{43}$/u);
        assert.match(event.filter_fingerprint, /^[A-Za-z0-9_-]{43}$/u);
        assert.notEqual(event.data_scope_id, "ORG-UAT-OVER-CAP");
        assert.doesNotMatch(event.filter_fingerprint, /UAT|EMP|ORG/u);
      }
      assert.deepEqual(
        supportEvidence.map(
          ({
            event_id: _eventId,
            data_scope_id: _dataScopeId,
            filter_fingerprint: _filterFingerprint,
            ...row
          }) => ({ ...row }),
        ),
        [
          {
            correlation_id: p2ListUatSupportCorrelationIds.listAction,
            event_type: "employee_list.search_applied",
            policy_decision: "allow",
            reason_code: null,
          },
          {
            correlation_id: p2ListUatSupportCorrelationIds.exportCompleted,
            event_type: "bounded_export.completed",
            policy_decision: "allow",
            reason_code: "uat_reconciliation",
          },
          {
            correlation_id: p2ListUatSupportCorrelationIds.exportCompleted,
            event_type: "bounded_export.requested",
            policy_decision: "allow",
            reason_code: "uat_reconciliation",
          },
          {
            correlation_id: p2ListUatSupportCorrelationIds.exportDenied,
            event_type: "bounded_export.denied",
            policy_decision: "deny",
            reason_code: "export_row_limit_exceeded",
          },
        ],
      );
    } finally {
      database.close();
    }
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
