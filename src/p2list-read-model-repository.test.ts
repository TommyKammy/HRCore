import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import type { OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request-types.js";
import { P2ListCursorManager } from "./p2list-cursor.js";
import {
  createP2ListEmployeeFixtureRows,
  createP2ListFixtureManifest,
  createP2ListLifecycleFixtureRows,
  type P2ListEmployeeFixtureRow,
  type P2ListLifecycleFixtureRow,
} from "./p2list-read-model-fixtures.js";
import {
  P2ListReadModelRepository,
  type P2ListEmployeeAppliedFilters,
  type P2ListEmployeeItem,
  type P2ListLifecycleFilters,
  type P2ListLifecycleItem,
  type P2ListPage,
} from "./p2list-read-model-repository.js";
import {
  P2ListReadModelError,
  signP2ListSyntheticDatasetManifest,
  verifyP2ListSyntheticDatasetManifest,
  type P2ListActorContext,
  type P2ListSource,
} from "./p2list-read-model-types.js";
import { p2ListPermissions } from "./p2list-contract.js";

const manifestSecret =
  "p2list-manifest-local-fixture-secret-2026-at-least-32-bytes";
const cursorSecret =
  "p2list-cursor-local-fixture-secret-2026-at-least-32-bytes";
const acceptedAt = "2026-07-24T02:30:00.000Z";
const employeeActor: P2ListActorContext = {
  actorId: "actor-hr-operator",
  tenantId: "tenant-repo-owned-synthetic",
  permissions: [p2ListPermissions.employeeListRead],
  dataScope: { organizationCodes: ["ORG-SYNTHETIC"] },
};
const lifecycleActor: P2ListActorContext = {
  actorId: "actor-hr-support",
  tenantId: "tenant-repo-owned-synthetic",
  permissions: [
    p2ListPermissions.lifecycleRequestListRead,
    p2ListPermissions.supportCorrelationRead,
  ],
  dataScope: {
    organizationCodes: [
      "ORG-ONBOARDING",
      "ORG-CHANGE",
      "ORG-TRANSFER",
      "ORG-TERMINATION",
      "ORG-LIFECYCLE-SYNTHETIC",
    ],
  },
};
type EmployeePage = P2ListPage<
  P2ListEmployeeItem,
  P2ListEmployeeAppliedFilters
>;
type LifecyclePage = P2ListPage<P2ListLifecycleItem, P2ListLifecycleFilters>;

test("P2LIST synthetic manifest verification rejects tampering and duplicate source bindings", () => {
  const rows = createP2ListEmployeeFixtureRows(1);
  const manifest = createP2ListFixtureManifest(
    {
      datasetReference: "fixture-manifest-verification",
      employees: rows,
    },
    manifestSecret,
  );
  const verified = verifyP2ListSyntheticDatasetManifest(
    manifest,
    manifestSecret,
  );
  assert.equal(verified.datasetReference, "fixture-manifest-verification");
  assert.equal(verified.has("person", rows[0]!.personId), true);
  assert.equal(verified.has("transaction_request", "unknown"), false);

  assertP2ListError(
    () =>
      verifyP2ListSyntheticDatasetManifest(
        {
          ...manifest,
          datasetReference: "tampered-dataset-reference",
        },
        manifestSecret,
      ),
    "data_scope_denied",
  );

  const duplicateBody = {
    evidenceType: "repo_owned_synthetic_fixture" as const,
    datasetReference: "duplicate-source-binding",
    tenantEnvironmentId: "repo_owned_synthetic_p2list" as const,
    sourceRowPrimaryKeys: {
      ...manifest.sourceRowPrimaryKeys,
      person: [rows[0]!.personId, rows[0]!.personId],
    },
  };
  assertP2ListError(
    () =>
      verifyP2ListSyntheticDatasetManifest(
        signP2ListSyntheticDatasetManifest(duplicateBody, manifestSecret),
        manifestSecret,
      ),
    "data_scope_denied",
  );
});

test("P2LIST cursor wire contains only bounded claims and rejects tampering and expiry", () => {
  let now = Date.parse("2026-07-24T03:00:00.000Z");
  const cursors = createCursorManager(() => now);
  const token = cursors.issue({
    resource: "employee",
    sort: "displayName",
    direction: "asc",
    lastSortValue: "Private Display Name",
    lastSortValueIsNull: false,
    lastStableId: "employment-private",
    filterFingerprint: "filter-fingerprint",
    authorizationContextFingerprint: "authorization-fingerprint",
    datasetFingerprint: "dataset-fingerprint",
    resolvedAsOf: "2026-07-24",
  });
  const [encodedClaims] = token.split(".");
  const claims = JSON.parse(
    Buffer.from(encodedClaims!, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  assert.deepEqual(Object.keys(claims).sort(), [
    "expiresAt",
    "stateId",
    "version",
  ]);
  assert.doesNotMatch(token, /Private|employment-private|filter-fingerprint/u);
  assert.equal(cursors.read(token).lastSortValue, "Private Display Name");

  const replacement = token.endsWith("A") ? "B" : "A";
  assertP2ListError(
    () => cursors.read(`${token.slice(0, -1)}${replacement}`),
    "cursor_invalid",
  );
  now += 901_000;
  assertP2ListError(() => cursors.read(token), "cursor_invalid");
});

test("P2LIST employee repository covers 0/1/25/26/100/101 and equal-sort keysets", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const rows = createP2ListEmployeeFixtureRows(101, {
    displayName: "Equal Synthetic Name",
  });
  seedEmployeeRows(db, rows);

  for (const fixture of [
    { count: 0, limit: 25, firstPage: 0, hasNextPage: false },
    { count: 1, limit: 25, firstPage: 1, hasNextPage: false },
    { count: 25, limit: 25, firstPage: 25, hasNextPage: false },
    { count: 26, limit: 25, firstPage: 25, hasNextPage: true },
    { count: 100, limit: 100, firstPage: 100, hasNextPage: false },
    { count: 101, limit: 100, firstPage: 100, hasNextPage: true },
  ]) {
    const fixtureRows = rows.slice(0, fixture.count);
    const repository: P2ListReadModelRepository = new P2ListReadModelRepository(
      db,
      createCursorManager(),
    );
    const provenance = verifyP2ListSyntheticDatasetManifest(
      createP2ListFixtureManifest(
        {
          datasetReference: `employee-boundary-${fixture.count}`,
          employees: fixtureRows,
        },
        manifestSecret,
      ),
      manifestSecret,
    );
    const first: EmployeePage = repository.listEmployees({
      actor: employeeActor,
      provenance,
      acceptedAt,
      limit: fixture.limit,
    });
    assert.equal(first.items.length, fixture.firstPage);
    assert.equal(first.pageInfo.hasNextPage, fixture.hasNextPage);
    assert.equal(first.appliedFilters.asOf, "2026-07-24");
    assert.equal(
      first.pageInfo.hasNextPage,
      first.pageInfo.nextCursor !== null,
    );
    if (first.pageInfo.nextCursor) {
      const second: EmployeePage = repository.listEmployees({
        actor: employeeActor,
        provenance,
        acceptedAt,
        limit: fixture.limit,
        cursor: first.pageInfo.nextCursor,
      });
      assert.equal(second.items.length, fixture.count - fixture.firstPage);
      assert.equal(second.pageInfo.hasNextPage, false);
    }
  }

  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "employee-equal-sort-pagination",
        employees: rows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(db, createCursorManager());
  const employeeIds: string[] = [];
  let cursor: string | undefined;
  do {
    const page = repository.listEmployees({
      actor: employeeActor,
      provenance,
      acceptedAt,
      sort: "displayName",
      limit: 25,
      cursor,
    });
    employeeIds.push(...page.items.map((item) => item.employeeId));
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(employeeIds.length, 101);
  assert.equal(new Set(employeeIds).size, 101);
  assert.deepEqual(
    employeeIds,
    rows.map((row) => row.employeeId),
  );
});

test("P2LIST employee scope is query-layer, fail-closed, and provenance-bound", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const rows = createP2ListEmployeeFixtureRows(2);
  rows[1] = { ...rows[1]!, organizationCode: "ORG-OUT-OF-SCOPE" };
  seedEmployeeRows(db, rows);
  const preparedSql: string[] = [];
  const tracedDb: OnboardingTransactionRequestDatabase = {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      preparedSql.push(sql);
      return db.prepare(sql);
    },
  };
  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "employee-query-scope",
        employees: rows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(
    tracedDb,
    createCursorManager(),
  );
  const page = repository.listEmployees({
    actor: employeeActor,
    provenance,
    acceptedAt,
  });
  assert.deepEqual(
    page.items.map((item) => item.employeeId),
    [rows[0]!.employeeId],
  );
  assert.ok(
    page.items.every(
      (item) =>
        Object.keys(item).sort().join(",") ===
        [
          "displayName",
          "employeeId",
          "employmentStatus",
          "hireDate",
          "organizationCode",
          "personId",
          "positionCode",
          "terminationDate",
        ]
          .sort()
          .join(","),
    ),
  );
  assert.ok(
    preparedSql.some(
      (sql) =>
        sql.includes("assignment.organization_code IN") &&
        sql.includes("WHERE") &&
        sql.includes("LIMIT ?"),
    ),
  );

  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: undefined as never,
        provenance,
        acceptedAt,
      }),
    "actor_context_required",
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: {
          ...employeeActor,
          permissions: [],
        },
        provenance,
        acceptedAt,
      }),
    "permission_denied",
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: {
          ...employeeActor,
          dataScope: {
            organizationCodes: ["ORG-SYNTHETIC"],
            unsupportedScope: ["anything"],
          } as never,
        },
        provenance,
        acceptedAt,
      }),
    "data_scope_denied",
  );

  const missingAssignmentEvidence = verifyP2ListSyntheticDatasetManifest(
    signedManifest("employee-missing-assignment-evidence", {
      person: rows.map((row) => row.personId),
      employment: rows.map((row) => row.employmentId),
      assignment: [],
      transaction_request: [],
      audit_event: [],
    }),
    manifestSecret,
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance: missingAssignmentEvidence,
        acceptedAt,
      }),
    "data_scope_denied",
  );

  db.prepare(
    `
      INSERT INTO assignment (
        id, person_id, employment_id, assignment_code, organization_code,
        position_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `,
  ).run(
    "ambiguous-out-of-scope-assignment",
    rows[1]!.personId,
    rows[1]!.employmentId,
    "AMBIGUOUS-OUT-OF-SCOPE",
    "ORG-OUT-OF-SCOPE",
    "POS-AMBIGUOUS",
    "2026-01-01",
  );
  const ambiguousManifest = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "employee-ambiguous-assignment",
        employees: rows,
        additionalSourceRowPrimaryKeys: {
          assignment: ["ambiguous-out-of-scope-assignment"],
        },
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance: ambiguousManifest,
        acceptedAt,
      }),
    "data_scope_denied",
  );
});

