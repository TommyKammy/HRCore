import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
  resolveLocalOktaMasteringConfig,
  type OktaEmittedWorkEmailWritebackEvent,
  type OktaGroupProjection,
  type OktaMasteringProjection,
  type OktaMasteringProjectionMetadata,
} from "./okta-mastering-adapter.js";

test("mock Okta mastering adapter projects create, update, disable, and no-op results without credentials", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-001",
        employeeNumber: "EMP-001",
        email: "existing.identity@example.invalid",
        displayName: "Existing Identity",
        givenName: "Existing",
        familyName: "Identity",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T00:00:00.000Z",
      }),
    ],
  });

  const createProjection: OktaMasteringProjection = {
    operation: "create",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-002",
      employeeNumber: "EMP-002",
      email: "new.identity@example.invalid",
      displayName: "New Identity",
      givenName: "New",
      familyName: "Identity",
      status: "staged",
      departmentCode: "DEPT-SYN",
      effectiveAt: "2026-05-18T01:00:00.000Z",
    }),
  };

  assert.deepEqual(await adapter.project(createProjection), {
    outcome: "success",
    operation: "create",
    employeeNumber: "EMP-002",
    externalId: "okta-user-002",
    effectiveAt: "2026-05-18T01:00:00.000Z",
    metadata: expectedMockMetadata(
      "create",
      "EMP-002",
      "2026-05-18T01:00:00.000Z",
    ),
  });

  assert.deepEqual(
    await adapter.project({
      operation: "update",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-001",
        employeeNumber: "EMP-001",
        email: "existing.identity@example.invalid",
        displayName: "Existing Identity Updated",
        givenName: "Existing",
        familyName: "Identity",
        status: "active",
        departmentCode: "DEPT-NEW",
        effectiveAt: "2026-05-18T02:00:00.000Z",
      }),
    }),
    {
      outcome: "success",
      operation: "update",
      employeeNumber: "EMP-001",
      externalId: "okta-user-001",
      effectiveAt: "2026-05-18T02:00:00.000Z",
      metadata: expectedMockMetadata(
        "update",
        "EMP-001",
        "2026-05-18T02:00:00.000Z",
      ),
    },
  );

  assert.deepEqual(
    await adapter.project({
      operation: "disable",
      employeeNumber: "EMP-001",
      effectiveAt: "2026-05-18T03:00:00.000Z",
    }),
    {
      outcome: "success",
      operation: "disable",
      employeeNumber: "EMP-001",
      externalId: "okta-user-001",
      effectiveAt: "2026-05-18T03:00:00.000Z",
      metadata: expectedMockMetadata(
        "disable",
        "EMP-001",
        "2026-05-18T03:00:00.000Z",
      ),
    },
  );

  assert.deepEqual(
    await adapter.project({
      operation: "disable",
      employeeNumber: "EMP-001",
      effectiveAt: "2026-05-18T04:00:00.000Z",
    }),
    {
      outcome: "skipped",
      operation: "disable",
      employeeNumber: "EMP-001",
      reason: "already_deprovisioned",
      effectiveAt: "2026-05-18T04:00:00.000Z",
      metadata: expectedMockMetadata(
        "disable",
        "EMP-001",
        "2026-05-18T04:00:00.000Z",
      ),
    },
  );
});

