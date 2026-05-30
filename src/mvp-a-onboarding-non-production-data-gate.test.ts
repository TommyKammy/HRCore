import assert from "node:assert/strict";
import test from "node:test";

import {
  assertMvpAOnboardingFixtureSeedText,
  assertMvpAOnboardingNonProductionApiResponseField,
  assertMvpAOnboardingNonProductionDataGate,
  assertMvpAOnboardingNonProductionPayloadKey,
  assertMvpAOnboardingPracticalUseDataEvidence,
  mvpAOnboardingNonProductionDataGate,
} from "./mvp-a-onboarding-non-production-data-gate.js";
import {
  createOnboardingTransactionRequestFixture,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
} from "./onboarding-transaction-request.js";

test("MVP-A onboarding non-production data handling gate is explicit and fail-closed", () => {
  assert.doesNotThrow(() =>
    assertMvpAOnboardingNonProductionDataGate(
      mvpAOnboardingNonProductionDataGate,
    ),
  );
});

test("MVP-A practical-use data evidence rejects missing approval shape", () => {
  assert.throws(
    () =>
      assertMvpAOnboardingPracticalUseDataEvidence(
        mvpAOnboardingNonProductionDataGate,
        {
          evidenceType: "approved_non_production_dataset",
          datasetReference: "masked-non-production-review-fixture",
        },
      ),
    /missing required approved_non_production_dataset evidence/u,
  );
});

test("MVP-A practical-use data evidence accepts only synthetic or fully approved non-production shape", () => {
  assert.doesNotThrow(() =>
    assertMvpAOnboardingPracticalUseDataEvidence(
      mvpAOnboardingNonProductionDataGate,
      {
        evidenceType: "repo_owned_synthetic_fixture",
        datasetReference: "repo-owned-onboarding-fixture",
        tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
      },
    ),
  );

  assert.doesNotThrow(() =>
    assertMvpAOnboardingPracticalUseDataEvidence(
      mvpAOnboardingNonProductionDataGate,
      {
        evidenceType: "approved_non_production_dataset",
        datasetReference: "masked-non-production-review-fixture",
        tenantEnvironmentId: "approved_non_production_review_lab_203",
        maskingProfileReference: "masking-profile://mvp-a/non-production/203",
        approvalReference: "approval://mvp-a/non-production/203",
        privacyReviewReference: "privacy-review://mvp-a/non-production/203",
        dataOwnerApprovalReference:
          "data-owner-approval://mvp-a/non-production/203",
        approvedAt: "2026-05-30T00:00:00Z",
        expiresAt: "2099-06-30T00:00:00Z",
        containsRealPersonnelData: false,
        productionLikeSource: false,
      },
    ),
  );

  assert.throws(
    () =>
      assertMvpAOnboardingPracticalUseDataEvidence(
        mvpAOnboardingNonProductionDataGate,
        {
          evidenceType: "approved_non_production_dataset",
          datasetReference: "masked-non-production-review-fixture",
          tenantEnvironmentId: "approved_non_production_review_lab_203",
          maskingProfileReference: "masking-profile://mvp-a/non-production/203",
          approvalReference: "approval://mvp-a/non-production/203",
          privacyReviewReference: "privacy-review://mvp-a/non-production/203",
          dataOwnerApprovalReference:
            "data-owner-approval://mvp-a/non-production/203",
          approvedAt: "2026-05-30T00:00:00Z",
          expiresAt: "2099-06-30T00:00:00Z",
          containsRealPersonnelData: true,
          productionLikeSource: false,
        },
      ),
    /must not approve real personnel or production-like data/u,
  );
});

test("MVP-A synthetic practical-use evidence requires concrete string references", () => {
  for (const [caseName, evidence] of [
    [
      "boolean dataset reference",
      {
        evidenceType: "repo_owned_synthetic_fixture",
        datasetReference: true,
        tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
      },
    ],
    [
      "object dataset reference",
      {
        evidenceType: "repo_owned_synthetic_fixture",
        datasetReference: { fixture: "repo-owned-onboarding-fixture" },
        tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
      },
    ],
    [
      "object tenant environment",
      {
        evidenceType: "repo_owned_synthetic_fixture",
        datasetReference: "repo-owned-onboarding-fixture",
        tenantEnvironmentId: {
          tenant: "repo_owned_synthetic_mvp_a_onboarding",
        },
      },
    ],
  ] as const) {
    assert.throws(
      () =>
        assertMvpAOnboardingPracticalUseDataEvidence(
          mvpAOnboardingNonProductionDataGate,
          evidence as never,
        ),
      /missing required repo_owned_synthetic_fixture evidence/u,
      `expected ${caseName} to fail closed`,
    );
  }
});