test("P2LIST employee projection applies employment and assignment dates at the resolved asOf", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const rows = createP2ListEmployeeFixtureRows(3);
  seedEmployeeRows(db, rows);
  db.prepare("UPDATE assignment SET start_date = ? WHERE id = ?").run(
    "2026-08-01",
    rows[0]!.assignmentId,
  );
  db.prepare("UPDATE employment SET start_date = ? WHERE id = ?").run(
    "2026-08-01",
    rows[1]!.employmentId,
  );
  db.prepare("UPDATE assignment SET start_date = ? WHERE id = ?").run(
    "2026-08-01",
    rows[1]!.assignmentId,
  );
  db.prepare("UPDATE employment SET end_date = ? WHERE id = ?").run(
    "2026-07-24",
    rows[2]!.employmentId,
  );
  db.prepare("UPDATE assignment SET end_date = ? WHERE id = ?").run(
    "2026-07-24",
    rows[2]!.assignmentId,
  );
  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "employee-effective-dates",
        employees: rows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(db, createCursorManager());
  const actor: P2ListActorContext = {
    ...employeeActor,
    dataScope: { personIds: rows.map((row) => row.personId) },
  };
  const page = repository.listEmployees({
    actor,
    provenance,
    acceptedAt,
    filters: { asOf: "2026-07-24" },
  });
  assert.deepEqual(
    page.items.map((item) => [
      item.employeeId,
      item.organizationCode,
      item.positionCode,
    ]),
    [
      [rows[0]!.employeeId, null, null],
      [rows[2]!.employeeId, rows[2]!.organizationCode, rows[2]!.positionCode],
    ],
  );
});