test("mock Okta mastering adapter exposes retryable and permanent failure states", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    forcedFailures: {
      "EMP-RETRY": {
        outcome: "retryable_failure",
        errorCode: "mock_rate_limited",
        message: "Synthetic retryable provider failure.",
        retryAfterSeconds: 60,
      },
      "EMP-PERM": {
        outcome: "permanent_failure",
        errorCode: "mock_validation_rejected",
        message: "Synthetic permanent provider failure.",
      },
    },
  });

  assert.deepEqual(
    await adapter.project({
      operation: "create",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-retry",
        employeeNumber: "EMP-RETRY",
        email: "retry.identity@example.invalid",
        displayName: "Retry Identity",
        givenName: "Retry",
        familyName: "Identity",
        status: "staged",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T05:00:00.000Z",
      }),
    }),
    {
      outcome: "retryable_failure",
      operation: "create",
      employeeNumber: "EMP-RETRY",
      errorCode: "mock_rate_limited",
      message: "Synthetic retryable provider failure.",
      retryAfterSeconds: 60,
      effectiveAt: "2026-05-18T05:00:00.000Z",
      metadata: expectedMockMetadata(
        "create",
        "EMP-RETRY",
        "2026-05-18T05:00:00.000Z",
      ),
    },
  );

  assert.deepEqual(
    await adapter.project({
      operation: "disable",
      employeeNumber: "EMP-PERM",
      effectiveAt: "2026-05-18T06:00:00.000Z",
    }),
    {
      outcome: "permanent_failure",
      operation: "disable",
      employeeNumber: "EMP-PERM",
      errorCode: "mock_validation_rejected",
      message: "Synthetic permanent provider failure.",
      effectiveAt: "2026-05-18T06:00:00.000Z",
      metadata: expectedMockMetadata(
        "disable",
        "EMP-PERM",
        "2026-05-18T06:00:00.000Z",
      ),
    },
  );
});

test("mock Okta mastering adapter records deterministic projection metadata for run logs", async () => {
  const adapter = buildOktaMasteringAdapter({ mode: "mock" });

  assert.deepEqual(
    await adapter.project({
      operation: "create",
      desiredUser: createSyntheticOktaUserFixture({
        externalId: "okta-user-log-001",
        employeeNumber: "EMP-LOG-001",
        email: "runlog.identity@example.invalid",
        displayName: "Run Log Identity",
        givenName: "Run",
        familyName: "Log",
        status: "staged",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T07:00:00.000Z",
      }),
    }),
    {
      outcome: "success",
      operation: "create",
      employeeNumber: "EMP-LOG-001",
      externalId: "okta-user-log-001",
      effectiveAt: "2026-05-18T07:00:00.000Z",
      metadata: expectedMockMetadata(
        "create",
        "EMP-LOG-001",
        "2026-05-18T07:00:00.000Z",
      ),
    },
  );
});

test("mock Okta mastering adapter emits deterministic work email writeback events for ingest", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-001",
        employeeNumber: "EMP-WRITEBACK-001",
        email: "writeback.identity@example.invalid",
        displayName: "Writeback Identity",
        givenName: "Writeback",
        familyName: "Identity",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const projectionResult = await adapter.project({
    operation: "update",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-writeback-001",
      employeeNumber: "EMP-WRITEBACK-001",
      email: "confirmed.writeback@example.invalid",
      displayName: "Writeback Identity",
      givenName: "Writeback",
      familyName: "Identity",
      status: "active",
      departmentCode: "DEPT-SYN",
      effectiveAt: "2026-05-18T16:00:00.000Z",
    }),
  });
  assert.equal(projectionResult.outcome, "success");

  const event: OktaEmittedWorkEmailWritebackEvent =
    await adapter.emitWorkEmailWriteback({
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      employeeNumber: "EMP-WRITEBACK-001",
      workEmail: "confirmed.writeback@example.invalid",
      emittedAt: "2026-05-18T16:00:00.000Z",
      projectionEvidence: projectionResult.metadata,
    });

  assert.deepEqual(event, {
    payload: {
      eventId:
        "okta-work-email-writeback-update-EMP-WRITEBACK-001-2026-05-18T16%3A00%3A00.000Z",
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      providerName: "synthetic_okta",
      providerSubjectId: "okta-user-writeback-001",
      providerValue: "confirmed.writeback@example.invalid",
      targetContactType: "work_email",
      correlationId:
        "okta:mock:work_email_writeback:update:EMP-WRITEBACK-001:2026-05-18T16%3A00%3A00.000Z",
      receivedAt: "2026-05-18T16:00:00.000Z",
      pocMarker: "synthetic_poc",
    },
    metadata: {
      provider: "okta",
      adapterMode: "mock",
      eventType: "work_email_writeback",
      projectionKey:
        "okta:mock:update:EMP-WRITEBACK-001:2026-05-18T16%3A00%3A00.000Z",
      synthetic: true,
    },
  });
});

