import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  applySyntheticFutureDateHireJob,
  createSyntheticHireFixture,
  createSyntheticHireRequestFixture,
  saveSyntheticHireRequest,
} from "./synthetic-hire.js";
import { verifySyntheticP1R01CorrelationTrace } from "./p1-r01-traceability.js";
import {
  ingestSyntheticWorkEmailWriteback,
  refreshSyntheticWorkEmailFromProvider,
  resolveSyntheticWorkEmailConflict,
} from "./writeback-ingest.js";

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

test("EPIC-P1-R01 synthetic evidence is traceable from one correlation id", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture({
      employment: {
        startDate: "2026-06-01",
      },
      assignment: {
        startDate: "2026-06-01",
      },
      contactPoint: {
        createdAt: "2026-06-01T00:00:00Z",
      },
    });
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });
    const apply = {
      request,
      hire,
      lifecycleEvent: {
        id: "lifecycle-event-syn-hire-future-001",
        eventType: "hire" as const,
        effectiveDate: "2026-06-01",
        occurredAt: "2026-05-19T00:00:00Z",
      },
    };

    saveSyntheticHireRequest(db, request);
    applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:00:00Z",
        failAfterPreconditionsReason:
          "synthetic_post_precondition_apply_failure",
      },
      apply,
    });
    applySyntheticFutureDateHireJob(db, {
      job: {
        id: "future-date-apply-job-001-retry",
        correlationId: "correlation-syn-hire-001",
        observedAt: "2026-05-19T00:05:00Z",
      },
      apply,
    });
    ingestSyntheticWorkEmailWriteback(db, {
      eventId: "writeback-event-syn-hire-001",
      personId: "person-syn-hire-001",
      contactPointId: "contact-point-syn-hire-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "synthetic.hire.001@example.invalid",
      targetContactType: "work_email",
      correlationId: "correlation-syn-hire-001",
      receivedAt: "2026-05-19T00:06:00Z",
      pocMarker: "synthetic_poc",
    });
    db.prepare(
      `
        UPDATE contact_point
        SET value = 'hrcore.changed@example.invalid'
        WHERE id = 'contact-point-syn-hire-001'
          AND person_id = 'person-syn-hire-001'
      `,
    ).run();
    const conflictResult = refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-syn-hire-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-19T00:07:00Z",
    });
    assert.ok(conflictResult.conflict);
    resolveSyntheticWorkEmailConflict(db, {
      resolutionId: "resolution-syn-hire-provider-refresh-conflict-001",
      conflictId: conflictResult.conflict.conflictId,
      writebackEventId: "writeback-event-syn-hire-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      decision: "accept_provider_value",
      currentContactValue: "hrcore.changed@example.invalid",
      resolvedProviderValue: "provider.resolved@example.invalid",
      decidedAt: "2026-05-19T00:08:00Z",
      decidedBy: "synthetic-operator",
      correlationId:
        "correlation-syn-hire-001:resolution:provider-refresh-conflict-001",
    });
    refreshSyntheticWorkEmailFromProvider(db, {
      eventId: "writeback-event-syn-hire-001",
      providerName: "synthetic_okta",
      providerSubjectId: "synthetic-okta-user-001",
      providerValue: "provider.resolved@example.invalid",
      refreshedAt: "2026-05-19T00:09:00Z",
    });

    const trace = verifySyntheticP1R01CorrelationTrace(db, {
      correlationId: "correlation-syn-hire-001",
      requireLifecycle: true,
      requireFutureDateJob: true,
      requireWriteback: true,
      requiredAuditActions: [
        "poc.synthetic_hire.request_submitted",
        "poc.synthetic_hire.future_date_apply_failed",
        "poc.synthetic_hire.lifecycle_applied",
      ],
    });

    assert.deepEqual(trace.transactionRequest, {
      id: "transaction-request-syn-hire-001",
      personId: "person-syn-hire-001",
      requestType: "hire",
      statusCode: "completed",
      correlationId: "correlation-syn-hire-001",
    });
    assert.deepEqual(trace.lifecycleEvents, [
      {
        id: "lifecycle-event-syn-hire-future-001",
        transactionRequestId: "transaction-request-syn-hire-001",
        personId: "person-syn-hire-001",
        eventType: "hire",
      },
    ]);
    assert.deepEqual(trace.futureDateApplyFailures, [
      {
        jobId: "future-date-apply-job-001",
        transactionRequestId: "transaction-request-syn-hire-001",
        lifecycleEventId: "lifecycle-event-syn-hire-future-001",
        personId: "person-syn-hire-001",
        correlationId: "correlation-syn-hire-001",
        retryable: true,
      },
    ]);
    assert.deepEqual(trace.writebackEvents, [
      {
        eventId: "writeback-event-syn-hire-001",
        personId: "person-syn-hire-001",
        contactPointId: "contact-point-syn-hire-001",
        providerName: "synthetic_okta",
        providerSubjectId: "synthetic-okta-user-001",
        correlationId: "correlation-syn-hire-001",
      },
    ]);
    assert.deepEqual(
      trace.writebackConflicts.map((conflict) => ({
        writebackEventId: conflict.writebackEventId,
        conflictType: conflict.conflictType,
        correlationId: conflict.correlationId,
      })),
      [
        {
          writebackEventId: "writeback-event-syn-hire-001",
          conflictType: "provider_refresh_conflict",
          correlationId:
            "correlation-syn-hire-001:provider_refresh:2026-05-19T00%3A07%3A00Z:conflict:provider_refresh_conflict",
        },
      ],
    );
    assert.deepEqual(trace.writebackResolutions, [
      {
        id: "resolution-syn-hire-provider-refresh-conflict-001",
        conflictId: conflictResult.conflict.conflictId,
        writebackEventId: "writeback-event-syn-hire-001",
        correlationId:
          "correlation-syn-hire-001:resolution:provider-refresh-conflict-001",
      },
    ]);
    assert.deepEqual(trace.providerRefreshes, [
      {
        id: "synthetic-work-email-provider-refresh:writeback-event-syn-hire-001:2026-05-19T00%3A09%3A00Z",
        writebackEventId: "writeback-event-syn-hire-001",
        correlationId:
          "correlation-syn-hire-001:provider_refresh:2026-05-19T00%3A09%3A00Z",
      },
    ]);
    assert.deepEqual(
      trace.auditEvents.map((event) => event.action).sort(),
      [
        "poc.synthetic_hire.future_date_apply_failed",
        "poc.synthetic_hire.lifecycle_applied",
        "poc.synthetic_hire.request_submitted",
      ].sort(),
    );
    assert.deepEqual(trace.remainingRisk, [
      "PoC traceability is limited to synthetic SQLite evidence and mock Okta/writeback surfaces.",
      "Production audit immutability, WORM/object-lock storage, RBAC, raw payload access, CSV export, legal/two-key acceptance, and real provider integration remain out of scope.",
    ]);
  } finally {
    db.close();
  }
});