test("P2LIST employee cursor rejects filter and actor drift and avoids duplicate traversal on inserts", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const allRows = createP2ListEmployeeFixtureRows(28);
  seedEmployeeRows(db, allRows.slice(0, 26));
  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "employee-concurrent-keyset",
        employees: allRows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(db, createCursorManager());
  const first = repository.listEmployees({
    actor: employeeActor,
    provenance,
    acceptedAt,
    filters: { q: "Synthetic" },
    sort: "employeeId",
    limit: 25,
  });
  assert.ok(first.pageInfo.nextCursor);
  assert.doesNotMatch(first.pageInfo.nextCursor!, /Synthetic/u);

  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance,
        acceptedAt,
        filters: { q: "Different" },
        sort: "employeeId",
        limit: 25,
        cursor: first.pageInfo.nextCursor!,
      }),
    "cursor_filter_mismatch",
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance,
        acceptedAt,
        filters: { q: "Synthetic", asOf: "2026-07-23" },
        sort: "employeeId",
        limit: 25,
        cursor: first.pageInfo.nextCursor!,
      }),
    "cursor_filter_mismatch",
  );
  const differentProvenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "employee-concurrent-keyset-different-dataset",
        employees: allRows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance: differentProvenance,
        acceptedAt,
        filters: { q: "Synthetic" },
        sort: "employeeId",
        limit: 25,
        cursor: first.pageInfo.nextCursor!,
      }),
    "cursor_invalid",
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: {
          ...employeeActor,
          actorId: "different-actor",
        },
        provenance,
        acceptedAt,
        filters: { q: "Synthetic" },
        sort: "employeeId",
        limit: 25,
        cursor: first.pageInfo.nextCursor!,
      }),
    "permission_denied",
  );

  seedEmployeeRows(db, [
    { ...allRows[26]!, employeeId: "EMP-000" },
    { ...allRows[27]!, employeeId: "EMP-025A" },
  ]);
  const second = repository.listEmployees({
    actor: employeeActor,
    provenance,
    acceptedAt,
    filters: { q: "Synthetic" },
    sort: "employeeId",
    limit: 25,
    cursor: first.pageInfo.nextCursor!,
  });
  assert.deepEqual(
    second.items.map((item) => item.employeeId),
    ["EMP-025A", "EMP-026"],
  );
  assert.equal(
    first.items.some((firstItem) =>
      second.items.some(
        (secondItem) => secondItem.employeeId === firstItem.employeeId,
      ),
    ),
    false,
  );
});

