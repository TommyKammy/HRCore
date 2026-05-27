import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildOktaMasteringAdapter } from "./okta-mastering-adapter.js";
import {
  assertMvpAOnboardingEvidenceAuthorizationGate,
  mvpAOnboardingEvidenceAuthorizationGate,
} from "./mvp-a-onboarding-evidence-authorization.js";
import {
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  applyDueOnboardingTransactionRequests,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
} from "./onboarding-transaction-request.js";
import { verifyMvpAOnboardingCorrelationTrace } from "./mvp-a-onboarding-traceability.js";

const workerAttemptCorrelationId = (
  workerCorrelationId: string,
  transactionRequestId: string,
): string =>
  `onboarding-apply-worker-attempt-${Buffer.from(
    JSON.stringify([workerCorrelationId, transactionRequestId]),
    "utf8",
  ).toString("base64url")}`;

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

const unsafeMvpAOnboardingEvidenceAuthorizationGate = (
  gate: unknown,
): Parameters<typeof assertMvpAOnboardingEvidenceAuthorizationGate>[0] =>
  gate as Parameters<typeof assertMvpAOnboardingEvidenceAuthorizationGate>[0];

const readCommittedMigrationSql = async (): Promise<string> => {
  const migrationFiles = (await readdir(join(process.cwd(), "drizzle")))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const migrationSqlFiles = await Promise.all(
    migrationFiles.map((file) => readRepoFile(join("drizzle", file))),
  );

  return migrationSqlFiles.join("\n");
};

const openSchemaBackedDatabase = async (t: test.TestContext) => {
  let sqlite: typeof import("node:sqlite");
  try {
    sqlite = await import("node:sqlite");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return undefined;
    }

    throw error;
  }

  const db = new sqlite.DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(await readCommittedMigrationSql());
  return db;
};

