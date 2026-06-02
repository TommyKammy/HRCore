# MVP-D CSV Import Contract

MVP-D supports a bounded dry-run-only CSV contract for repo-owned synthetic
lifecycle-support rows. The reusable template columns are exported from
`src/csv-import-contract.ts` as `mvpDCsvImportTemplateColumns`, and the dry-run
entry point is `dryRunSyntheticLifecycleCsvImport`.

The only accepted template version is `mvp_d_lifecycle_support_v1`, and the only
accepted tenant environment is `repo_owned_synthetic_mvp_d_csv`. The dry-run
result reports accepted rows, rejected rows, deterministic validation reasons,
and deterministic `would_create_*_request` diffs. It does not mutate HRCore
records.

Unsupported CSV columns fail closed, including real employee data, regulated
data, raw provider payloads, retention/deletion fields, live-provider fields,
and future-extension fields. Downstream apply and Ops/DLQ work should reuse this
contract instead of redefining the MVP-D template.
