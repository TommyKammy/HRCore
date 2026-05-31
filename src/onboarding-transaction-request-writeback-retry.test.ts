import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  type OktaMasteringProjection,
  type OktaMasteringProjectionResult,
} from "./okta-mastering-adapter.js";
import { ingestSyntheticWorkEmailWriteback } from "./writeback-ingest.js";

import {
  applyApprovedOnboardingTransactionRequest,
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  applyDueOnboardingTransactionRequests,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveEditableOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import {
  createOnboardingTransactionRequestFixture as createOnboardingTransactionRequestFixtureFromContract,
  parseOnboardingTransactionRequestInput as parseOnboardingTransactionRequestInputFromContract,
} from "./onboarding-transaction-request-contract.js";
import { saveOnboardingTransactionRequest as saveOnboardingTransactionRequestFromPersistence } from "./onboarding-transaction-request-persistence.js";
import { decideOnboardingTransactionRequest as decideOnboardingTransactionRequestFromApproval } from "./onboarding-transaction-request-approval.js";
import { applyApprovedOnboardingTransactionRequest as applyApprovedOnboardingTransactionRequestFromApply } from "./onboarding-transaction-request-apply.js";
import { applyDueOnboardingTransactionRequests as applyDueOnboardingTransactionRequestsFromWorker } from "./onboarding-transaction-request-worker.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
  readRepoFile,
} from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-A onboarding work email writeback retries when Okta projection is already applied", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalEmit = adapter.emitWorkEmailWriteback.bind(adapter);
    let failWritebackEmission = true;
    adapter.emitWorkEmailWriteback = async (input) => {
      if (failWritebackEmission) {
        throw new Error("Synthetic transient writeback dispatch failure.");
      }

      return originalEmit(input);
    };
    const input = {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
      oktaAdapter: adapter,
    };

    const firstResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );
    failWritebackEmission = false;
    const retryResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );

    assert.equal(firstResult.oktaProjection.status, "projected");
    assert.equal(firstResult.workEmailWriteback.status, "failed");
    assert.equal(retryResult.oktaProjection.status, "already_projected");
    assert.equal(retryResult.workEmailWriteback.status, "applied");
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = ?
            `,
          )
          .get(retryResult.workEmailWriteback.eventId ?? "") as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding writeback reuses raced duplicate event evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });

    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalEmit = adapter.emitWorkEmailWriteback.bind(adapter);
    let duplicateIngested = false;
    adapter.emitWorkEmailWriteback = async (input) => {
      const event = await originalEmit(input);
      if (!duplicateIngested) {
        duplicateIngested = true;
        ingestSyntheticWorkEmailWriteback(db, event.payload);
      }

      return event;
    };

    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
        oktaAdapter: adapter,
      });

    assert.equal(result.workEmailWriteback.status, "applied");
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM writeback_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = ?
            `,
          )
          .get(result.workEmailWriteback.eventId ?? "") as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A approved onboarding apply Okta projection retry reuses writeback evidence after success", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalRefresh = adapter.refreshWorkEmailWriteback.bind(adapter);
    let refreshProviderValue = "provider.changed@example.invalid";
    adapter.refreshWorkEmailWriteback = async (refreshInput) => {
      const refresh = await originalRefresh(refreshInput);
      return {
        ...refresh,
        providerValue: refreshProviderValue,
      };
    };
    const input = {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
      oktaAdapter: adapter,
    };

    const firstResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );
    refreshProviderValue = "retry.should.not.refresh@example.invalid";
    adapter.emitWorkEmailWriteback = async () => {
      throw new Error("retry must reuse persisted writeback evidence");
    };
    adapter.refreshWorkEmailWriteback = async () => {
      throw new Error("retry must reuse persisted refresh evidence");
    };
    const retryResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );

    assert.equal(firstResult.oktaProjection.status, "projected");
    assert.equal(retryResult.oktaProjection.status, "already_projected");
    assert.equal(firstResult.workEmailWriteback.status, "applied");
    assert.deepEqual(
      retryResult.workEmailWriteback,
      firstResult.workEmailWriteback,
    );
    assert.equal(
      (retryResult.oktaProjection.result as OktaMasteringProjectionResult)
        .outcome,
      "skipped",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_event
              WHERE person_id = 'person-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
              WHERE writeback_event_id = ?
            `,
          )
          .get(firstResult.workEmailWriteback.eventId ?? "") as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT provider_value
              FROM writeback_provider_refresh
              WHERE writeback_event_id = ?
            `,
          )
          .get(firstResult.workEmailWriteback.eventId ?? "") as
          | Record<string, unknown>
          | undefined,
      ),
      { provider_value: "provider.changed@example.invalid" },
    );
  } finally {
    db.close();
  }
});

