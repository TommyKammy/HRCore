# MVP-A Onboarding Non-Production Data Handling Gate

MVP-A practical-use review is limited by the executable gate
`mvp_a_onboarding_non_production_data_handling_v1` in
`src/mvp-a-onboarding-non-production-data-gate.ts`. The gate is anchored to
`mvp_a_onboarding_pii_export_closed_v1`, so #202 and the P2A-02 raw/export
closure remain authoritative until later accepted evidence exists.

Accepted evidence shapes:

- `repo_owned_synthetic_fixture`: requires `evidenceType`, `datasetReference`,
  and `tenantEnvironmentId` bound to
  `repo_owned_synthetic_mvp_a_onboarding`.
- `approved_non_production_dataset`: requires `evidenceType`,
  `datasetReference`, `tenantEnvironmentId`, `maskingProfileReference`,
  `approvalReference`, `privacyReviewReference`,
  `dataOwnerApprovalReference`, `approvedAt`, `expiresAt`,
  `containsRealPersonnelData`, and `productionLikeSource`. The two boolean
  fields must be false.

Masking remains mandatory for any approved non-production dataset and for
display-name, work-email, and provider-subject evidence if later review data is
not entirely repo-owned synthetic fixture data. Missing, placeholder-only, or
partially trusted approval evidence fails closed; repo tests and issue text are
not approval evidence.

Automated checks cover:

- prohibited payload keys such as production-like or unmasked data markers;
- fixture and seed text tokens that would claim actual personnel examples;
- onboarding API response, schema, and migration field drift toward unmasked or
  production-like data surfaces;
- documentation blockers that keep the gate visibly bounded.

Remaining blockers:

- #202 P2A-02 bounded/non-production gate remains authoritative;
- #203 legal/privacy approval evidence placeholder;
- #203 independent data-owner approval placeholder;
- #203 two-key approval record placeholder;
- real-data processing remains blocked until later accepted evidence.

This gate does not approve legal approval, privacy approval, real-data
processing, production-like data processing, raw payload viewing, CSV/export,
download logs, watermark/manifest behavior, My Number, Specific Personal
Information, or sensitive personal information.