test("P2LIST lifecycle repository normalizes all persisted request types and decisions", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const fixture = seedLifecycleNormalizationRows(db);
  db.prepare(
    `
      INSERT INTO assignment (
        id, person_id, employment_id, assignment_code, organization_code,
        position_code, start_date, end_date
      )
      VALUES
        (
          'assignment-change-ignored-history', 'person-change',
          'employment-change', 'ASSIGN-CHANGE-HISTORY', 'ORG-OLD',
          'POS-OLD', '2026-02-30', NULL
        ),
        (
          'assignment-terminate-ignored-history', 'person-terminate',
          'employment-terminate', 'ASSIGN-TERMINATE-HISTORY', 'ORG-OLD',
          'POS-OLD', '2026-02-30', NULL
        )
    `,
  ).run();
  db.exec("PRAGMA ignore_check_constraints = ON");
  db.prepare(
    `
      INSERT INTO audit_event (
        id, actor_id, action, subject_table, subject_id, occurred_at,
        correlation_id, poc_marker
      )
      VALUES (
        'audit-hire-ignored-history', '', 'mvp_a.onboarding.return',
        'transaction_request', 'tr-hire', 'not-a-timestamp',
        'correlation-hire-ignored-history', 'synthetic_poc'
      )
    `,
  ).run();
  db.exec("PRAGMA ignore_check_constraints = OFF");
  const provenance = verifyP2ListSyntheticDatasetManifest(
    signedManifest("lifecycle-normalization", fixture.sourceRowPrimaryKeys),
    manifestSecret,
  );
  const preparedSql: string[] = [];
  const repository = new P2ListReadModelRepository(
    {
      exec: (sql) => db.exec(sql),
      prepare: (sql) => {
        preparedSql.push(sql);
        return db.prepare(sql);
      },
    },
    createCursorManager(),
  );
  const page = repository.listLifecycleRequests({
    actor: lifecycleActor,
    provenance,
    limit: 10,
  });
  assert.deepEqual(
    page.items
      .map((item) => [item.transactionRequestId, item.requestType])
      .sort(),
    [
      ["tr-change", "transfer"],
      ["tr-hire", "onboarding"],
      ["tr-terminate", "termination"],
      ["tr-transfer", "transfer"],
    ],
  );
  assert.deepEqual(
    Object.fromEntries(
      page.items.map((item) => [item.transactionRequestId, item.decidedBy]),
    ),
    {
      "tr-hire": null,
      "tr-change": "approver-change",
      "tr-transfer": "approver-transfer",
      "tr-terminate": "approver-termination",
    },
  );
  assert.equal(
    page.items.find((item) => item.transactionRequestId === "tr-hire")
      ?.requestedAt,
    "2026-07-01T00:00:00.000Z",
  );
  assert.ok(
    page.items.every(
      (item) =>
        Object.keys(item).sort().join(",") ===
        [
          "decidedBy",
          "effectiveDate",
          "organizationCode",
          "requestType",
          "requestedAt",
          "status",
          "subjectDisplayName",
          "subjectEmployeeId",
          "subjectPersonId",
          "transactionRequestId",
        ]
          .sort()
          .join(","),
    ),
  );
  assert.ok(
    preparedSql.some(
      (sql) =>
        sql.includes("WITH validated_projection") &&
        sql.includes("organization_code IN") &&
        sql.includes("WHERE"),
    ),
  );

  const filtered = repository.listLifecycleRequests({
    actor: lifecycleActor,
    provenance,
    filters: {
      requestType: ["transfer"],
      decidedBy: "approver-change",
    },
  });
  assert.deepEqual(
    filtered.items.map((item) => item.transactionRequestId),
    ["tr-change"],
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: {
          ...lifecycleActor,
          permissions: [p2ListPermissions.lifecycleRequestListRead],
        },
        provenance,
        filters: { correlationId: "correlation-hire" },
      }),
    "permission_denied",
  );
});

