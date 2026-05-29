# MVP-A Onboarding Backup / Restore Rehearsal Gate

MVP-A onboarding has a local synthetic backup / restore rehearsal gate. The
executable gate is `mvp_a_onboarding_backup_restore_rehearsal_v1` in
`src/mvp-a-onboarding-backup-restore-rehearsal.ts`.

The rehearsal seeds representative synthetic onboarding evidence, exports the
local evidence tables from one SQLite transaction, imports the snapshot into a
clean local database transaction, and re-runs
`verifyMvpAOnboardingCorrelationTrace` against the restored copy.

## Evidence Covered

- Success evidence: submitted request, approval, apply, mock Okta projection,
  work_email writeback, provider refresh, lifecycle event, and audit events.
- Failure / partial-success evidence: HR Core apply remains completed when the
  mock provider fails retryably, and restored verification does not infer
  writeback evidence.
- Conflict evidence: an existing manual work_email value preserves restored
  writeback conflict evidence linked to the deterministic writeback event.
- Failed restore cleanup: restore writes are transactional; a rejected restore
  rolls back without leaving a half-cleared or half-restored local database.

## Out Of Scope

This gate is not a production backup-readiness claim. It does not introduce or
approve:

- production RTO/RPO guarantees;
- cloud snapshots or point-in-time recovery;
- cross-region restore;
- secrets backup or rotation recovery;
- live tenant data backup;
- legal retention acceptance.

Those remain later production-readiness gates before real-data,
production-like, or live-tenant use.

## Verification

The canonical pre-PR verifier `npm run verify:pre-pr` includes the rehearsal
tests through `npm test`. Focused local coverage is:

```sh
npm run build
node --test dist/mvp-a-onboarding-backup-restore-rehearsal.test.js
```
