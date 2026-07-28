import assert from "node:assert/strict";
import test from "node:test";

import {
  fingerprintP2ListCollectionRequest,
  fingerprintP2ListRequestInput,
  resolveP2ListCorrelationAcceptedAt,
} from "./p2list-request-identity.js";

test("P2LIST request identity is canonical and operation scoped", () => {
  const left = fingerprintP2ListRequestInput("employee.list", {
    filters: { organizationCode: "ORG-001", employmentStatus: "active" },
  });
  const reordered = fingerprintP2ListRequestInput("employee.list", {
    filters: { employmentStatus: "active", organizationCode: "ORG-001" },
  });
  const otherOperation = fingerprintP2ListRequestInput(
    "lifecycleRequest.list",
    {
      filters: { employmentStatus: "active", organizationCode: "ORG-001" },
    },
  );

  assert.equal(left, reordered);
  assert.notEqual(left, otherOperation);
  assert.match(left, /^[A-Za-z0-9_-]{43}$/u);
});

test("P2LIST collection identity binds opaque pagination without retaining raw cursors", () => {
  const firstPage = fingerprintP2ListCollectionRequest(
    "employee.list",
    { organizationCode: "ORG-001" },
    "opaque-cursor-one",
  );
  const retry = fingerprintP2ListCollectionRequest(
    "employee.list",
    { organizationCode: "ORG-001" },
    "opaque-cursor-one",
  );
  const nextPage = fingerprintP2ListCollectionRequest(
    "employee.list",
    { organizationCode: "ORG-001" },
    "opaque-cursor-two",
  );

  assert.equal(firstPage, retry);
  assert.notEqual(firstPage, nextPage);
  assert.doesNotMatch(firstPage, /opaque-cursor/u);
});

test("P2LIST correlation clock reuses the first server acceptance time", async () => {
  const observedAt = "2026-07-29T00:00:01.000Z";
  assert.equal(
    await resolveP2ListCorrelationAcceptedAt(
      undefined,
      "correlation-new",
      observedAt,
    ),
    observedAt,
  );
  assert.equal(
    await resolveP2ListCorrelationAcceptedAt(
      {
        resolveCorrelationAcceptedAt: () => "2026-07-28T23:59:59.000Z",
      },
      "correlation-retry",
      observedAt,
    ),
    "2026-07-28T23:59:59.000Z",
  );
});
