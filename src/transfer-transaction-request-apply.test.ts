import assert from "node:assert/strict";
import test from "node:test";

import {
  applyApprovedTransferTransactionRequest,
  applyApprovedTransferTransactionRequestWithOktaProjection,
  createTransferTransactionRequestFixture,
  decideTransferTransactionRequest,
  saveTransferTransactionRequest,
} from "./transfer-transaction-request.js";
import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
} from "./okta-mastering-adapter.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
} from "./test-helpers/database.js";

test("MVP-B transfer apply closes the current assignment and records deterministic assignment-change evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
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
          'employment-transfer-001',
          'person-transfer-001',
          'EMP-TRANSFER-001',
          'active',
          '2026-06-01',
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
          'assignment-current-transfer-001',
          'person-transfer-001',
          'employment-transfer-001',
          'ASN-CURRENT-TRANSFER-001',
          'department-platform',
          'position-engineer-001',
          '2026-06-01',
          NULL
        )
      `,
    ).run();
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    const applyInput = {
      transactionRequestId: "transaction-request-transfer-001",
      appliedAt: "2026-06-15T02:00:00Z",
      appliedBy: "operator-people-ops-transfer-apply-001",
      correlationId: "correlation-transfer-apply-001",
    };
    const result = applyApprovedTransferTransactionRequest(db, applyInput);
    const retryResult = applyApprovedTransferTransactionRequest(db, applyInput);

    assert.deepEqual(retryResult, result);
    assert.deepEqual(result, {
      personId: "person-transfer-001",
      employmentId: "employment-transfer-001",
      closedAssignmentId: "assignment-current-transfer-001",
      targetAssignmentId:
        "assignment-transaction-request-transfer-001-transfer-target",
      transactionRequestId: "transaction-request-transfer-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-transfer-001-apply",
      statusCode: "completed",
      correlationId: "correlation-transfer-apply-001",
    });
    assert.deepEqual(
      normalizeRows(
        db
          .prepare(
            `
              SELECT
                id,
                assignment_code,
                organization_code,
                position_code,
                start_date,
                end_date
              FROM assignment
              WHERE person_id = 'person-transfer-001'
              ORDER BY start_date, id
            `,
          )
          .all?.() as Record<string, unknown>[],
      ),
      [
        {
          id: "assignment-current-transfer-001",
          assignment_code: "ASN-CURRENT-TRANSFER-001",
          organization_code: "department-platform",
          position_code: "position-engineer-001",
          start_date: "2026-06-01",
          end_date: "2026-06-30",
        },
        {
          id: "assignment-transaction-request-transfer-001-transfer-target",
          assignment_code: "ASN-CURRENT-TRANSFER-001-XFER-20260701",
          organization_code: "organization-engineering",
          position_code: "position-staff-engineer-001",
          start_date: "2026-07-01",
          end_date: null,
        },
      ],
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT
                transaction_request.status_code,
                lifecycle_event.event_type,
                lifecycle_event.effective_date,
                audit_event.action,
                audit_event.subject_table,
                audit_event.subject_id,
                audit_event.correlation_id
              FROM transaction_request
              JOIN lifecycle_event
                ON lifecycle_event.transaction_request_id = transaction_request.id
              JOIN audit_event
                ON audit_event.subject_id = lifecycle_event.id
              WHERE transaction_request.id = 'transaction-request-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      {
        status_code: "completed",
        event_type: "assignment_change",
        effective_date: "2026-07-01",
        action: "mvp_b.transfer.apply",
        subject_table: "lifecycle_event",
        subject_id: "lifecycle-event-transaction-request-transfer-001-apply",
        correlation_id: "correlation-transfer-apply-001",
      },
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 2 },
      "idempotent transfer apply must not duplicate decision or apply audit evidence",
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer apply records deterministic mock Okta profile and non-authoritative group projection impact evidence", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
    seedOpenTransferAssignment(db);
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    const oktaAdapter = buildOktaMasteringAdapter({
      mode: "mock",
      initialUsers: [
        createSyntheticOktaUserFixture({
          externalId: "synthetic-okta-user-person-transfer-001",
          employeeNumber: "EMP-TRANSFER-001",
          email: "mvp-b-transfer-one@example.invalid",
          displayName: "MVP-B Transfer One",
          givenName: "MVP-B",
          familyName: "Transfer One",
          status: "active",
          departmentCode: "department-platform",
          managerExternalId: "manager-platform-001",
          effectiveAt: "2026-06-01T00:00:00Z",
        }),
      ],
      initialGroups: [
        {
          externalId: "synthetic-okta-group-organization-engineering",
          groupKey: "ORG-organization-engineering",
          displayName: "Synthetic Organization Engineering",
          purpose: "poc_identity_lifecycle_membership",
          effectiveAt: "2026-06-01T00:00:00Z",
        },
        {
          externalId: "synthetic-okta-group-department-product",
          groupKey: "DEPT-department-product",
          displayName: "Synthetic Department Product",
          purpose: "poc_identity_lifecycle_membership",
          effectiveAt: "2026-06-01T00:00:00Z",
        },
      ],
    });

    const applyInput = {
      transactionRequestId: "transaction-request-transfer-001",
      appliedAt: "2026-06-15T02:00:00Z",
      appliedBy: "operator-people-ops-transfer-apply-001",
      correlationId: "correlation-transfer-apply-001",
      oktaAdapter,
    };
    const result =
      await applyApprovedTransferTransactionRequestWithOktaProjection(
        db,
        applyInput,
      );
    const retryResult =
      await applyApprovedTransferTransactionRequestWithOktaProjection(
        db,
        applyInput,
      );

    assert.deepEqual(
      {
        ...retryResult,
        oktaProjection: undefined,
      },
      {
        ...result,
        oktaProjection: undefined,
      },
    );
    assert.equal(
      retryResult.oktaProjection.groups.status,
      "already_projected",
      "same-correlation retry should expose deterministic no-op group evidence",
    );
    assert.deepEqual(result.oktaProjection, {
      provider: "okta",
      adapterMode: "mock",
      synthetic: true,
      authoritativeForRbac: false,
      transactionRequestId: "transaction-request-transfer-001",
      lifecycleEventId:
        "lifecycle-event-transaction-request-transfer-001-apply",
      applyCorrelationId: "correlation-transfer-apply-001",
      profile: {
        status: "projected",
        result: {
          outcome: "success",
          operation: "update",
          employeeNumber: "EMP-TRANSFER-001",
          externalId: "synthetic-okta-user-person-transfer-001",
          effectiveAt: "2026-06-15T02:00:00Z",
          metadata: {
            provider: "okta",
            adapterMode: "mock",
            projectionKey:
              "okta:mock:update:EMP-TRANSFER-001:2026-06-15T02%3A00%3A00Z",
            synthetic: true,
          },
        },
      },
      groups: {
        status: "projected",
        result: {
          outcome: "success",
          operation: "replace_user_groups",
          employeeNumber: "EMP-TRANSFER-001",
          groupKeys: [
            "DEPT-department-product",
            "ORG-organization-engineering",
          ],
          effectiveAt: "2026-06-15T02:00:00Z",
          metadata: {
            provider: "okta",
            adapterMode: "mock",
            projectionKey:
              "okta:mock:replace_user_groups:EMP-TRANSFER-001:%5B%22DEPT-department-product%22%2C%22ORG-organization-engineering%22%5D:2026-06-15T02%3A00%3A00Z",
            synthetic: true,
          },
        },
      },
    });
    assert.deepEqual(
      await oktaAdapter.refreshWorkEmailWriteback({
        providerSubjectId: "synthetic-okta-user-person-transfer-001",
        refreshedAt: "2026-06-15T02:05:00Z",
        projectionEvidence: result.oktaProjection.profile.result.metadata,
      }),
      {
        providerName: "synthetic_okta",
        providerSubjectId: "synthetic-okta-user-person-transfer-001",
        providerValue: "mvp-b-transfer-one@example.invalid",
        refreshedAt: "2026-06-15T02:05:00Z",
        metadata: {
          provider: "okta",
          adapterMode: "mock",
          eventType: "work_email_refresh",
          projectionKey:
            "okta:mock:update:EMP-TRANSFER-001:2026-06-15T02%3A00%3A00Z",
          synthetic: true,
        },
      },
      "transfer profile projection must preserve the existing provider email",
    );
  } finally {
    db.close();
  }
});

test("MVP-B transfer Okta impact skips groups after non-successful profile projection outcomes", async (t) => {
  for (const projectionCase of [
    {
      name: "missing profile user",
      forcedFailures: undefined,
      expectedProfileStatus: "skipped",
      expectedOutcome: "skipped",
    },
    {
      name: "retryable profile projection",
      forcedFailures: {
        "EMP-TRANSFER-001": {
          outcome: "retryable_failure",
          errorCode: "mock_retryable_timeout",
          message: "Synthetic retryable Okta timeout.",
          retryAfterSeconds: 30,
        },
      },
      expectedProfileStatus: "retryable_failure",
      expectedOutcome: "retryable_failure",
    },
    {
      name: "permanent profile projection",
      forcedFailures: {
        "EMP-TRANSFER-001": {
          outcome: "permanent_failure",
          errorCode: "mock_permanent_profile_rejected",
          message: "Synthetic permanent Okta profile rejection.",
        },
      },
      expectedProfileStatus: "failed",
      expectedOutcome: "permanent_failure",
    },
  ] as const) {
    await t.test(projectionCase.name, async (t) => {
      const db = await openSchemaBackedDatabase(t);
      if (!db) return;

      try {
        saveTransferTransactionRequest(
          db,
          createTransferTransactionRequestFixture(),
        );
        seedOpenTransferAssignment(db);
        decideTransferTransactionRequest(db, {
          transactionRequestId: "transaction-request-transfer-001",
          decision: "approve",
          decidedAt: "2026-06-15T01:00:00Z",
          decidedBy: "operator-people-ops-transfer-001",
          correlationId: "correlation-transfer-approval-001",
        });

        const result =
          await applyApprovedTransferTransactionRequestWithOktaProjection(db, {
            transactionRequestId: "transaction-request-transfer-001",
            appliedAt: "2026-06-15T02:00:00Z",
            appliedBy: "operator-people-ops-transfer-apply-001",
            correlationId: "correlation-transfer-apply-001",
            oktaAdapter: buildOktaMasteringAdapter({
              mode: "mock",
              forcedFailures: projectionCase.forcedFailures,
            }),
          });

        assert.equal(
          result.oktaProjection.profile.status,
          projectionCase.expectedProfileStatus,
        );
        assert.equal(
          result.oktaProjection.profile.result.outcome,
          projectionCase.expectedOutcome,
        );
        assert.deepEqual(result.oktaProjection.groups, {
          status: "skipped",
          skippedReason: "profile_projection_not_successful",
        });
        assert.equal(result.statusCode, "completed");
      } finally {
        db.close();
      }
    });
  }
});

test("MVP-B transfer apply fails closed when a future assignment would overlap the open target assignment", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) return;

  try {
    saveTransferTransactionRequest(
      db,
      createTransferTransactionRequestFixture(),
    );
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
          'employment-transfer-001',
          'person-transfer-001',
          'EMP-TRANSFER-001',
          'active',
          '2026-06-01',
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
        VALUES
          (
            'assignment-current-transfer-001',
            'person-transfer-001',
            'employment-transfer-001',
            'ASN-CURRENT-TRANSFER-001',
            'department-platform',
            'position-engineer-001',
            '2026-06-01',
            NULL
          ),
          (
            'assignment-overlap-transfer-001',
            'person-transfer-001',
            'employment-transfer-001',
            'ASN-OVERLAP-TRANSFER-001',
            'department-shadow',
            'position-engineer-002',
            '2026-08-01',
            NULL
          )
      `,
    ).run();
    decideTransferTransactionRequest(db, {
      transactionRequestId: "transaction-request-transfer-001",
      decision: "approve",
      decidedAt: "2026-06-15T01:00:00Z",
      decidedBy: "operator-people-ops-transfer-001",
      correlationId: "correlation-transfer-approval-001",
    });

    assert.throws(
      () =>
        applyApprovedTransferTransactionRequest(db, {
          transactionRequestId: "transaction-request-transfer-001",
          appliedAt: "2026-06-15T02:00:00Z",
          appliedBy: "operator-people-ops-transfer-apply-001",
          correlationId: "correlation-transfer-apply-001",
        }),
      /approved transfer apply detected overlapping assignment effective dates/,
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT status_code
              FROM transaction_request
              WHERE id = 'transaction-request-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { status_code: "approved" },
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT end_date
              FROM assignment
              WHERE id = 'assignment-current-transfer-001'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { end_date: null },
      "rejected transfer apply must not close the current assignment",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM assignment
              WHERE id = 'assignment-transaction-request-transfer-001-transfer-target'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected transfer apply must not create target assignment evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db
          .prepare(
            `
              SELECT count(*) AS count
              FROM lifecycle_event
              WHERE transaction_request_id = 'transaction-request-transfer-001'
                AND event_type = 'assignment_change'
            `,
          )
          .get() as Record<string, unknown> | undefined,
      ),
      { count: 0 },
      "rejected transfer apply must not create assignment-change lifecycle evidence",
    );
    assert.deepEqual(
      normalizeRow(
        db.prepare("SELECT count(*) AS count FROM audit_event").get() as
          | Record<string, unknown>
          | undefined,
      ),
      { count: 1 },
      "rejected transfer apply must preserve only the approval audit evidence",
    );
  } finally {
    db.close();
  }
});

function seedOpenTransferAssignment(
  db: NonNullable<Awaited<ReturnType<typeof openSchemaBackedDatabase>>>,
): void {
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
        'employment-transfer-001',
        'person-transfer-001',
        'EMP-TRANSFER-001',
        'active',
        '2026-06-01',
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
        'assignment-current-transfer-001',
        'person-transfer-001',
        'employment-transfer-001',
        'ASN-CURRENT-TRANSFER-001',
        'department-platform',
        'position-engineer-001',
        '2026-06-01',
        NULL
      )
    `,
  ).run();
}