test("P2LIST lifecycle keysets cover 0/1/25/26/100/101 with equal sort values", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const rows = createP2ListLifecycleFixtureRows(101, {
    requestedAt: "2026-07-01T00:00:00.000Z",
  });
  seedLifecycleFixtureRows(db, rows);

  for (const fixture of [
    { count: 0, limit: 25, firstPage: 0, hasNextPage: false },
    { count: 1, limit: 25, firstPage: 1, hasNextPage: false },
    { count: 25, limit: 25, firstPage: 25, hasNextPage: false },
    { count: 26, limit: 25, firstPage: 25, hasNextPage: true },
    { count: 100, limit: 100, firstPage: 100, hasNextPage: false },
    { count: 101, limit: 100, firstPage: 100, hasNextPage: true },
  ]) {
    const fixtureRows = rows.slice(0, fixture.count);
    const provenance = verifyP2ListSyntheticDatasetManifest(
      createP2ListFixtureManifest(
        {
          datasetReference: `lifecycle-boundary-${fixture.count}`,
          lifecycleRequests: fixtureRows,
        },
        manifestSecret,
      ),
      manifestSecret,
    );
    const repository: P2ListReadModelRepository = new P2ListReadModelRepository(
      db,
      createCursorManager(),
    );
    const first: LifecyclePage = repository.listLifecycleRequests({
      actor: lifecycleActor,
      provenance,
      limit: fixture.limit,
    });
    assert.equal(first.items.length, fixture.firstPage);
    assert.equal(first.pageInfo.hasNextPage, fixture.hasNextPage);
    if (first.pageInfo.nextCursor) {
      const second: LifecyclePage = repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance,
        limit: fixture.limit,
        cursor: first.pageInfo.nextCursor,
      });
      assert.equal(second.items.length, fixture.count - fixture.firstPage);
    }
  }

  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "lifecycle-equal-sort-pagination",
        lifecycleRequests: rows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(db, createCursorManager());
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = repository.listLifecycleRequests({
      actor: lifecycleActor,
      provenance,
      limit: 25,
      cursor,
    });
    ids.push(...page.items.map((item) => item.transactionRequestId));
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(ids.length, 101);
  assert.equal(new Set(ids).size, 101);
  assert.deepEqual(ids, rows.map((row) => row.transactionRequestId).reverse());
});

