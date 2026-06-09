# P2X-04 Retention Deletion Future Extension Prerequisite Lane

Issue: #378
Part of: #371
Depends on: #371
Review scope: production-like prerequisite decomposition for
retention/deletion, anonymization, hard-delete, legal-hold, retention log,
restore cleanup, no-orphan tests, and future-extension schema/API/runtime
authorization boundaries.
Review mode: repository-owned prerequisite record. This document records
missing evidence and blocked status only; it does not replace project-owner,
HR operator, legal, privacy, security, data-owner, operational, architecture,
or two-key approval.

## Lane Verdict

Final verdict: Blocked prerequisite lane.

This lane decomposes the evidence required before a later retention/deletion
runtime or future-extension readiness claim can be evaluated. It does not
approve retention/deletion runtime. It does not approve future-extension
runtime. It does not accept HR practical-use readiness. It does not accept
production-like readiness.

Current repository evidence remains design-only, Proposed, bounded, and
explicitly non-production only. P2X-04 adds prerequisite decomposition evidence
around the blocked retention/deletion and future-extension boundary; it does
not expand the boundary.

## Evidence Anchors

| Anchor                                                                                                       | Current role                                            | Lane finding                                                                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/adr/0009-retiree-retention-physical-deletion-boundary.md`                                              | Proposed MVP-A/v1 retiree retention boundary            | Proposed/design anchor only; it is not a retention/deletion runtime decision or legal-hold approval.         |
| `docs/adr/0015-my-number-external-reference-separate-schema-boundary.md`                                     | Proposed My Number future-extension boundary            | Proposed/design anchor only; not schema/API/runtime authorization.                                           |
| `docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md` | Proposed sensitive personal information extension       | Proposed/design anchor only; not privacy-classification or consent runtime approval.                         |
| `docs/adr/0017-employment-status-work-arrangement-extension-boundary.md`                                     | Proposed employment-status/work-arrangement extension   | Proposed/design anchor only; not leave/work-arrangement runtime readiness.                                   |
| `docs/adr/0018-retiree-retention-anonymization-deletion-job-retention-log-extension-boundary.md`             | Proposed retiree retention/deletion extension boundary  | Proposed/design anchor only; not anonymization job, deletion job, legal-hold, or retention-log runtime.      |
| `docs/adr/0019-legal-entity-timezone-business-calendar-extension-boundary.md`                                | Proposed legal-entity/timezone/business-calendar anchor | Proposed/design anchor only; not legal-entity, timezone, business-calendar, or future-date worker authority. |
| `docs/adr/0020-r08-prohibited-column-payload-policy-boundary.md`                                             | Proposed prohibited column/payload policy boundary      | Proposed/design anchor only; not parser/full-engine or migration/runtime authorization.                      |
| `docs/mvp-c-p2c-01-readiness-review-closeout.md`                                                             | MVP-C bounded termination readiness closeout            | Bounded synthetic termination evidence keeps retention/deletion runtime blocked.                             |
| `docs/mvp-c-p2c-02-refactor-wave-closeout.md`                                                                | MVP-C behavior-preserving refactor closeout             | Refactor evidence preserves existing bounded behavior only; it does not add retention/deletion runtime.      |
| `docs/p2x-production-like-blocker-matrix.md`                                                                 | Production-like blocker ledger                          | Retention/deletion and future-extension rows stay Blocked with required owner evidence.                      |

## Required Future Evidence

The following evidence must be supplied by a later, explicitly scoped record
before this lane can move beyond Blocked:

- retention/deletion ADR evidence naming status, author, approver,
  counter-approver or documented exception, time-locked review window, and the
  separate future acceptance record.
- jurisdiction and legal-entity applicability naming country, legal entity,
  business calendar, timezone source, statutory basis, owner, and exception
  handling.
- anonymization, hard-delete, and legal-hold behavior covering request
  eligibility, approval workflow, conflict handling, denial reasons, audit
  evidence, and fail-closed defaults.
- deletion-job custody naming job owner, trigger authority, dry-run evidence,
  affected-record scope, retry behavior, rollback/restore interaction, and
  incident escalation.
- retention log evidence naming system retention-action records, human audit
  records, shared correlation id behavior, immutable review expectations, and
  missing-evidence denial.
- restore cleanup evidence proving restored records preserve deletion,
  anonymization, legal-hold, retention exception, and audit/correlation
  bindings.
- no-orphan tests covering lifecycle events, transaction requests, audit
  events, contact points, employment, assignment, writeback evidence, retention
  action logs, and future-extension records.
- extension scope records naming each future-extension surface, data class,
  schema/API boundary, payload boundary, migration owner, and runtime owner.
- migration/runtime authorization proving each extension has a scoped ADR,
  migration plan, parser/validator enforcement, rollback plan, and two-key
  review boundary.
- negative no-escape-hatch tests proving prohibited payload fields, untyped
  metadata, raw provider data, notes, attachments, fixtures, seeds, and
  migration examples cannot bypass the blocked boundary.
- owner decision record naming legal, privacy, security, architecture,
  operations, data-owner, project-owner, and two-key approval boundaries.

This prerequisite record does not supply any of that evidence.

## Blocked Boundary

- retention/deletion runtime: Blocked.
- retention/deletion jobs: Blocked.
- retention/deletion requests: Blocked.
- anonymization job: Blocked.
- hard-delete job: Blocked.
- legal-hold workflow: Blocked.
- deletion-job custody: Blocked.
- retention log runtime: Blocked.
- restore cleanup: Blocked.
- no-orphan tests: Blocked.
- jurisdiction/legal-entity applicability: Blocked.
- future-extension runtime: Blocked.
- future-extension readiness: Blocked.
- extension scope records: Blocked.
- migration/runtime authorization: Blocked.
- negative no-escape-hatch tests: Blocked.
- real employee data processing: Blocked.
- legal/privacy approval: Blocked.
- HR practical-use readiness: Blocked.
- production-like readiness: Blocked.
- two-key approval: Blocked.

## Follow-Up Shape

A later implementation issue may be created only after a separate owner-reviewed
evidence package names the exact retention/deletion ADR evidence, jurisdiction
and legal-entity applicability, anonymization/hard-delete/legal-hold behavior,
deletion-job custody, retention log, restore cleanup, no-orphan tests,
extension scope records, migration/runtime authorization, negative
no-escape-hatch tests, and operating owner being requested.

That later issue must not rely on this prerequisite record, issue titles,
neighboring closeout language, README status text, Proposed ADR anchors,
bounded synthetic termination evidence, local audit rows, fixture logs,
ordinary migration numbering, generic metadata fields, or operator notes as
approval.

## Verification Commands

Focused reproduction before this lane:

```sh
npm test -- --test-name-pattern "P2X-04 retention deletion future-extension prerequisite lane"
```

The focused guard failed because
`docs/p2x-04-retention-deletion-future-extension-prerequisite-lane.md` was
missing.

Focused verification after this lane:

```sh
npm test -- --test-name-pattern "P2X-04 retention deletion future-extension prerequisite lane"
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, policy-as-code scanning, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## No Surface Expansion Confirmation