test("mock Okta work email writeback emission requires successful projection evidence", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-skipped-001",
        employeeNumber: "EMP-WRITEBACK-SKIPPED-001",
        email: "skipped.writeback@example.invalid",
        displayName: "Skipped Writeback",
        givenName: "Skipped",
        familyName: "Writeback",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const skippedProjectionResult = await adapter.project({
    operation: "create",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-writeback-skipped-001",
      employeeNumber: "EMP-WRITEBACK-SKIPPED-001",
      email: "skipped.writeback@example.invalid",
      displayName: "Skipped Writeback",
      givenName: "Skipped",
      familyName: "Writeback",
      status: "active",
      departmentCode: "DEPT-SYN",
      effectiveAt: "2026-05-18T16:10:00.000Z",
    }),
  });
  assert.equal(skippedProjectionResult.outcome, "skipped");

  await assert.rejects(
    adapter.emitWorkEmailWriteback({
      personId: "person-writeback-skipped-001",
      contactPointId: "contact-point-writeback-skipped-001",
      employeeNumber: "EMP-WRITEBACK-SKIPPED-001",
      workEmail: "skipped.writeback@example.invalid",
      emittedAt: "2026-05-18T16:10:00.000Z",
      projectionEvidence: skippedProjectionResult.metadata,
    }),
    /Synthetic writeback requires successful mock Okta projection evidence/,
  );
});

test("mock Okta work email writeback emission rejects workEmail drift from projected user", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-drift-001",
        employeeNumber: "EMP-WRITEBACK-DRIFT-001",
        email: "old.writeback.drift@example.invalid",
        displayName: "Writeback Drift",
        givenName: "Writeback",
        familyName: "Drift",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const projectionResult = await adapter.project({
    operation: "update",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-writeback-drift-001",
      employeeNumber: "EMP-WRITEBACK-DRIFT-001",
      email: "projected.writeback.drift@example.invalid",
      displayName: "Writeback Drift",
      givenName: "Writeback",
      familyName: "Drift",
      status: "active",
      departmentCode: "DEPT-SYN",
      effectiveAt: "2026-05-18T16:20:00.000Z",
    }),
  });
  assert.equal(projectionResult.outcome, "success");

  await assert.rejects(
    adapter.emitWorkEmailWriteback({
      personId: "person-writeback-drift-001",
      contactPointId: "contact-point-writeback-drift-001",
      employeeNumber: "EMP-WRITEBACK-DRIFT-001",
      workEmail: "caller.supplied.drift@example.invalid",
      emittedAt: "2026-05-18T16:20:00.000Z",
      projectionEvidence: projectionResult.metadata,
    }),
    /Synthetic writeback workEmail must match the projected mock Okta user/,
  );
});