test("P2LIST lifecycle validation fails before scope for malformed payload and tied decisions", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const fixture = seedLifecycleNormalizationRows(db);
  db.prepare(
    `
      INSERT INTO person (id, display_name, created_at)
      VALUES ('person-malformed', 'Malformed Out Of Scope', '2026-01-01T00:00:00.000Z')
    `,
  ).run();
  db.prepare(
    `
      INSERT INTO transaction_request (
        id, person_id, request_type, status_code, requested_at,
        correlation_id, payload_version, payload_json
      )
      VALUES (
        'tr-malformed', 'person-malformed', 'hire', 'submitted',
        '2026-07-01T00:00:00.000Z', 'correlation-malformed',
        'mvp_a_onboarding_v1', '{"effectiveDate":"not-a-date"}'
      )
    `,
  ).run();
  const malformedProvenance = verifyP2ListSyntheticDatasetManifest(
    signedManifest("lifecycle-malformed", {
      ...fixture.sourceRowPrimaryKeys,
      person: [...fixture.sourceRowPrimaryKeys.person, "person-malformed"],
      transaction_request: [
        ...fixture.sourceRowPrimaryKeys.transaction_request,
        "tr-malformed",
      ],
    }),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(db, createCursorManager());
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance: malformedProvenance,
      }),
    "data_scope_denied",
  );

  db.exec("PRAGMA ignore_check_constraints = ON");
  db.prepare(
    `
      INSERT INTO audit_event (
        id, actor_id, action, subject_table, subject_id, occurred_at,
        correlation_id, poc_marker
      )
      VALUES (
        'audit-change-malformed-time', 'other-approver',
        'mvp_b.transfer.approve', 'transaction_request', 'tr-change',
        'not-a-timestamp', 'correlation-change-malformed-time', 'synthetic_poc'
      )
    `,
  ).run();
  db.exec("PRAGMA ignore_check_constraints = OFF");
  const baselineProvenance = verifyP2ListSyntheticDatasetManifest(
    signedManifest("lifecycle-malformed-decision-time", {
      ...fixture.sourceRowPrimaryKeys,
    }),
    manifestSecret,
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance: baselineProvenance,
      }),
    "data_scope_denied",
  );
  db.prepare(
    "DELETE FROM audit_event WHERE id = 'audit-change-malformed-time'",
  ).run();

  db.prepare(
    "UPDATE assignment SET start_date = '2026-02-30' WHERE id = 'assignment-terminate'",
  ).run();
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance: baselineProvenance,
      }),
    "data_scope_denied",
  );
  db.prepare(
    "UPDATE assignment SET start_date = '2026-01-01' WHERE id = 'assignment-terminate'",
  ).run();

  db.prepare(
    `
      INSERT INTO audit_event (
        id, actor_id, action, subject_table, subject_id, occurred_at,
        correlation_id, poc_marker
      )
      VALUES (
        'audit-change-tie', 'other-approver', 'mvp_b.transfer.approve',
        'transaction_request', 'tr-change', '2026-07-03T00:00:00.000Z',
        'correlation-change-tie', 'synthetic_poc'
      )
    `,
  ).run();
  const tiedProvenance = verifyP2ListSyntheticDatasetManifest(
    signedManifest("lifecycle-tied-decision", {
      ...fixture.sourceRowPrimaryKeys,
      audit_event: [
        ...fixture.sourceRowPrimaryKeys.audit_event,
        "audit-change-tie",
      ],
    }),
    manifestSecret,
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance: tiedProvenance,
      }),
    "data_scope_denied",
  );
});

test("P2LIST query validation rejects unsupported search, sort, limits, and date ranges before repository access", async (t) => {
  const db = await openTestDatabase(t);
  if (!db) {
    return;
  }
  const employeeRows = createP2ListEmployeeFixtureRows(1);
  const lifecycleRows = createP2ListLifecycleFixtureRows(1);
  seedEmployeeRows(db, employeeRows);
  seedLifecycleFixtureRows(db, lifecycleRows);
  const provenance = verifyP2ListSyntheticDatasetManifest(
    createP2ListFixtureManifest(
      {
        datasetReference: "query-validation",
        employees: employeeRows,
        lifecycleRequests: lifecycleRows,
      },
      manifestSecret,
    ),
    manifestSecret,
  );
  const repository = new P2ListReadModelRepository(db, createCursorManager());

  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance,
        acceptedAt,
        filters: { q: "EMP%" },
      }),
    "invalid_filter",
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance,
        acceptedAt,
        sort: "unknown" as never,
      }),
    "invalid_sort",
  );
  assertP2ListError(
    () =>
      repository.listEmployees({
        actor: employeeActor,
        provenance,
        acceptedAt,
        limit: 101,
      }),
    "limit_out_of_range",
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance,
        filters: { requestedFrom: "2026-07-01T00:00:00.000Z" },
      }),
    "invalid_filter",
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance,
        filters: {
          effectiveFrom: "2026-08-02",
          effectiveTo: "2026-08-01",
        },
      }),
    "invalid_filter",
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance,
        filters: {
          effectiveFrom: "2026-01-01",
          effectiveTo: "2027-01-02",
        },
      }),
    "date_range_too_wide",
  );
  assertP2ListError(
    () =>
      repository.listLifecycleRequests({
        actor: lifecycleActor,
        provenance,
        filters: {
          requestedFrom: "2026-02-30T00:00:00.000Z",
          requestedTo: "2026-03-01T00:00:00.000Z",
        },
      }),
    "invalid_filter",
  );
});

function createCursorManager(now?: () => number): P2ListCursorManager {
  let sequence = 0;
  return new P2ListCursorManager({
    secret: cursorSecret,
    now: now ? () => new Date(now()) : undefined,
    randomBytes: (size) => {
      sequence += 1;
      return Buffer.alloc(size, sequence);
    },
  });
}

