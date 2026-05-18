import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
  resolveLocalOktaMasteringConfig,
  type OktaGroupProjection,
  type OktaMasteringProjection,
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

test("real Okta mastering mode stays blocked until local placeholder credentials are replaced", () => {
  const config = resolveLocalOktaMasteringConfig({
    HRCORE_OKTA_BASE_URL: "<okta-verification-tenant-url>",
    HRCORE_OKTA_CLIENT_ID: "<okta-client-id>",
    HRCORE_OKTA_CLIENT_SECRET: "<okta-client-secret>",
  });

  assert.deepEqual(config, {
    mode: "blocked",
    reason: "missing_trusted_local_credentials",
    missing: [
      "HRCORE_OKTA_BASE_URL",
      "HRCORE_OKTA_CLIENT_ID",
      "HRCORE_OKTA_CLIENT_SECRET",
    ],
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
) {
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
