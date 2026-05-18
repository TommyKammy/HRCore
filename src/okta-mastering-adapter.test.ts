import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  createSyntheticOktaUserFixture,
  resolveLocalOktaMasteringConfig,
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
    },
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