test("MVP-A onboarding evidence is traceable from one root correlation id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rootCorrelationId = "correlation-onboarding-e2e-001";
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        correlationId: rootCorrelationId,
      }),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: rootCorrelationId,
    });
    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: rootCorrelationId,
        oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
      });
    const writebackEventId =
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z";
    const writebackCorrelationId =
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z";
    db.prepare(
      `
        INSERT INTO writeback_event (
          id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          target_contact_type,
          correlation_id,
          received_at,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      "unrelated-work-email-writeback-same-value-001",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "onboarding.hire.001@example.invalid",
      "work_email",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A05%3A00Z",
      "2026-05-21T02:05:00Z",
    );
    db.prepare(
      `
        INSERT INTO writeback_provider_refresh (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      "synthetic-work-email-provider-refresh-extra-001",
      writebackEventId,
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:00:00Z",
      `${writebackCorrelationId}:provider_refresh:2026-05-21T03%3A00%3A00Z`,
    );
    db.prepare(
      `
        INSERT INTO writeback_provider_refresh (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      "synthetic-work-email-provider-refresh-older-offset-001",
      writebackEventId,
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T04:00:00+09:00",
      `${writebackCorrelationId}:provider_refresh:2026-05-21T04%3A00%3A00%2B09%3A00`,
    );

    const trace = verifyMvpAOnboardingCorrelationTrace(db, {
      correlationId: rootCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireWriteback: true,
      requireProviderRefresh: true,
    });

    assert.equal(result.statusCode, "completed");
    assert.deepEqual(trace.transactionRequest, {
      id: "transaction-request-onboarding-001",
      personId: "person-onboarding-001",
      requestType: "hire",
      statusCode: "completed",
      correlationId: rootCorrelationId,
    });
    assert.deepEqual(
      trace.auditEvents.map((event) => event.action),
      ["mvp_a.onboarding.approve", "mvp_a.onboarding.apply"],
    );
    assert.deepEqual(trace.lifecycleEvent, {
      id: "lifecycle-event-transaction-request-onboarding-001-apply",
      transactionRequestId: "transaction-request-onboarding-001",
      personId: "person-onboarding-001",
      eventType: "hire",
      effectiveDate: "2026-06-01",
      occurredAt: "2026-05-21T02:00:00Z",
    });
    assert.deepEqual(trace.workEmailWriteback, {
      eventId: writebackEventId,
      personId: "person-onboarding-001",
      contactPointId: "contact-point-onboarding-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-person-onboarding-001",
      providerValue: "onboarding.hire.001@example.invalid",
      correlationId: writebackCorrelationId,
    });
    assert.equal(
      trace.providerRefresh?.correlationId,
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T03%3A00%3A00Z",
    );
    assert.equal(trace.remainingP2A02Gates.length, 6);

    db.exec(`
      DELETE FROM writeback_provider_refresh
      WHERE writeback_event_id = '${writebackEventId}';
      DELETE FROM writeback_event
      WHERE id = '${writebackEventId}';
    `);
    assert.throws(
      () =>
        verifyMvpAOnboardingCorrelationTrace(db, {
          correlationId: rootCorrelationId,
          requireApproval: true,
          requireApply: true,
          requireWriteback: true,
          requireProviderRefresh: false,
        }),
      /MVP-A onboarding trace requires work_email writeback evidence linked to the correlated onboarding payload/,
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding trace includes representative failure and partial-success evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        correlationId: "correlation-onboarding-provider-failure-001",
      }),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-provider-failure-001",
    });
    await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-provider-failure-001",
      oktaAdapter: buildOktaMasteringAdapter({
        mode: "mock",
        forcedFailures: {
          "EMP-ONBOARDING-001": {
            outcome: "retryable_failure",
            errorCode: "mock_rate_limited",
            message: "Synthetic retryable provider failure.",
          },
        },
      }),
    });

    const providerFailureTrace = verifyMvpAOnboardingCorrelationTrace(db, {
      correlationId: "correlation-onboarding-provider-failure-001",
      requireApproval: true,
      requireApply: true,
      requireWriteback: false,
      requireProviderRefresh: false,
    });
    assert.equal(
      providerFailureTrace.transactionRequest.statusCode,
      "completed",
    );
    assert.equal(providerFailureTrace.workEmailWriteback, undefined);

    db.exec(
      "DELETE FROM audit_event; DELETE FROM lifecycle_event; DELETE FROM assignment; DELETE FROM employment; DELETE FROM transaction_request; DELETE FROM person;",
    );

    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        correlationId: "correlation-onboarding-writeback-conflict-001",
      }),
    );
    db.exec(`
      INSERT INTO contact_point (
        id,
        person_id,
        contact_type,
        value,
        is_primary,
        created_at
      )
      VALUES (
        'contact-point-onboarding-001',
        'person-onboarding-001',
        'work_email',
        'manual.override@example.invalid',
        1,
        '2026-05-21T00:30:00Z'
      );
    `);
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-writeback-conflict-001",
    });
    await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-writeback-conflict-001",
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    });
    db.prepare(
      `
        INSERT INTO writeback_work_email_conflict (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      "unrelated-work-email-conflict-same-event-001",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "provider_refresh_conflict",
      "manual.override@example.invalid",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:00:00Z",
      "unrelated-provider-refresh-conflict-correlation",
    );

    const conflictTrace = verifyMvpAOnboardingCorrelationTrace(db, {
      correlationId: "correlation-onboarding-writeback-conflict-001",
      requireApproval: true,
      requireApply: true,
      requireWriteback: true,
      requireProviderRefresh: false,
    });
    assert.equal(
      conflictTrace.workEmailConflict?.conflictType,
      "inbound_value_conflict",
    );
    assert.equal(conflictTrace.providerRefresh, undefined);
    assert.throws(
      () =>
        verifyMvpAOnboardingCorrelationTrace(db, {
          correlationId: "correlation-onboarding-writeback-conflict-001",
          requireApproval: true,
          requireApply: true,
          requireWriteback: true,
          requireProviderRefresh: true,
        }),
      /MVP-A onboarding trace requires provider refresh or conflict evidence/,
    );
    db.prepare(
      `
        INSERT INTO writeback_work_email_conflict (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      "correlated-provider-refresh-conflict-001",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "provider_refresh_conflict",
      "manual.override@example.invalid",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:15:00Z",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T03%3A15%3A00Z:conflict:provider_refresh_conflict",
    );
    db.prepare(
      `
        INSERT INTO writeback_work_email_conflict (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      "correlated-provider-refresh-conflict-older-offset-001",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "provider_refresh_conflict",
      "manual.override@example.invalid",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T12:00:00+09:00",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T12%3A00%3A00%2B09%3A00:conflict:provider_refresh_conflict",
    );

    const providerRefreshConflictTrace = verifyMvpAOnboardingCorrelationTrace(
      db,
      {
        correlationId: "correlation-onboarding-writeback-conflict-001",
        requireApproval: true,
        requireApply: true,
        requireWriteback: true,
        requireProviderRefresh: true,
      },
    );
    assert.equal(providerRefreshConflictTrace.providerRefresh, undefined);
    assert.equal(
      providerRefreshConflictTrace.workEmailConflict?.conflictType,
      "provider_refresh_conflict",
    );
    assert.equal(
      providerRefreshConflictTrace.workEmailConflict?.id,
      "correlated-provider-refresh-conflict-001",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding trace fails closed when required apply evidence is missing", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        correlationId: "correlation-onboarding-missing-apply-001",
      }),
    );

    assert.throws(
      () =>
        verifyMvpAOnboardingCorrelationTrace(db, {
          correlationId: "correlation-onboarding-missing-apply-001",
          requireApproval: false,
          requireApply: true,
          requireWriteback: false,
          requireProviderRefresh: false,
        }),
      /MVP-A onboarding trace requires lifecycle apply evidence/,
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding trace follows scheduled worker apply audit correlation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const rootCorrelationId = "correlation-onboarding-worker-trace-001";
    const workerCorrelationId = "correlation-onboarding-worker-apply-001";
    const attemptCorrelationId = workerAttemptCorrelationId(
      workerCorrelationId,
      "transaction-request-onboarding-001",
    );

    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture({
        correlationId: rootCorrelationId,
      }),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: rootCorrelationId,
    });

    assert.deepEqual(
      applyDueOnboardingTransactionRequests(db, {
        now: "2026-06-01T00:00:00Z",
        workerId: "worker-onboarding-apply-001",
        correlationId: workerCorrelationId,
        batchLimit: 10,
      }),
      {
        attempted: 1,
        applied: 1,
        failed: 0,
        skipped: 0,
        correlationId: workerCorrelationId,
        results: [
          {
            transactionRequestId: "transaction-request-onboarding-001",
            status: "applied",
            lifecycleEventId:
              "lifecycle-event-transaction-request-onboarding-001-apply",
          },
        ],
      },
    );

    const trace = verifyMvpAOnboardingCorrelationTrace(db, {
      correlationId: rootCorrelationId,
      requireApproval: true,
      requireApply: true,
      requireWriteback: false,
      requireProviderRefresh: false,
    });

    assert.equal(trace.applyAuditEvent?.correlationId, attemptCorrelationId);
    assert.deepEqual(
      trace.auditEvents.map((event) => [event.action, event.correlationId]),
      [
        ["mvp_a.onboarding.approve", rootCorrelationId],
        ["mvp_a.onboarding.apply", attemptCorrelationId],
      ],
    );
    assert.deepEqual(
      trace.applyJobAttempts.map((attempt) => [
        attempt.statusCode,
        attempt.correlationId,
      ]),
      [["applied", attemptCorrelationId]],
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding trace closeout records P2A-02 production-like gates", async () => {
  const closeout = await readRepoFile(
    "docs/mvp-a-onboarding-traceability-closeout.md",
  );

  for (const requiredText of [
    "WORM / S3 Object Lock",
    "broad audit search UI",
    "backup / restore rehearsal",
    "field-level RBAC",
    "export controls",
    "real Okta tenant credentials",
  ]) {
    assert.match(closeout, new RegExp(requiredText.replace("/", "\\/"), "u"));
  }
});

