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

test("MVP-A approved onboarding apply commits HR Core skeleton records with evidence", async (t) => {
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

    assert.deepEqual(
      applyApprovedOnboardingTransactionRequest(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
      }),
      {
        personId: "person-onboarding-001",
        employmentId: "employment-onboarding-001",
        assignmentId: "assignment-onboarding-001",
        transactionRequestId: "transaction-request-onboarding-001",
        lifecycleEventId:
          "lifecycle-event-transaction-request-onboarding-001-apply",
        statusCode: "completed",
        correlationId: "correlation-onboarding-apply-001",
      },
    );

    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "completed" },
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, employment_code, status_code, start_date, end_date
              FROM employment
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "employment-onboarding-001",
          person_id: "person-onboarding-001",
          employment_code: "EMP-ONBOARDING-001",
          status_code: "active",
          start_date: "2026-06-01",
          end_date: null,
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, employment_id, assignment_code, organization_code, position_code, start_date, end_date
              FROM assignment
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-onboarding-001",
          person_id: "person-onboarding-001",
          employment_id: "employment-onboarding-001",
          assignment_code: "ASN-ONBOARDING-001",
          organization_code: "department-people-ops",
          position_code: "position-engineer-001",
          start_date: "2026-06-01",
          end_date: null,
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT id, person_id, transaction_request_id, event_type, effective_date, occurred_at
              FROM lifecycle_event
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          id: "lifecycle-event-transaction-request-onboarding-001-apply",
          person_id: "person-onboarding-001",
          transaction_request_id: "transaction-request-onboarding-001",
          event_type: "hire",
          effective_date: "2026-06-01",
          occurred_at: "2026-05-21T02:00:00Z",
        },
      ],
    );
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT actor_id, action, subject_table, subject_id, occurred_at, correlation_id
              FROM audit_event
              WHERE action = 'mvp_a.onboarding.apply'
              ORDER BY id
            `,
          )
          .all() as Record<string, unknown>[],
      ),
      [
        {
          actor_id: "operator-people-ops-apply-001",
          action: "mvp_a.onboarding.apply",
          subject_table: "lifecycle_event",
          subject_id:
            "lifecycle-event-transaction-request-onboarding-001-apply",
          occurred_at: "2026-05-21T02:00:00Z",
          correlation_id: "correlation-onboarding-apply-001",
        },
      ],
    );
  } finally {
    db.close();
  }
});

test("MVP-A approved onboarding apply retry is idempotent without duplicate durable effects", async (t) => {
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
    const apply = {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
    };

    const firstResult = applyApprovedOnboardingTransactionRequest(db, apply);
    const retryResult = applyApprovedOnboardingTransactionRequest(db, apply);

    assert.deepEqual(retryResult, firstResult);
    for (const tableName of ["employment", "assignment", "lifecycle_event"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get() as
            | Record<string, unknown>
            | undefined,
        ),
        { count: 1 },
        `${tableName} must not duplicate after apply retry`,
      );
    }
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM audit_event
              WHERE action = 'mvp_a.onboarding.apply'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 1 },
    );
  } finally {
    db.close();
  }
});

test("MVP-A approved onboarding apply projects a deterministic minimal Okta user", async (t) => {
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

    const capturedProjections: OktaMasteringProjection[] = [];
    const adapter = buildOktaMasteringAdapter({ mode: "mock" });
    const originalProject = adapter.project.bind(adapter);
    adapter.project = async (projection) => {
      capturedProjections.push(projection);
      return originalProject(projection);
    };

    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
        oktaAdapter: adapter,
      });

    assert.deepEqual(capturedProjections, [
      {
        operation: "create",
        desiredUser: {
          externalId: "synthetic-okta-user-person-onboarding-001",
          employeeNumber: "EMP-ONBOARDING-001",
          email: "onboarding.hire.001@example.invalid",
          displayName: "MVP-A Onboarding Hire One",
          givenName: "MVP-A",
          familyName: "Onboarding Hire One",
          status: "active",
          departmentCode: "department-people-ops",
          managerExternalId: "manager-001",
          effectiveAt: "2026-05-21T02:00:00Z",
        },
      },
    ]);
    assert.equal(result.oktaProjection.status, "projected");
    assert.deepEqual(result.oktaProjection.result, {
      outcome: "success",
      operation: "create",
      employeeNumber: "EMP-ONBOARDING-001",
      externalId: "synthetic-okta-user-person-onboarding-001",
      effectiveAt: "2026-05-21T02:00:00Z",
      metadata: {
        provider: "okta",
        adapterMode: "mock",
        projectionKey:
          "okta:mock:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z",
        synthetic: true,
      },
    });
    assert.deepEqual(result.workEmailWriteback, {
      status: "applied",
      eventId:
        "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      providerSubjectId: "synthetic-okta-user-person-onboarding-001",
      correlationId:
        "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z",
      refreshCorrelationId:
        "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T02%3A00%3A00Z",
    });
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT id, value
              FROM contact_point
              WHERE person_id = 'person-onboarding-001'
                AND contact_type = 'work_email'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        id: "contact-point-onboarding-001",
        value: "onboarding.hire.001@example.invalid",
      },
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

test("MVP-A approved onboarding apply keeps HR Core completed when Okta projection is retryable", async (t) => {
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

    const result =
      await applyApprovedOnboardingTransactionRequestWithOktaProjection(db, {
        transactionRequestId: "transaction-request-onboarding-001",
        appliedAt: "2026-05-21T02:00:00Z",
        appliedBy: "operator-people-ops-apply-001",
        correlationId: "correlation-onboarding-apply-001",
        oktaAdapter: buildOktaMasteringAdapter({
          mode: "mock",
          forcedFailures: {
            "EMP-ONBOARDING-001": {
              outcome: "retryable_failure",
              errorCode: "mock_rate_limited",
              message: "Synthetic retryable provider failure.",
              retryAfterSeconds: 60,
            },
          },
        }),
      });

    assert.equal(result.oktaProjection.status, "retryable_failure");
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "completed" },
      "provider failure must not roll back already-applied HR Core state",
    );
  } finally {
    db.close();
  }
});

test("MVP-A approved onboarding apply retry reads the records identified by the persisted payload", async (t) => {
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
    db.prepare(
      `
        INSERT INTO employment (
          id,
          person_id,
          employment_code,
          status_code,
          start_date,
          end_date
        )
        VALUES (
          'employment-onboarding-sibling',
          'person-onboarding-001',
          'EMP-ONBOARDING-SIBLING',
          'active',
          '2026-05-15',
          NULL
        )
      `,
    ).run();
    db.prepare(
      `
        INSERT INTO assignment (
          id,
          person_id,
          employment_id,
          assignment_code,
          organization_code,
          position_code,
          start_date,
          end_date
        )
        VALUES (
          'assignment-onboarding-sibling',
          'person-onboarding-001',
          'employment-onboarding-sibling',
          'ASN-ONBOARDING-SIBLING',
          'department-sibling',
          NULL,
          '2026-05-15',
          NULL
        )
      `,
    ).run();
    const apply = {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
    };

    const firstResult = applyApprovedOnboardingTransactionRequest(db, apply);
    const retryResult = applyApprovedOnboardingTransactionRequest(db, apply);

    assert.deepEqual(retryResult, firstResult);
  } finally {
    db.close();
  }
});

test("MVP-A onboarding apply revalidates persisted payload date invariants without mutation", async (t) => {
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
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = ?
        WHERE id = 'transaction-request-onboarding-001'
      `,
    ).run(
      JSON.stringify({
        tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
        effectiveDate: "2026-06-01",
        employment: {
          id: "employment-onboarding-001",
          employmentCode: "EMP-ONBOARDING-001",
          startDate: "2026-06-02",
        },
        assignment: {
          id: "assignment-onboarding-001",
          assignmentCode: "ASN-ONBOARDING-001",
          departmentReference: "department-people-ops",
          legalEntityReference: "legal-entity-jp-001",
          managerReference: "manager-001",
          positionCode: "position-engineer-001",
        },
        workEmailExpectation: {
          contactPointId: "contact-point-onboarding-001",
          value: "onboarding.hire.001@example.invalid",
        },
      }),
    );

    assert.throws(
      () =>
        applyApprovedOnboardingTransactionRequest(db, {
          transactionRequestId: "transaction-request-onboarding-001",
          appliedAt: "2026-05-21T02:00:00Z",
          appliedBy: "operator-people-ops-apply-001",
          correlationId: "correlation-onboarding-apply-001",
        }),
      /persisted onboarding apply payload violates date invariants/,
    );

    for (const tableName of ["employment", "assignment", "lifecycle_event"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get() as
            | Record<string, unknown>
            | undefined,
        ),
        { count: 0 },
        `${tableName} must remain empty after rejected persisted payload`,
      );
    }
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "approved" },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding apply classifies persisted payload parse failures as server-side errors", async (t) => {
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
    db.prepare(
      `
        UPDATE transaction_request
        SET payload_json = '{'
        WHERE id = 'transaction-request-onboarding-001'
      `,
    ).run();

    assert.throws(
      () =>
        applyApprovedOnboardingTransactionRequest(db, {
          transactionRequestId: "transaction-request-onboarding-001",
          appliedAt: "2026-05-21T02:00:00Z",
          appliedBy: "operator-people-ops-apply-001",
          correlationId: "correlation-onboarding-apply-001",
        }),
      (error) =>
        error instanceof Error &&
        !(error instanceof OnboardingTransactionRequestValidationError) &&
        error.message === "persisted onboarding apply payload is malformed",
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding apply rejects unapproved requests without mutation", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveOnboardingTransactionRequest(
      db,
      createOnboardingTransactionRequestFixture(),
    );

    assert.throws(
      () =>
        applyApprovedOnboardingTransactionRequest(db, {
          transactionRequestId: "transaction-request-onboarding-001",
          appliedAt: "2026-05-21T02:00:00Z",
          appliedBy: "operator-people-ops-apply-001",
          correlationId: "correlation-onboarding-apply-001",
        }),
      /approved onboarding apply requires an approved hire transaction request/,
    );

    for (const tableName of [
      "employment",
      "assignment",
      "lifecycle_event",
      "audit_event",
    ]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get() as
            | Record<string, unknown>
            | undefined,
        ),
        { count: 0 },
        `${tableName} must remain empty after rejected apply`,
      );
    }
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "submitted" },
    );
  } finally {
    db.close();
  }
});