test("MVP-A approved onboarding retry uses projection provider subject for writeback evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    const providerSubjectId = "okta-user-existing-onboarding-001";
    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalProject = adapter.project.bind(adapter);
    const originalEmit = adapter.emitWorkEmailWriteback.bind(adapter);
    adapter.project = async (projection) => {
      const result = await originalProject(projection);
      if (
        result.outcome === "skipped" &&
        result.operation === "create" &&
        result.reason === "already_exists"
      ) {
        return {
          ...result,
          externalId: providerSubjectId,
        };
      }

      return result;
    };
    adapter.emitWorkEmailWriteback = async (input) => {
      const event = await originalEmit(input);
      return {
        ...event,
        payload: {
          ...event.payload,
          providerSubjectId,
        },
      };
    };
    adapter.refreshWorkEmailWriteback = async (input) => ({
      providerName: "synthetic_okta",
      providerSubjectId: input.providerSubjectId,
      providerValue: "onboarding.hire.001@example.invalid",
      refreshedAt: input.refreshedAt,
      metadata: {
        provider: "okta",
        adapterMode: "mock",
        eventType: "work_email_refresh",
        projectionKey: input.projectionEvidence.projectionKey,
        synthetic: true,
      },
    });
    const input = {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
      oktaAdapter: adapter,
    };

    const firstResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );
    adapter.emitWorkEmailWriteback = async () => {
      throw new Error("retry must reuse adapter-subject writeback evidence");
    };
    adapter.refreshWorkEmailWriteback = async () => {
      throw new Error("retry must reuse adapter-subject refresh evidence");
    };
    const retryResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );

    assert.equal(firstResult.workEmailWriteback.status, "applied");
    assert.equal(
      firstResult.workEmailWriteback.providerSubjectId,
      providerSubjectId,
    );
    assert.equal(retryResult.oktaProjection.status, "already_projected");
    assert.deepEqual(
      retryResult.workEmailWriteback,
      firstResult.workEmailWriteback,
    );
  } finally {
    db.close();
  }
});