async function openTestDatabase(
  t: TestContext,
): Promise<
  (OnboardingTransactionRequestDatabase & { close(): void }) | undefined
> {
  try {
    const db = await openLocalSyntheticWritebackDatabase(":memory:");
    t.after(() => db.close());
    return db;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_UNKNOWN_BUILTIN_MODULE"
    ) {
      t.skip("node:sqlite is unavailable in this Node runtime");
      return undefined;
    }
    throw error;
  }
}

function seedEmployeeRows(
  db: OnboardingTransactionRequestDatabase,
  rows: readonly P2ListEmployeeFixtureRow[],
): void {
  const person = db.prepare(
    "INSERT INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const employment = db.prepare(
    `
      INSERT INTO employment (
        id, person_id, employment_code, status_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, NULL)
    `,
  );
  const assignment = db.prepare(
    `
      INSERT INTO assignment (
        id, person_id, employment_id, assignment_code, organization_code,
        position_code, start_date, end_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
    `,
  );
  for (const row of rows) {
    person.run(row.personId, row.displayName, "2026-01-01T00:00:00.000Z");
    employment.run(
      row.employmentId,
      row.personId,
      row.employeeId,
      row.employmentStatus,
      row.hireDate,
    );
    assignment.run(
      row.assignmentId,
      row.personId,
      row.employmentId,
      row.assignmentCode,
      row.organizationCode,
      row.positionCode,
      row.hireDate,
    );
  }
}