test("MVP-A onboarding apply rolls back HR Core writes when audit evidence fails", async (t) => {
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
    const auditFailureDb: OnboardingTransactionRequestDatabase = {
      exec: db.exec.bind(db),
      prepare(sql) {
        const statement = db.prepare(sql);
        return {
          get(...values) {
            return statement.get(...values) as
              | Record<string, unknown>
              | undefined;
          },
          run(...values) {
            if (
              sql.includes("INSERT INTO audit_event") &&
              sql.includes("'mvp_a.onboarding.apply'")
            ) {
              throw new Error("synthetic audit write failure");
            }

            return statement.run(...values);
          },
        };
      },
    };

    assert.throws(
      () =>
        applyApprovedOnboardingTransactionRequest(auditFailureDb, {
          transactionRequestId: "transaction-request-onboarding-001",
          appliedAt: "2026-05-21T02:00:00Z",
          appliedBy: "operator-people-ops-apply-001",
          correlationId: "correlation-onboarding-apply-001",
        }),
      /synthetic audit write failure/,
    );

    for (const tableName of ["employment", "assignment", "lifecycle_event"]) {
      assert.deepEqual(
        normalizeRow(
          db.prepare(`SELECT count(*) AS count FROM ${tableName}`).get() as
            | Record<string, unknown>
            | undefined,
        ),
        { count: 0 },
        `${tableName} must roll back after apply audit failure`,
      );
    }
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-onboarding-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "approved" },
    );
  } finally {
    db.close();
  }
});