test("MVP-A approved onboarding apply Okta projection retry reuses provider refresh conflict evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalRefresh = adapter.refreshWorkEmailWriteback.bind(adapter);
    let createRefreshConflict = true;
    adapter.refreshWorkEmailWriteback = async (refreshInput) => {
      if (!createRefreshConflict) {
        throw new Error("retry must reuse persisted refresh conflict evidence");
      }

      db.prepare(
        `
          UPDATE contact_point
          SET value = 'manual.refresh.conflict@example.invalid'
          WHERE id = 'contact-point-onboarding-001'
        `,
      ).run();

      const refresh = await originalRefresh(refreshInput);
      return {
        ...refresh,
        providerValue: "provider.refresh.conflict@example.invalid",
      };
    };
    const input = {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
      oktaAdapter: adapter,
    };

    const firstResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );
    db.prepare(
      `
        INSERT INTO writeback_work_email_conflict (
          rowid,
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    ).run(
      -1,
      "synthetic-work-email-conflict:onboarding-unrelated-refresh-conflict",
      firstResult.workEmailWriteback.eventId ?? "",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      firstResult.workEmailWriteback.providerSubjectId ?? "",
      "provider_refresh_conflict",
      "unrelated.current@example.invalid",
      "unrelated.provider@example.invalid",
      "2026-05-21T01:59:00Z",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T01%3A59%3A00Z:conflict:provider_refresh_conflict",
    );
    createRefreshConflict = false;
    adapter.emitWorkEmailWriteback = async () => {
      throw new Error("retry must reuse persisted writeback evidence");
    };
    const retryResult =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(
        db,
        input,
      );

    assert.equal(firstResult.oktaProjection.status, "projected");
    assert.equal(firstResult.workEmailWriteback.status, "conflict");
    assert.equal(
      firstResult.workEmailWriteback.conflict?.conflictType,
      "provider_refresh_conflict",
    );
    assert.equal(retryResult.oktaProjection.status, "already_projected");
    assert.deepEqual(
      retryResult.workEmailWriteback,
      firstResult.workEmailWriteback,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_event
              WHERE person_id = 'person-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_work_email_conflict
              WHERE writeback_event_id = ?
                AND conflict_type = 'provider_refresh_conflict'
                AND id = ?
            `,
          )
          .get(
            firstResult.workEmailWriteback.eventId ?? "",
            firstResult.workEmailWriteback.conflict?.conflictId ?? "",
          ) as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding work email writeback keeps manual conflict evidence without overwrite", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
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
      correlationId: "correlation-onboarding-approval-001",
    });

    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
        oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
      });

    assert.equal(result.workEmailWriteback.status, "conflict");
    assert.equal(
      result.workEmailWriteback.conflict?.conflictType,
      "inbound_value_conflict",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE id = 'contact-point-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { value: "manual.override@example.invalid" },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding work email writeback reports provider refresh failure after event evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    adapter.refreshWorkEmailWriteback = async () => {
      throw new Error("synthetic provider refresh unavailable");
    };

    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
        oktaAdapter: adapter,
      });

    assert.deepEqual(
      {
        status: result.workEmailWriteback.status,
        errorMessage: result.workEmailWriteback.errorMessage,
      },
      {
        status: "refresh_failed",
        errorMessage: "synthetic provider refresh unavailable",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_event
              WHERE person_id = 'person-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_provider_refresh
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding work email writeback rejects stale emitted events without overwrite", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
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
        'newer.accepted@example.invalid',
        1,
        '2026-05-21T01:40:00Z'
      );

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
        'writeback-event-onboarding-newer',
        'person-onboarding-001',
        'contact-point-onboarding-001',
        'synthetic_okta',
        'synthetic-okta-user-person-onboarding-001',
        'newer.accepted@example.invalid',
        'work_email',
        'correlation-onboarding-writeback-newer',
        '2026-05-21T01:45:00Z',
        'synthetic_poc'
      );
    `);
    decideOnboardingTransactionRequest(db, {
      transactionRequestId: "transaction-request-onboarding-001",
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    });
    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalEmit = adapter.emitWorkEmailWriteback.bind(adapter);
    adapter.emitWorkEmailWriteback = async (input) => {
      const event = await originalEmit(input);
      return {
        ...event,
        payload: {
          ...event.payload,
          eventId: "writeback-event-onboarding-stale",
          correlationId: "correlation-onboarding-writeback-stale",
          receivedAt: "2026-05-21T01:30:00Z",
        },
      };
    };

    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
        oktaAdapter: adapter,
      });

    assert.deepEqual(
      {
        status: result.workEmailWriteback.status,
        errorMessage: result.workEmailWriteback.errorMessage,
      },
      {
        status: "failed",
        errorMessage:
          "writeback event must not be older than the latest accepted event for the contact point",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT value
              FROM contact_point
              WHERE id = 'contact-point-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { value: "newer.accepted@example.invalid" },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM writeback_event
              WHERE id = 'writeback-event-onboarding-stale'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
    );
  } finally {
    db.close();
  }
});