No product behavior, migration, API surface, UI workflow, provider integration,
production operation, support-console authority, export expansion,
raw-payload viewer, production queue, DLQ runtime, retention/deletion job, real
employee data flow, live IdP/Okta path, provider credential use, webhook
runtime, legal/privacy approval, two-key approval, HR practical-use readiness,
or production-like readiness surface is introduced by this prerequisite lane.

- No retention/deletion runtime.
- No anonymization job.
- No hard-delete job.
- No legal-hold workflow.
- No retention log runtime.
- No restore cleanup runtime.
- No future-extension schema.
- No future-extension API.
- No future-extension runtime.
- No migration/runtime authorization.
- No prohibited-payload runtime.
- No real employee data.
- No live IdP/Okta.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No legal/privacy approval claim.
- No two-key approval claim.
- No HR practical-use readiness.
- No production-like readiness surface.

## Epic Update Boundary

Epic #371 can scope this child to retention/deletion and future-extension
prerequisite decomposition only.

Retention/deletion runtime, anonymization, hard-delete, legal-hold, deletion-job
custody, retention log, restore cleanup, no-orphan tests, future-extension
runtime, migration/runtime authorization, legal/privacy approval, HR
practical-use readiness, and production-like readiness remain blocked. Future
records must separately supply owner evidence before changing that status.
