# MVP-D CSV Import Contract

MVP-D supports a bounded CSV contract for repo-owned synthetic
lifecycle-support rows. The reusable template columns are exported from
`src/csv-import-contract.ts` as `mvpDCsvImportTemplateColumns`; the dry-run entry
point is `dryRunSyntheticLifecycleCsvImport`, and the bounded apply entry point
is `applySyntheticLifecycleCsvImport`.

The only accepted template version is `mvp_d_lifecycle_support_v1`, and the only
accepted tenant environment is `repo_owned_synthetic_mvp_d_csv`. The dry-run
result reports accepted rows, rejected rows, deterministic validation reasons,
and deterministic `would_create_*_request` diffs. Apply requires the current
dry-run result for the exact CSV input and a real ISO timestamp. Apply records
import job and row outcome evidence with import and row fingerprints, writes
only bounded synthetic lifecycle-support transaction and lifecycle evidence, and
treats repeated applied rows as idempotent without duplicating lifecycle or
audit writes.

Transfer and termination apply rows must anchor `current_assignment_id` to an
open assignment for the same person. Reused correlation ids must match the same
accepted import fingerprint, and retried row ids must match the original row
fingerprint before idempotency is declared. Stale dry-runs, rejected dry-run
rows, missing apply actor/correlation context, conflicting row outcome evidence,
and invalid lifecycle references fail closed without broad CSV export, raw
payload viewing, live-provider writes, production queue or DLQ behavior, or
retention/deletion runtime.

Unsupported CSV columns fail closed, including real employee data, regulated
data, raw provider payloads, retention/deletion fields, live-provider fields,
and future-extension fields. Downstream Ops/DLQ work should reuse this contract
instead of redefining the MVP-D template.