test("mock Okta work email writeback identifiers include projection operation", async () => {
  const adapter = buildOktaMasteringAdapter({ mode: "mock" });
  const effectiveAt = "2026-05-18T16:40:00.000Z";

  const createProjectionResult = await adapter.project({
    operation: "create",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-writeback-operation-001",
      employeeNumber: "EMP-WRITEBACK-OPERATION-001",
      email: "created.operation@example.invalid",
      displayName: "Writeback Operation",
      givenName: "Writeback",
      familyName: "Operation",
      status: "active",
      departmentCode: "DEPT-SYN",
      effectiveAt,
    }),
  });
  assert.equal(createProjectionResult.outcome, "success");

  const createEvent = await adapter.emitWorkEmailWriteback({
    personId: "person-writeback-operation-001",
    contactPointId: "contact-point-writeback-operation-001",
    employeeNumber: "EMP-WRITEBACK-OPERATION-001",
    workEmail: "created.operation@example.invalid",
    emittedAt: effectiveAt,
    projectionEvidence: createProjectionResult.metadata,
  });

  const updateProjectionResult = await adapter.project({
    operation: "update",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-writeback-operation-001",
      employeeNumber: "EMP-WRITEBACK-OPERATION-001",
      email: "updated.operation@example.invalid",
      displayName: "Writeback Operation",
      givenName: "Writeback",
      familyName: "Operation",
      status: "active",
      departmentCode: "DEPT-SYN",
      effectiveAt,
    }),
  });
  assert.equal(updateProjectionResult.outcome, "success");

  const updateEvent = await adapter.emitWorkEmailWriteback({
    personId: "person-writeback-operation-001",
    contactPointId: "contact-point-writeback-operation-001",
    employeeNumber: "EMP-WRITEBACK-OPERATION-001",
    workEmail: "updated.operation@example.invalid",
    emittedAt: effectiveAt,
    projectionEvidence: updateProjectionResult.metadata,
  });

  assert.equal(
    createEvent.payload.eventId,
    "okta-work-email-writeback-create-EMP-WRITEBACK-OPERATION-001-2026-05-18T16%3A40%3A00.000Z",
  );
  assert.equal(
    updateEvent.payload.eventId,
    "okta-work-email-writeback-update-EMP-WRITEBACK-OPERATION-001-2026-05-18T16%3A40%3A00.000Z",
  );
  assert.notEqual(createEvent.payload.eventId, updateEvent.payload.eventId);
  assert.equal(
    createEvent.payload.correlationId,
    "okta:mock:work_email_writeback:create:EMP-WRITEBACK-OPERATION-001:2026-05-18T16%3A40%3A00.000Z",
  );
  assert.equal(
    updateEvent.payload.correlationId,
    "okta:mock:work_email_writeback:update:EMP-WRITEBACK-OPERATION-001:2026-05-18T16%3A40%3A00.000Z",
  );
});

test("mock Okta work email writeback emission fails closed when the provider user is missing", async () => {
  const adapter = buildOktaMasteringAdapter({ mode: "mock" });

  await assert.rejects(
    adapter.emitWorkEmailWriteback({
      personId: "person-writeback-missing-provider-001",
      contactPointId: "contact-point-writeback-missing-provider-001",
      employeeNumber: "EMP-WRITEBACK-MISSING",
      workEmail: "missing.provider@example.invalid",
      emittedAt: "2026-05-18T16:30:00.000Z",
      projectionEvidence: expectedMockMetadata(
        "update",
        "EMP-WRITEBACK-MISSING",
        "2026-05-18T16:30:00.000Z",
      ),
    }),
    /Synthetic writeback requires an existing mock Okta user/,
  );
});

test("mock Okta work email writeback emission rejects mismatched projection evidence", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-writeback-001",
        employeeNumber: "EMP-WRITEBACK-001",
        email: "writeback.identity@example.invalid",
        displayName: "Writeback Identity",
        givenName: "Writeback",
        familyName: "Identity",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  await assert.rejects(
    adapter.emitWorkEmailWriteback({
      personId: "person-writeback-001",
      contactPointId: "contact-point-writeback-001",
      employeeNumber: "EMP-WRITEBACK-001",
      workEmail: "confirmed.writeback@example.invalid",
      emittedAt: "2026-05-18T16:00:00.000Z",
      projectionEvidence: expectedMockMetadata(
        "update",
        "EMP-WRITEBACK-SIBLING",
        "2026-05-18T16:00:00.000Z",
      ),
    }),
    /Synthetic writeback projection evidence must match the emitted employee and timestamp/,
  );
});