test("EPIC-P1-R01 traceability verifier fails closed when required writeback evidence is absent", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const hire = createSyntheticHireFixture();
    const request = createSyntheticHireRequestFixture({
      person: hire.person,
    });

    saveSyntheticHireRequest(db, request);

    assert.throws(
      () =>
        verifySyntheticP1R01CorrelationTrace(db, {
          correlationId: "correlation-syn-hire-001",
          requireLifecycle: false,
          requireFutureDateJob: false,
          requireWriteback: true,
          requiredAuditActions: ["poc.synthetic_hire.request_submitted"],
        }),
      /EPIC-P1-R01 trace requires writeback evidence for the correlation id/,
    );
  } finally {
    db.close();
  }
});

test("EPIC-P1-R01 traceability verifier fails closed when writeback person mismatches the transaction", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();
    saveSyntheticHireRequest(db, request);
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES ('person-syn-hire-other', 'Synthetic Hire Other', '2026-05-18T00:00:00Z')
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO contact_point (
          id,
          person_id,
          contact_type,
          value,
          is_primary,
          created_at
        )
        VALUES (
          'contact-point-syn-hire-other',
          'person-syn-hire-other',
          'work_email',
          'other@example.invalid',
          1,
          '2026-05-18T00:00:00Z'
        )
      `,
    ).run();
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
        VALUES (
          'writeback-event-syn-hire-other',
          'person-syn-hire-other',
          'contact-point-syn-hire-other',
          'synthetic_okta',
          'synthetic-okta-user-other',
          'other@example.invalid',
          'work_email',
          'correlation-syn-hire-001',
          '2026-05-19T00:06:00Z',
          'synthetic_poc'
        )
      `,
    ).run();

    assert.throws(
      () =>
        verifySyntheticP1R01CorrelationTrace(db, {
          correlationId: "correlation-syn-hire-001",
          requireLifecycle: false,
          requireFutureDateJob: false,
          requireWriteback: true,
          requiredAuditActions: ["poc.synthetic_hire.request_submitted"],
        }),
      /EPIC-P1-R01 trace writeback evidence must match the correlated transaction person/,
    );
  } finally {
    db.close();
  }
});

