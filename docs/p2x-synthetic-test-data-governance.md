# P2X Synthetic Test-Data Governance

Issue: #351
Part of: #347
Depends on: #350
Review scope: synthetic or explicitly approved non-production test-data
governance for bounded MVP-A/B/C/D rehearsal only.
Review mode: repository-owned fixture and evidence guidance. This note is not
project-owner, HR operator, legal, privacy, security, data-owner, production
operations, production restore policy, statutory records management,
retention/deletion runtime, real-data approval, or two-key approval.

Use this note with `docs/p2x-local-bounded-operator-runbook.md`,
`docs/p2x-synthetic-practical-use-rehearsal-checklist.md`, and
`docs/p2x-cross-flow-audit-correlation-lookup-map.md`. It defines the test-data
shape allowed for bounded rehearsal across MVP-A onboarding, MVP-B transfer,
MVP-C termination, and MVP-D CSV/Ops/DLQ evidence.

## Data Governance Boundary

- bounded synthetic test data: Allowed.
- explicitly approved non-production examples: Allowed.
- approval placeholders: Blocked.
- real employee data: Blocked.
- live tenant data: Blocked.
- payroll/benefit data: Blocked.
- production credentials: Blocked.
- regulated identifiers: Blocked.
- sensitive personal information: Blocked.
- raw payloads: Blocked.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- production queue/DLQ ready: Blocked.
- retention/deletion runtime ready: Blocked.

All examples must be repository-owned synthetic fixtures or explicitly approved
non-production examples. Approval placeholders, TODO approvals, fake legal or
privacy approvers, sample credentials, issue comments, branch names, and local
path shape do not authorize data use.

## Allowed Synthetic Fixture Shape

| Field                 | Required shape                                                                                                                                        | Blocked shape                                                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| fixture name          | Repo-owned name with an MVP flow prefix, such as `mvp-a-synthetic-onboarding-basic` or `mvp-d-synthetic-csv-rejected-row`.                            | Real person name, customer tenant name, payroll batch name, benefit plan name, live provider username, or production queue id. |
| scenario intent       | One bounded rehearsal purpose tied to the flow under review, such as onboarding trace, transfer apply, termination trace, CSV denial, or DLQ note.    | Generic production acceptance, HR practical-use readiness, production-like readiness, retention, deletion, or restore policy.  |
| evidence owner        | Repository-owned synthetic owner or local reviewer role named in the focused verifier or guidance.                                                    | Placeholder owner, forwarded user header, client-supplied user id, fake approver, or inferred data owner.                      |
| source classification | `repo-owned synthetic` or `explicitly approved non-production` with the approval record kept outside this repository.                                 | Real employee source, live tenant export, production backup, support-console scrape, broad CSV export, or raw payload dump.    |
| allowed fields        | Flow ids, synthetic names, synthetic work email, role or department labels, dates, correlation ids, tenant/environment markers, and evidence version. | Payroll, benefit, My Number, regulated identifiers, medical, disability, union, raw payload, credential, token, or secret.     |
| prohibited aliases    | Any spelling or column alias for blocked categories, including `ssn`, `my_number`, `national_id`, `salary`, `benefit`, `medical`, `raw_payload`.      | Alias acceptance, case-only bypass, nested metadata side channel, untyped JSON payload, or spreadsheet formula escape.         |
| cleanup evidence      | Repo-relative command, focused test name, synthetic fixture owner, correlation id shape, and no-orphan or no-partial-write expectation.               | Local database artifact, raw export, screenshot approval, production log, queue dump, workstation-local absolute path.         |

## Approval Placeholder Rejection

Explicitly approved non-production examples require a real legal, privacy, and
data-owner approval record maintained outside this repository. This note does
not define that approval process, approve any real-data use, or let fixture
metadata stand in for the approval record.

Rejected placeholders include:

- `TODO`, `TBD`, `sample approval`, `owner placeholder`, `privacy placeholder`,
  `legal placeholder`, `approved by bot`, or equivalent unresolved text.
- Sample secrets, fake tokens, unsigned credentials, and local-only credential
  comments.
- Issue body text, PR comments, branch names, path names, or neighboring
  metadata presented as proof of tenant, employee, repository, account, or
  environment linkage.

When approval provenance is missing, malformed, stale, or only partially
trusted, keep the fixture blocked and use repo-owned synthetic data instead.

## Prohibited Data Categories

Do not add, import, paste, or describe examples containing:

- real employee data.
- live tenant data.
- payroll/benefit data.
- production credentials, tokens, provider secrets, or database passwords.
- regulated identifiers, including My Number, national identifiers, tax ids,
  social security ids, passport numbers, insurance ids, or bank account ids.
- sensitive personal information, including medical, disability, union,
  religious, criminal-history, biometric, health, family-care, or leave details.
- unrestricted raw payloads, broad CSV exports, provider dumps, production logs,
  queue dumps, DLQ dumps, or support-console extracts.

## Cleanup Expectations

Bounded rehearsal cleanup evidence is repository-relative and synthetic. Record
only the command name, focused test name, fixture owner, scenario intent,
correlation id shape, and expected no-orphan or no-partial-write outcome.

Failed-path rehearsal must prove durable state stayed clean after rejection when
the flow can write data. Do not stop at an exception, validation message, or
operator note if an orphan record, partial durable write, half-restored state,
duplicate replay, or stale DLQ decision could survive.

Local databases, generated `dist/` output, temporary CSV files, and local test
artifacts are disposable byproducts unless they are committed source. Do not
commit real employee data, live tenant evidence, provider credentials, raw
exports, queue or DLQ dumps, approval screenshots, production logs, or
workstation-local absolute paths.

## Verification Commands

Focused reproduction before this note:

```sh
npm test -- --test-name-pattern "P2X synthetic test-data governance"
```

Focused verification after this note:

```sh
npm test -- --test-name-pattern "P2X synthetic test-data governance"
```

Final verification:

```sh
npm run verify:pre-pr
```

These commands are repo-relative. This note does not require production
credentials, live IdP tenant configuration, cloud accounts, production database
access, queue/DLQ runtime integration, support-console sessions, production
restore policy, retention/deletion jobs, or legal records-management tooling.

## No Surface Expansion Confirmation

No runtime workflow behavior, migration, API surface, legal retention schedule,
deletion/anonymization job, production restore policy, statutory records
management process, real-data approval, production support process, production
queue, production DLQ, retention/deletion runtime, readiness upgrade, HR
practical-use readiness, or production-like readiness surface is introduced by
this note.

- No real employee data.
- No live IdP/Okta.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No two-key Accepted claim.
- No HR practical-use readiness.
- No production-like readiness surface.

## Closeout Boundary

Issue #351 can close when this governance note, its focused guard, and
`npm run verify:pre-pr` pass. The result is bounded synthetic test-data
governance for local rehearsal only, not HR practical-use readiness and not
production-like readiness.