function seedLifecycleFixtureRows(
  db: OnboardingTransactionRequestDatabase,
  rows: readonly P2ListLifecycleFixtureRow[],
): void {
  const person = db.prepare(
    "INSERT INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
  );
  const request = db.prepare(
    `
      INSERT INTO transaction_request (
        id, person_id, request_type, status_code, requested_at,
        correlation_id, payload_version, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  for (const row of rows) {
    person.run(row.personId, row.displayName, "2026-01-01T00:00:00.000Z");
    request.run(
      row.transactionRequestId,
      row.personId,
      row.requestType,
      row.status,
      row.requestedAt,
      row.correlationId,
      row.payloadVersion,
      row.payloadJson,
    );
  }
}

function seedLifecycleNormalizationRows(
  db: OnboardingTransactionRequestDatabase,
): { sourceRowPrimaryKeys: Record<P2ListSource, string[]> } {
  const persons = [
    ["person-hire", "Hire Subject"],
    ["person-change", "Change Subject"],
    ["person-transfer", "Transfer Subject"],
    ["person-terminate", "Termination Subject"],
  ] as const;
  for (const [id, displayName] of persons) {
    db.prepare(
      "INSERT INTO person (id, display_name, created_at) VALUES (?, ?, ?)",
    ).run(id, displayName, "2026-01-01T00:00:00.000Z");
  }
  const employments = [
    ["employment-change", "person-change", "EMP-CHANGE"],
    ["employment-transfer", "person-transfer", "EMP-TRANSFER"],
    ["employment-terminate", "person-terminate", "EMP-TERMINATE"],
  ] as const;
  for (const [id, personId, code] of employments) {
    db.prepare(
      `
        INSERT INTO employment (
          id, person_id, employment_code, status_code, start_date, end_date
        )
        VALUES (?, ?, ?, 'active', '2026-01-01', NULL)
      `,
    ).run(id, personId, code);
  }
  db.prepare(
    `
      INSERT INTO assignment (
        id, person_id, employment_id, assignment_code, organization_code,
        position_code, start_date, end_date
      )
      VALUES (
        'assignment-terminate', 'person-terminate', 'employment-terminate',
        'ASSIGN-TERMINATE', 'ORG-TERMINATION', 'POS-TERMINATION',
        '2026-01-01', '2026-08-15'
      )
    `,
  ).run();

  const request = db.prepare(
    `
      INSERT INTO transaction_request (
        id, person_id, request_type, status_code, requested_at,
        correlation_id, payload_version, payload_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  request.run(
    "tr-hire",
    "person-hire",
    "hire",
    "submitted",
    "2026-07-01T09:00:00+09:00",
    "correlation-hire",
    "mvp_a_onboarding_v1",
    onboardingPayload("ORG-ONBOARDING", "2026-08-01"),
  );
  request.run(
    "tr-change",
    "person-change",
    "change",
    "approved",
    "2026-07-02T00:00:00.000Z",
    "correlation-change",
    "mvp_b_transfer_v1",
    transferPayload("ORG-CHANGE", "2026-08-02"),
  );
  request.run(
    "tr-transfer",
    "person-transfer",
    "transfer",
    "returned",
    "2026-07-03T00:00:00.000Z",
    "correlation-transfer",
    "mvp_b_transfer_v1",
    transferPayload("ORG-TRANSFER", "2026-08-03"),
  );
  request.run(
    "tr-terminate",
    "person-terminate",
    "terminate",
    "rejected",
    "2026-07-04T00:00:00.000Z",
    "correlation-terminate",
    "mvp_c_termination_v1",
    terminationPayload(),
  );

  const audit = db.prepare(
    `
      INSERT INTO audit_event (
        id, actor_id, action, subject_table, subject_id, occurred_at,
        correlation_id, poc_marker
      )
      VALUES (?, ?, ?, 'transaction_request', ?, ?, ?, 'synthetic_poc')
    `,
  );
  audit.run(
    "audit-change",
    "approver-change",
    "mvp_b.transfer.approve",
    "tr-change",
    "2026-07-03T00:00:00.000Z",
    "audit-correlation-change",
  );
  audit.run(
    "audit-transfer",
    "approver-transfer",
    "mvp_b.transfer.return",
    "tr-transfer",
    "2026-07-04T00:00:00.000Z",
    "audit-correlation-transfer",
  );
  audit.run(
    "audit-terminate",
    "approver-termination",
    "mvp_c.termination.reject",
    "tr-terminate",
    "2026-07-05T00:00:00.000Z",
    "audit-correlation-terminate",
  );
  return {
    sourceRowPrimaryKeys: {
      person: persons.map(([id]) => id),
      employment: employments.map(([id]) => id),
      assignment: ["assignment-terminate"],
      transaction_request: [
        "tr-hire",
        "tr-change",
        "tr-transfer",
        "tr-terminate",
      ],
      audit_event: ["audit-change", "audit-transfer", "audit-terminate"],
    },
  };
}

function onboardingPayload(
  organizationCode: string,
  effectiveDate: string,
): string {
  return JSON.stringify({
    tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
    effectiveDate,
    employment: {
      id: "future-employment",
      employmentCode: "FUTURE-EMPLOYEE",
      startDate: effectiveDate,
    },
    assignment: {
      id: "future-assignment",
      assignmentCode: "FUTURE-ASSIGNMENT",
      departmentReference: organizationCode,
      legalEntityReference: "LEGAL-SYNTHETIC",
      managerReference: "MANAGER-SYNTHETIC",
      positionCode: "POS-SYNTHETIC",
    },
    workEmailExpectation: {
      contactPointId: "future-contact",
      value: "future@example.test",
    },
  });
}

function transferPayload(
  organizationCode: string,
  effectiveDate: string,
): string {
  return JSON.stringify({
    tenantEnvironmentId: "repo_owned_synthetic_mvp_b_transfer",
    effectiveDate,
    currentAssignment: {
      assignmentId: "current-assignment",
      assignmentCode: "CURRENT-ASSIGNMENT",
    },
    targetAssignment: {
      organizationReference: organizationCode,
      departmentReference: "DEPARTMENT-SYNTHETIC",
      managerReference: "MANAGER-SYNTHETIC",
      positionCode: "POS-SYNTHETIC",
    },
    transferReason: {
      reasonCode: "organization_change",
      note: null,
    },
  });
}

function terminationPayload(): string {
  return JSON.stringify({
    tenantEnvironmentId: "repo_owned_synthetic_mvp_c_termination",
    effectiveDate: "2026-08-15",
    currentEmployment: {
      employmentId: "employment-terminate",
      employmentCode: "EMP-TERMINATE",
    },
    currentAssignment: {
      assignmentId: "assignment-terminate",
      assignmentCode: "ASSIGN-TERMINATE",
    },
    terminationReason: {
      reasonCode: "resignation",
      note: null,
    },
  });
}

function signedManifest(
  datasetReference: string,
  sourceRowPrimaryKeys: Record<P2ListSource, readonly string[]>,
) {
  return signP2ListSyntheticDatasetManifest(
    {
      evidenceType: "repo_owned_synthetic_fixture",
      datasetReference,
      tenantEnvironmentId: "repo_owned_synthetic_p2list",
      sourceRowPrimaryKeys,
    },
    manifestSecret,
  );
}

function assertP2ListError(
  callback: () => unknown,
  expectedCode: P2ListReadModelError["code"],
): void {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof P2ListReadModelError);
    assert.equal(error.code, expectedCode);
    assert.ok(error.message.length <= 200);
    return true;
  });
}