test("EPIC-P1-R01 traceability verifier excludes wildcard-prefix derived writeback evidence from other events", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture({
      transactionRequest: {
        correlationId: "correlation_syn_hire_001",
      },
    });
    saveSyntheticHireRequest(db, request);
    db.prepare(
      `
        INSERT INTO contact_point (
          id,
          person_id,
          contact_type,
          value,
          is_primary,
          created_at
        )
        VALUES (
          'contact-point-syn-hire-001',
          'person-syn-hire-001',
          'work_email',
          'synthetic.hire.001@example.invalid',
          1,
          '2026-05-18T00:00:00Z'
        )
      `,
    ).run();
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
        VALUES (
          'writeback-event-syn-hire-001',
          'person-syn-hire-001',
          'contact-point-syn-hire-001',
          'synthetic_okta',
          'synthetic-okta-user-001',
          'synthetic.hire.001@example.invalid',
          'work_email',
          'correlation_syn_hire_001',
          '2026-05-19T00:06:00Z',
          'synthetic_poc'
        )
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES ('person-syn-hire-other', 'Synthetic Hire Other', '2026-05-18T00:00:00Z')
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO contact_point (
          id,
          person_id,
          contact_type,
          value,
          is_primary,
          created_at
        )
        VALUES (
          'contact-point-syn-hire-other',
          'person-syn-hire-other',
          'work_email',
          'other@example.invalid',
          1,
          '2026-05-18T00:00:00Z'
        )
      `,
    ).run();
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
        VALUES (
          'writeback-event-syn-hire-other',
          'person-syn-hire-other',
          'contact-point-syn-hire-other',
          'synthetic_okta',
          'synthetic-okta-user-other',
          'other@example.invalid',
          'work_email',
          'correlationXsynXhireX001',
          '2026-05-19T00:07:00Z',
          'synthetic_poc'
        )
      `,
    ).run();
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
        VALUES (
          'provider-refresh-other',
          'writeback-event-syn-hire-other',
          'person-syn-hire-other',
          'contact-point-syn-hire-other',
          'synthetic_okta',
          'synthetic-okta-user-other',
          'other@example.invalid',
          '2026-05-19T00:08:00Z',
          'correlationXsynXhireX001:provider_refresh:other',
          'synthetic_poc'
        )
      `,
    ).run();
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
        VALUES (
          'writeback-conflict-other',
          'writeback-event-syn-hire-other',
          'person-syn-hire-other',
          'contact-point-syn-hire-other',
          'synthetic_okta',
          'synthetic-okta-user-other',
          'provider_refresh_conflict',
          'other@example.invalid',
          'other.updated@example.invalid',
          '2026-05-19T00:09:00Z',
          'correlationXsynXhireX001:provider_refresh:other:conflict',
          'synthetic_poc'
        )
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO writeback_work_email_conflict_resolution (
          id,
          conflict_id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          decision,
          current_contact_value,
          resolved_provider_value,
          decided_at,
          decided_by,
          correlation_id,
          poc_marker
        )
        VALUES (
          'writeback-resolution-other',
          'writeback-conflict-other',
          'writeback-event-syn-hire-other',
          'person-syn-hire-other',
          'contact-point-syn-hire-other',
          'synthetic_okta',
          'synthetic-okta-user-other',
          'accept_provider_value',
          'other@example.invalid',
          'other.updated@example.invalid',
          '2026-05-19T00:10:00Z',
          'synthetic-operator',
          'correlationXsynXhireX001:resolution:other',
          'synthetic_poc'
        )
      `,
    ).run();

    const trace = verifySyntheticP1R01CorrelationTrace(db, {
      correlationId: "correlation_syn_hire_001",
      requireLifecycle: false,
      requireFutureDateJob: false,
      requireWriteback: true,
      requiredAuditActions: ["poc.synthetic_hire.request_submitted"],
    });

    assert.deepEqual(trace.providerRefreshes, []);
    assert.deepEqual(trace.writebackConflicts, []);
    assert.deepEqual(trace.writebackResolutions, []);
  } finally {
    db.close();
  }
});

test("EPIC-P1-R01 traceability verifier fails closed when required audit action is not linked to traced subjects", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    const request = createSyntheticHireRequestFixture();
    saveSyntheticHireRequest(db, request);
    db.prepare(
      `
        INSERT INTO lifecycle_event (
          id,
          person_id,
          transaction_request_id,
          contact_point_id,
          event_type,
          effective_date,
          occurred_at
        )
        VALUES (
          'lifecycle-event-syn-hire-linked',
          'person-syn-hire-001',
          'transaction-request-syn-hire-001',
          NULL,
          'hire',
          '2026-06-01',
          '2026-05-19T00:00:00Z'
        )
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO audit_event (
          id,
          actor_id,
          action,
          subject_table,
          subject_id,
          occurred_at,
          correlation_id,
          poc_marker
        )
        VALUES (
          'audit-event-unlinked-lifecycle-applied',
          'synthetic-system',
          'poc.synthetic_hire.lifecycle_applied',
          'lifecycle_event',
          'lifecycle-event-syn-hire-unlinked',
          '2026-05-19T00:01:00Z',
          'correlation-syn-hire-001',
          'synthetic_poc'
        )
      `,
    ).run();

    assert.throws(
      () =>
        verifySyntheticP1R01CorrelationTrace(db, {
          correlationId: "correlation-syn-hire-001",
          requireLifecycle: true,
          requireFutureDateJob: false,
          requireWriteback: false,
          requiredAuditActions: ["poc.synthetic_hire.lifecycle_applied"],
        }),
      /EPIC-P1-R01 trace requires audit action poc\.synthetic_hire\.lifecycle_applied linked to traced evidence/,
    );
  } finally {
    db.close();
  }
});