test("MVP-A onboarding evidence authorization gate classifies every exposed evidence surface", async () => {
  const gateDoc = await readRepoFile(
    "docs/mvp-a-onboarding-evidence-authorization-gate.md",
  );
  const normalizedGateDoc = gateDoc.replace(/\s+/gu, " ").trim();
  const requiredEvidenceSurfaces = [
    "transaction_request",
    "person",
    "employment",
    "assignment",
    "lifecycle_event",
    "audit_event",
    "okta_projection",
    "work_email_evidence",
  ];

  assertMvpAOnboardingEvidenceAuthorizationGate(
    mvpAOnboardingEvidenceAuthorizationGate,
  );

  assert.deepEqual(
    mvpAOnboardingEvidenceAuthorizationGate.classifications.map(
      (classification) => classification.evidenceSurface,
    ),
    requiredEvidenceSurfaces,
  );

  for (const evidenceSurface of requiredEvidenceSurfaces) {
    assert.match(gateDoc, new RegExp(`\\| ${evidenceSurface}\\s+\\|`, "u"));
  }

  assert.match(
    normalizedGateDoc,
    /Broad enterprise RBAC, PostgreSQL RLS as source of truth, production tenant roles, real HR user provisioning, and legal acceptance remain out of scope/u,
  );

  assert.throws(
    () =>
      assertMvpAOnboardingEvidenceAuthorizationGate({
        ...mvpAOnboardingEvidenceAuthorizationGate,
        classifications:
          mvpAOnboardingEvidenceAuthorizationGate.classifications.filter(
            (classification) =>
              classification.evidenceSurface !== "work_email_evidence",
          ),
      }),
    /MVP-A onboarding evidence authorization gate is missing work_email_evidence classification/u,
  );

  assert.throws(
    () =>
      assertMvpAOnboardingEvidenceAuthorizationGate(
        unsafeMvpAOnboardingEvidenceAuthorizationGate({
          ...mvpAOnboardingEvidenceAuthorizationGate,
          sourceAdr: "ADR 0000",
        }),
      ),
    /MVP-A onboarding evidence authorization gate must stay anchored to ADR 0011/u,
  );

  assert.throws(
    () =>
      assertMvpAOnboardingEvidenceAuthorizationGate(
        unsafeMvpAOnboardingEvidenceAuthorizationGate({
          ...mvpAOnboardingEvidenceAuthorizationGate,
          classifications: [
            ...mvpAOnboardingEvidenceAuthorizationGate.classifications,
            {
              evidenceSurface: "payroll_export",
              fieldScopes: ["person_identity"],
              dataScopes: ["same_person"],
              readiness: "mvp_a_poc_only",
              authorizationBoundary: "classified_evidence_only",
            },
          ],
        }),
      ),
    /MVP-A onboarding evidence authorization gate contains unsupported payroll_export classification/u,
  );

  assert.throws(
    () =>
      assertMvpAOnboardingEvidenceAuthorizationGate(
        unsafeMvpAOnboardingEvidenceAuthorizationGate({
          ...mvpAOnboardingEvidenceAuthorizationGate,
          classifications:
            mvpAOnboardingEvidenceAuthorizationGate.classifications.map(
              (classification) =>
                classification.evidenceSurface === "person"
                  ? {
                      ...classification,
                      fieldScopes: ["person_identity", "unreviewed_payload"],
                    }
                  : classification,
            ),
        }),
      ),
    /MVP-A onboarding evidence authorization gate person classification has unsupported unreviewed_payload field scope/u,
  );

  assert.throws(
    () =>
      assertMvpAOnboardingEvidenceAuthorizationGate(
        unsafeMvpAOnboardingEvidenceAuthorizationGate({
          ...mvpAOnboardingEvidenceAuthorizationGate,
          classifications:
            mvpAOnboardingEvidenceAuthorizationGate.classifications.map(
              (classification) =>
                classification.evidenceSurface === "person"
                  ? {
                      ...classification,
                      dataScopes: ["same_person", "cross_tenant"],
                    }
                  : classification,
            ),
        }),
      ),
    /MVP-A onboarding evidence authorization gate person classification has unsupported cross_tenant data scope/u,
  );
});
