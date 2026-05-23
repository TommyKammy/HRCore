import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { buildOktaMasteringAdapter } from "./okta-mastering-adapter.js";
import {
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
} from "./onboarding-transaction-request.js";
import { verifyMvpAOnboardingCorrelationTrace } from "./mvp-a-onboarding-traceability.js";

const readRepoFile = (path: string): Promise<string> =>
  readFile(join(process.cwd(), path), "utf8");

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