test("mock Okta mastering adapter projects synthetic group memberships without RBAC semantics", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialGroups: [
      {
        externalId: "okta-group-hr-ops",
        groupKey: "GROUP-HR-OPS",
        displayName: "Synthetic HR Operations",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
      {
        externalId: "okta-group-onboarding",
        groupKey: "GROUP-ONBOARDING",
        displayName: "Synthetic Onboarding",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
    ],
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-group-001",
        employeeNumber: "EMP-GROUP-001",
        email: "group.identity@example.invalid",
        displayName: "Group Identity",
        givenName: "Group",
        familyName: "Identity",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const projection: OktaGroupProjection = {
    operation: "replace_user_groups",
    employeeNumber: "EMP-GROUP-001",
    groupKeys: ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
    effectiveAt: "2026-05-18T09:00:00.000Z",
  };

  const successResult = await adapter.projectGroups(projection);

  assert.deepEqual(successResult, {
    outcome: "success",
    operation: "replace_user_groups",
    employeeNumber: "EMP-GROUP-001",
    groupKeys: ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
    effectiveAt: "2026-05-18T09:00:00.000Z",
    metadata: expectedMockGroupMetadata(
      "EMP-GROUP-001",
      ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
      "2026-05-18T09:00:00.000Z",
    ),
  });

  successResult.groupKeys.push("GROUP-MUTATED-BY-CALLER");

  assert.deepEqual(await adapter.projectGroups(projection), {
    outcome: "skipped",
    operation: "replace_user_groups",
    employeeNumber: "EMP-GROUP-001",
    reason: "already_projected",
    groupKeys: ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
    effectiveAt: "2026-05-18T09:00:00.000Z",
    metadata: expectedMockGroupMetadata(
      "EMP-GROUP-001",
      ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
      "2026-05-18T09:00:00.000Z",
    ),
  });

  assert.deepEqual(
    await adapter.projectGroups({
      operation: "replace_user_groups",
      employeeNumber: "EMP-GROUP-001",
      groupKeys: ["GROUP-HR-OPS", "GROUP-UNKNOWN"],
      effectiveAt: "2026-05-18T10:00:00.000Z",
    }),
    {
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: "EMP-GROUP-001",
      errorCode: "mock_unknown_group",
      message: "Synthetic group projection references unknown group keys.",
      groupKeys: ["GROUP-HR-OPS", "GROUP-UNKNOWN"],
      effectiveAt: "2026-05-18T10:00:00.000Z",
      metadata: expectedMockGroupMetadata(
        "EMP-GROUP-001",
        ["GROUP-HR-OPS", "GROUP-UNKNOWN"],
        "2026-05-18T10:00:00.000Z",
      ),
    },
  );

  assert.deepEqual(
    await adapter.projectGroups({
      operation: "append_user_group",
      employeeNumber: "EMP-GROUP-001",
      groupKeys: ["GROUP-HR-OPS"],
      effectiveAt: "2026-05-18T10:30:00.000Z",
    } as unknown as OktaGroupProjection),
    {
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: "EMP-GROUP-001",
      errorCode: "mock_invalid_group_operation",
      message: "Synthetic group projection operation is not supported.",
      groupKeys: ["GROUP-HR-OPS"],
      effectiveAt: "2026-05-18T10:30:00.000Z",
      metadata: expectedMockGroupMetadata(
        "EMP-GROUP-001",
        ["GROUP-HR-OPS"],
        "2026-05-18T10:30:00.000Z",
      ),
    },
  );

  assert.deepEqual(await adapter.projectGroups(projection), {
    outcome: "skipped",
    operation: "replace_user_groups",
    employeeNumber: "EMP-GROUP-001",
    reason: "already_projected",
    groupKeys: ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
    effectiveAt: "2026-05-18T09:00:00.000Z",
    metadata: expectedMockGroupMetadata(
      "EMP-GROUP-001",
      ["GROUP-HR-OPS", "GROUP-ONBOARDING"],
      "2026-05-18T09:00:00.000Z",
    ),
  });

  assert.deepEqual(
    await adapter.projectGroups({
      operation: "replace_user_groups",
      employeeNumber: "EMP-MISSING",
      groupKeys: ["GROUP-UNKNOWN"],
      effectiveAt: "2026-05-18T11:00:00.000Z",
    }),
    {
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: "EMP-MISSING",
      errorCode: "mock_unknown_group",
      message: "Synthetic group projection references unknown group keys.",
      groupKeys: ["GROUP-UNKNOWN"],
      effectiveAt: "2026-05-18T11:00:00.000Z",
      metadata: expectedMockGroupMetadata(
        "EMP-MISSING",
        ["GROUP-UNKNOWN"],
        "2026-05-18T11:00:00.000Z",
      ),
    },
  );
});

test("mock Okta group projection rejects invalid operations before membership writes", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialGroups: [
      {
        externalId: "okta-group-primary",
        groupKey: "GROUP-PRIMARY",
        displayName: "Synthetic Primary",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
      {
        externalId: "okta-group-secondary",
        groupKey: "GROUP-SECONDARY",
        displayName: "Synthetic Secondary",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
    ],
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-invalid-group-op-001",
        employeeNumber: "EMP-GROUP-INVALID-OP-001",
        email: "group.invalid.operation@example.invalid",
        displayName: "Group Invalid Operation",
        givenName: "Group",
        familyName: "Invalid Operation",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const originalProjection: OktaGroupProjection = {
    operation: "replace_user_groups",
    employeeNumber: "EMP-GROUP-INVALID-OP-001",
    groupKeys: ["GROUP-PRIMARY"],
    effectiveAt: "2026-05-18T09:00:00.000Z",
  };

  assert.equal(
    (await adapter.projectGroups(originalProjection)).outcome,
    "success",
  );

  assert.deepEqual(
    await adapter.projectGroups({
      operation: "append_user_group",
      employeeNumber: "EMP-GROUP-INVALID-OP-001",
      groupKeys: ["GROUP-SECONDARY"],
      effectiveAt: "2026-05-18T10:00:00.000Z",
    } as unknown as OktaGroupProjection),
    {
      outcome: "permanent_failure",
      operation: "replace_user_groups",
      employeeNumber: "EMP-GROUP-INVALID-OP-001",
      errorCode: "mock_invalid_group_operation",
      message: "Synthetic group projection operation is not supported.",
      groupKeys: ["GROUP-SECONDARY"],
      effectiveAt: "2026-05-18T10:00:00.000Z",
      metadata: expectedMockGroupMetadata(
        "EMP-GROUP-INVALID-OP-001",
        ["GROUP-SECONDARY"],
        "2026-05-18T10:00:00.000Z",
      ),
    },
  );

  assert.deepEqual(await adapter.projectGroups(originalProjection), {
    outcome: "skipped",
    operation: "replace_user_groups",
    employeeNumber: "EMP-GROUP-INVALID-OP-001",
    reason: "already_projected",
    groupKeys: ["GROUP-PRIMARY"],
    effectiveAt: "2026-05-18T09:00:00.000Z",
    metadata: expectedMockGroupMetadata(
      "EMP-GROUP-INVALID-OP-001",
      ["GROUP-PRIMARY"],
      "2026-05-18T09:00:00.000Z",
    ),
  });
});

test("mock Okta group projection metadata uses locale-independent group key ordering", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialGroups: [
      {
        externalId: "okta-group-alpha",
        groupKey: "GROUP-ALPHA",
        displayName: "Synthetic Alpha",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
      {
        externalId: "okta-group-zeta",
        groupKey: "GROUP-ZETA",
        displayName: "Synthetic Zeta",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
    ],
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-group-order-001",
        employeeNumber: "EMP-GROUP-ORDER-001",
        email: "group.order@example.invalid",
        displayName: "Group Order",
        givenName: "Group",
        familyName: "Order",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const originalLocaleCompare = String.prototype.localeCompare;
  String.prototype.localeCompare = () => {
    throw new Error("group key normalization must not use locale collation");
  };

  try {
    assert.deepEqual(
      await adapter.projectGroups({
        operation: "replace_user_groups",
        employeeNumber: "EMP-GROUP-ORDER-001",
        groupKeys: [" GROUP-ZETA ", "GROUP-ALPHA", "GROUP-ZETA"],
        effectiveAt: "2026-05-18T12:00:00.000Z",
      }),
      {
        outcome: "success",
        operation: "replace_user_groups",
        employeeNumber: "EMP-GROUP-ORDER-001",
        groupKeys: ["GROUP-ALPHA", "GROUP-ZETA"],
        effectiveAt: "2026-05-18T12:00:00.000Z",
        metadata: expectedMockGroupMetadata(
          "EMP-GROUP-ORDER-001",
          ["GROUP-ALPHA", "GROUP-ZETA"],
          "2026-05-18T12:00:00.000Z",
        ),
      },
    );
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }
});

test("mock Okta group projection metadata encodes group keys unambiguously", async () => {
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialGroups: [
      {
        externalId: "okta-group-comma",
        groupKey: "GROUP,ALPHA",
        displayName: "Synthetic Comma",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
      {
        externalId: "okta-group-colon",
        groupKey: "GROUP:ALPHA",
        displayName: "Synthetic Colon",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
    ],
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-group-key-001",
        employeeNumber: "EMP:GROUP,KEY-001",
        email: "group.key@example.invalid",
        displayName: "Group Key",
        givenName: "Group",
        familyName: "Key",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const result = await adapter.projectGroups({
    operation: "replace_user_groups",
    employeeNumber: "EMP:GROUP,KEY-001",
    groupKeys: ["GROUP:ALPHA", "GROUP,ALPHA"],
    effectiveAt: "2026-05-18T13:00:00.000Z",
  });

  assert.deepEqual(result.metadata, {
    adapterMode: "mock",
    provider: "okta",
    projectionKey:
      "okta:mock:replace_user_groups:EMP%3AGROUP%2CKEY-001:%5B%22GROUP%2CALPHA%22%2C%22GROUP%3AALPHA%22%5D:2026-05-18T13%3A00%3A00.000Z",
    synthetic: true,
  });
  assert.deepEqual(
    result.metadata.projectionKey.split(":").map(decodeURIComponent),
    [
      "okta",
      "mock",
      "replace_user_groups",
      "EMP:GROUP,KEY-001",
      '["GROUP,ALPHA","GROUP:ALPHA"]',
      "2026-05-18T13:00:00.000Z",
    ],
  );
});

test("mock Okta projections reject malformed projection key fields without throwing", async () => {
  const malformedSurrogate = "\uD800";
  const adapter = buildOktaMasteringAdapter({
    mode: "mock",
    initialGroups: [
      {
        externalId: "okta-group-stable",
        groupKey: "GROUP-STABLE",
        displayName: "Synthetic Stable",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
      {
        externalId: "okta-group-replacement",
        groupKey: "GROUP-REPLACEMENT",
        displayName: "Synthetic Replacement",
        purpose: "poc_identity_lifecycle_membership",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      },
    ],
    initialUsers: [
      createSyntheticOktaUserFixture({
        externalId: "okta-user-malformed-key-001",
        employeeNumber: "EMP-MALFORMED-001",
        email: "malformed.key@example.invalid",
        displayName: "Malformed Key",
        givenName: "Malformed",
        familyName: "Key",
        status: "active",
        departmentCode: "DEPT-SYN",
        effectiveAt: "2026-05-18T08:00:00.000Z",
      }),
    ],
  });

  const userResult = await adapter.project({
    operation: "create",
    desiredUser: createSyntheticOktaUserFixture({
      externalId: "okta-user-malformed-key-002",
      employeeNumber: `EMP-${malformedSurrogate}`,
      email: "malformed.user@example.invalid",
      displayName: "Malformed User",
      givenName: "Malformed",
      familyName: "User",
      status: "staged",
      departmentCode: "DEPT-SYN",
      effectiveAt: "2026-05-18T14:00:00.000Z",
    }),
  });

  assert.equal(userResult.outcome, "permanent_failure");
  if (userResult.outcome !== "permanent_failure") {
    assert.fail("malformed user projection should fail closed");
  }
  assert.equal(userResult.errorCode, "mock_invalid_projection_key");
  assert.equal(
    userResult.message,
    "Synthetic projection key fields must be well-formed Unicode strings.",
  );
  assert.match(userResult.metadata.projectionKey, /EMP-%EF%BF%BD/);

  const originalProjection: OktaGroupProjection = {
    operation: "replace_user_groups",
    employeeNumber: "EMP-MALFORMED-001",
    groupKeys: ["GROUP-STABLE"],
    effectiveAt: "2026-05-18T14:30:00.000Z",
  };
  assert.equal(
    (await adapter.projectGroups(originalProjection)).outcome,
    "success",
  );

  const groupResult = await adapter.projectGroups({
    operation: "replace_user_groups",
    employeeNumber: "EMP-MALFORMED-001",
    groupKeys: ["GROUP-REPLACEMENT"],
    effectiveAt: `2026-05-18T15:00:00.000Z${malformedSurrogate}`,
  });

  assert.equal(groupResult.outcome, "permanent_failure");
  if (groupResult.outcome !== "permanent_failure") {
    assert.fail("malformed group projection should fail closed");
  }
  assert.equal(groupResult.errorCode, "mock_invalid_projection_key");
  assert.equal(
    groupResult.message,
    "Synthetic projection key fields must be well-formed Unicode strings.",
  );
  assert.match(groupResult.metadata.projectionKey, /%EF%BF%BD$/);

  const malformedGroupKeyResult = await adapter.projectGroups({
    operation: "replace_user_groups",
    employeeNumber: "EMP-MALFORMED-001",
    groupKeys: [`GROUP-${malformedSurrogate}`],
    effectiveAt: "2026-05-18T15:30:00.000Z",
  });

  assert.equal(malformedGroupKeyResult.outcome, "permanent_failure");
  if (malformedGroupKeyResult.outcome !== "permanent_failure") {
    assert.fail("malformed group keys should fail closed");
  }
  assert.equal(
    malformedGroupKeyResult.errorCode,
    "mock_invalid_projection_key",
  );
  assert.equal(
    malformedGroupKeyResult.message,
    "Synthetic projection key fields must be well-formed Unicode strings.",
  );
  assert.equal(
    malformedGroupKeyResult.metadata.projectionKey,
    [
      "okta",
      "mock",
      encodeURIComponent("replace_user_groups"),
      encodeURIComponent("EMP-MALFORMED-001"),
      encodeURIComponent(JSON.stringify([`GROUP-${malformedSurrogate}`])),
      encodeURIComponent("2026-05-18T15:30:00.000Z"),
    ].join(":"),
  );

  assert.deepEqual(await adapter.projectGroups(originalProjection), {
    outcome: "skipped",
    operation: "replace_user_groups",
    employeeNumber: "EMP-MALFORMED-001",
    reason: "already_projected",
    groupKeys: ["GROUP-STABLE"],
    effectiveAt: "2026-05-18T14:30:00.000Z",
    metadata: expectedMockGroupMetadata(
      "EMP-MALFORMED-001",
      ["GROUP-STABLE"],
      "2026-05-18T14:30:00.000Z",
    ),
  });
});

test("real Okta mastering mode stays blocked until local placeholder credentials are replaced", () => {
  const envPrefix = "HRCORE_" + "OKTA" + "_";
  const envKeys = [
    `${envPrefix}BASE_URL`,
    `${envPrefix}CLIENT_ID`,
    `${envPrefix}CLIENT_SECRET`,
  ];
  const config = resolveLocalOktaMasteringConfig({
    [envKeys[0]]: "<okta-verification-tenant-url>",
    [envKeys[1]]: "<okta-client-id>",
    [envKeys[2]]: "<okta-client-secret>",
  });

  assert.deepEqual(config, {
    mode: "blocked",
    reason: "missing_trusted_local_credentials",
    missing: envKeys,
  });
  assert.throws(
    () => buildOktaMasteringAdapter(config),
    /Real Okta mastering adapter is not implemented for this PoC/,
  );
});

function expectedMockMetadata(
  operation: string,
  employeeNumber: string,
  effectiveAt: string,
): OktaMasteringProjectionMetadata {
  return {
    adapterMode: "mock",
    provider: "okta",
    projectionKey: [
      "okta",
      "mock",
      encodeURIComponent(operation),
      encodeURIComponent(employeeNumber),
      encodeURIComponent(effectiveAt),
    ].join(":"),
    synthetic: true,
  };
}

function expectedMockGroupMetadata(
  employeeNumber: string,
  groupKeys: string[],
  effectiveAt: string,
) {
  return {
    adapterMode: "mock",
    provider: "okta",
    projectionKey: [
      "okta",
      "mock",
      encodeURIComponent("replace_user_groups"),
      encodeURIComponent(employeeNumber),
      encodeURIComponent(JSON.stringify(groupKeys)),
      encodeURIComponent(effectiveAt),
    ].join(":"),
    synthetic: true,
  };
}