test("MVP-A approved non-production evidence rejects placeholder approval and invalid dates", () => {
  const approvedEvidence = {
    evidenceType: "approved_non_production_dataset",
    datasetReference: "masked-non-production-review-fixture",
    tenantEnvironmentId: "approved_non_production_review_lab_203",
    maskingProfileReference: "masking-profile://mvp-a/non-production/203",
    approvalReference: "approval://mvp-a/non-production/203",
    privacyReviewReference: "privacy-review://mvp-a/non-production/203",
    dataOwnerApprovalReference:
      "data-owner-approval://mvp-a/non-production/203",
    approvedAt: "2026-05-30T00:00:00Z",
    expiresAt: "2099-06-30T00:00:00Z",
    containsRealPersonnelData: false,
    productionLikeSource: false,
  } as const;

  for (const fieldName of [
    "datasetReference",
    "tenantEnvironmentId",
    "maskingProfileReference",
    "approvalReference",
    "privacyReviewReference",
    "dataOwnerApprovalReference",
  ] as const) {
    assert.throws(
      () =>
        assertMvpAOnboardingPracticalUseDataEvidence(
          mvpAOnboardingNonProductionDataGate,
          {
            ...approvedEvidence,
            [fieldName]: `${fieldName}-placeholder-203`,
          },
        ),
      /approved_non_production_dataset evidence/u,
      `expected ${fieldName} placeholder to fail closed`,
    );
  }

  for (const [caseName, evidence] of [
    [
      "malformed approvedAt",
      {
        ...approvedEvidence,
        approvedAt: "not-a-date",
      },
    ],
    [
      "nonexistent approvedAt date",
      {
        ...approvedEvidence,
        approvedAt: "2026-02-31T00:00:00Z",
      },
    ],
    [
      "malformed expiresAt",
      {
        ...approvedEvidence,
        expiresAt: "not-a-date",
      },
    ],
    [
      "nonexistent expiresAt date",
      {
        ...approvedEvidence,
        expiresAt: "2099-02-31T00:00:00Z",
      },
    ],
    [
      "expired evidence",
      {
        ...approvedEvidence,
        approvedAt: "1999-01-01T00:00:00Z",
        expiresAt: "2000-01-01T00:00:00Z",
      },
    ],
    [
      "expiresAt equal to approvedAt",
      {
        ...approvedEvidence,
        expiresAt: approvedEvidence.approvedAt,
      },
    ],
    [
      "expiresAt before approvedAt",
      {
        ...approvedEvidence,
        expiresAt: "2026-05-29T00:00:00Z",
      },
    ],
    [
      "future approvedAt",
      {
        ...approvedEvidence,
        approvedAt: "2099-05-30T00:00:00Z",
        expiresAt: "2100-05-30T00:00:00Z",
      },
    ],
    [
      "nullable real personnel flag",
      {
        ...approvedEvidence,
        containsRealPersonnelData: null as never,
      },
    ],
    [
      "string production-like flag",
      {
        ...approvedEvidence,
        productionLikeSource: "false" as never,
      },
    ],
  ] as const) {
    assert.throws(
      () =>
        assertMvpAOnboardingPracticalUseDataEvidence(
          mvpAOnboardingNonProductionDataGate,
          evidence,
        ),
      /approved_non_production_dataset evidence/u,
      `expected ${caseName} to fail closed`,
    );
  }
});

test("MVP-A onboarding parser rejects non-production data payload drift", () => {
  for (const prohibitedKey of [
    ...mvpAOnboardingNonProductionDataGate.prohibitedPayloadKeys,
  ]) {
    const fixture = createOnboardingTransactionRequestFixture();
    assert.throws(
      () =>
        parseOnboardingTransactionRequestInput({
          ...fixture,
          payload: {
            ...fixture.payload,
            [prohibitedKey]: "blocked",
          },
        }),
      (error) =>
        error instanceof OnboardingTransactionRequestValidationError &&
        error instanceof Error &&
        error.message ===
          `payload contains unsupported fields: ${prohibitedKey}`,
      `expected payload.${prohibitedKey} to be rejected`,
    );

    assert.throws(
      () =>
        assertMvpAOnboardingNonProductionPayloadKey(
          mvpAOnboardingNonProductionDataGate,
          prohibitedKey,
        ),
      /exposes prohibited non-production data surface/u,
      `expected gate to reject ${prohibitedKey}`,
    );
  }
});

test("MVP-A onboarding non-production gate rejects API and fixture or seed drift", () => {
  for (const fieldName of [
    "productionLikeData",
    "unmaskedEmail",
    "originalValue",
  ]) {
    assert.throws(
      () =>
        assertMvpAOnboardingNonProductionApiResponseField(
          mvpAOnboardingNonProductionDataGate,
          fieldName,
        ),
      /exposes prohibited non-production data surface/u,
      `expected API response field ${fieldName} to be rejected`,
    );
  }

  assert.throws(
    () =>
      assertMvpAOnboardingFixtureSeedText(
        mvpAOnboardingNonProductionDataGate,
        "src/fixture-seed.ts",
        "const fixture = 'real employee';",
      ),
    /contains prohibited non-production data token/u,
  );
});
