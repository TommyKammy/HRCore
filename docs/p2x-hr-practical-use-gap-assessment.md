# P2X HR Practical-Use Gap Assessment

Issue: #338
Part of: #336
Depends on: #337
Review scope: bounded/non-production practical-use gaps after the MVP-A/B/C/D evidence inventory.
Review mode: repository-owned gap assessment. This document records repo
evidence and follow-up shape only; it does not replace project-owner, HR
operator, legal, privacy, security, data-owner, or two-key approval.

## Assessment Boundary

- bounded/non-production practical-use follow-up: Allowed.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- real employee data: Blocked.
- live Okta tenant operation: Blocked.
- production queue/DLQ ready: Blocked.
- retention/deletion runtime ready: Blocked.

HRCore can plan controlled pilot-shaped follow-ups that use synthetic or
explicitly approved non-production evidence only. Those follow-ups may improve
operator ergonomics, support evidence, audit lookup, CSV/Ops/DLQ usability,
test-data governance, and local runbooks without changing the accepted
P2A/P2B/P2C/P2D evidence boundaries.

HRCore cannot claim HR practical-use readiness, real employee data readiness,
live IdP/Okta readiness, unrestricted raw payload or broad CSV export,
production queue/DLQ readiness, production ops readiness, retention/deletion
runtime readiness, legal/privacy acceptance, two-key approval, or
production-like readiness from this assessment.

## Evidence Anchors Reviewed

| Evidence anchor                                                         | Current boundary                                                                                                              | Practical-use implication                                                                                                                                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/mvp-abcd-bounded-evidence-inventory.md`                           | MVP-A/B/C/D evidence is repository-owned, synthetic, and non-production only.                                                 | The read set for this assessment stays anchored to direct closeout evidence instead of inferring broader readiness from sibling issue names or nearby metadata. |
| `docs/mvp-a-p2a-03-practical-use-readiness-review-closeout.md`          | MVP-A onboarding remains bounded/non-production Go while HR practical-use and production-like readiness remain blocked.       | Practical-use follow-ups may improve bounded onboarding review ergonomics, but they cannot promote real personnel data, live-provider, or production operation. |
| `docs/mvp-b-p2b-01-readiness-review-closeout.md`                        | MVP-B transfer evidence is bounded/non-production and keeps real employee data, live Okta, ops/DLQ, and two-key gates closed. | Transfer follow-ups need clearer operator-facing inspection and support evidence before any controlled pilot discussion.                                        |
| `docs/mvp-c-p2c-01-readiness-review-closeout.md`                        | MVP-C termination evidence is bounded/non-production and keeps retention/deletion runtime explicitly blocked.                 | Termination follow-ups must avoid retention/deletion behavior and should focus on synthetic trace review, failed-path evidence, and local runbook clarity.      |
| `docs/mvp-d-p2d-01-readiness-review-closeout.md`                        | MVP-D CSV/Ops/DLQ evidence is bounded/non-production and local/synthetic only.                                                | CSV/Ops/DLQ follow-ups may improve local operator usability, but production queue ownership, DLQ authorization, incident workflow, and SLO/SLA remain separate. |
| `docs/mvp-d-local-ops-job-status-runbook.md` and CSV import/export docs | Local runbooks and guards cover bounded synthetic use.                                                                        | The next practical-use work can consolidate local commands, expected evidence, and failure triage without adding live-provider or production queue behavior.    |
| Proposed two-key ADR anchors and `docs/solo-maintainer-governance.md`   | Owner acknowledgement is not independent two-key approval.                                                                    | Stronger gates must remain blocked unless later documents record real authority and ADR 0000-compliant evidence.                                                |

## Bounded Practical-Use Gaps

| Gap area                     | Bounded gap                                                                                                                      | Allowed follow-up shape                                                                                                                                          | Out of scope for this assessment                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| operator workflow            | Operators can inspect bounded evidence, but the flow is still spread across closeout docs, local APIs, and tests.                | Add repo-relative local operator checklists for synthetic onboarding, transfer, termination, CSV, local Ops, and DLQ evidence review.                            | Production support console, on-call process, SLO/SLA, incident bridge, production ticket binding, or real employee mutation custody. |
| support evidence             | Support-review evidence exists for MVP-A and local Ops decisions exist for MVP-D, but cross-flow support evidence is uneven.     | Define a synthetic support-evidence checklist with actor, reason, subject binding, tenant/environment, correlation id, and current evidence version.             | HR/legal approval workflow, production authorization model, break-glass access, or independent support approval authority.           |
| audit lookup                 | Correlation traces exist per flow, but a practical reviewer still needs to know which bounded lookup is authoritative.           | Document a local audit lookup map from each flow to its direct correlation evidence and fail-closed missing-evidence behavior.                                   | Broad audit search, WORM/Object Lock, hash-chain archive, compliance archive, or production audit immutability.                      |
| CSV/Ops/DLQ usability        | MVP-D covers bounded CSV dry-run/apply, export denial, local Ops status, and DLQ decisions, but the operator path is fragmented. | Create a local-only synthetic walkthrough for dry-run, accepted/rejected rows, denied export, job status, operator decision, retry, replay, ignore, and close.   | Production queue/DLQ, scheduler ownership, replay authorization, monitoring, alerting, incident workflow, or post-use review.        |
| non-production data handling | MVP-A has an explicit non-production data gate, but the cross-flow practical-use posture needs one place to cite it.             | Keep all pilot-shaped examples synthetic or explicitly approved non-production, with documented source, owner, approval reference, and masking expectation.      | Real employee data, live tenant data, payroll/benefit data, regulated identifiers, sensitive personal information, or raw payloads.  |
| test data governance         | Fixtures and seeds are guarded, but practical-use rehearsal data needs clearer naming, ownership, and cleanup expectations.      | Add a synthetic data catalog convention for fixture intent, allowed fields, prohibited aliases, approval placeholders, cleanup expectations, and evidence owner. | Legal retention schedules, deletion/anonymization jobs, production restore policy, or statutory records management.                  |
| local runbook completeness   | Closeout docs record commands, but a new contributor still has to assemble the bounded local workflow from several files.        | Consolidate repo-relative commands, env-var placeholders, expected outputs, and troubleshooting for local bounded review.                                        | Workstation-local absolute paths, production credentials, cloud accounts, live IdP setup, or production database instructions.       |

## Stronger-Readiness Blockers Kept Separate

| Stronger blocker             | Why it remains outside bounded practical-use follow-up                                                                                               | Required separate evidence before any stronger claim                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| real employee data           | Current evidence is synthetic or explicitly non-production only.                                                                                     | Legal/privacy basis, data-owner approval, processing-purpose evidence, data classification, masking profile, and real-data operational custody.             |
| live IdP/Okta                | Mock-first provider evidence is not trusted tenant binding or credential custody.                                                                    | Explicit tenant binding, trusted credential source, secret rotation, webhook custody, provider audit search, rollback behavior, and fail-closed tests.      |
| production authorization/RLS | Bounded actor, subject, tenant, and environment checks are not production RBAC/RLS authority.                                                        | Accepted authorization/data-scope design, role binding, trusted proxy identity boundary, PostgreSQL RLS source of truth, and negative enforcement tests.    |
| raw payload and broad export | Existing gates intentionally block unrestricted raw payload and broad CSV/export.                                                                    | Accepted raw-view/export permissions, redaction and masking profile, template allowlist, watermark or manifest, download-log evidence, and legal approval.  |
| production queue/DLQ         | Local Ops/DLQ evidence is bounded and synthetic.                                                                                                     | Production scheduler and queue ownership, DLQ authorization, replay guardrails, monitoring, alerting, support-console custody, and incident workflow.       |
| retention/deletion runtime   | MVP-C and ADR anchors keep retention, anonymization, deletion jobs, legal hold, and retention-log behavior outside current runtime.                  | Accepted retention/deletion ADR evidence, legal basis, jurisdiction/legal-entity applicability, all-or-nothing writes, restore cleanup, and audit evidence. |
| legal/privacy acceptance     | Repository tests and closeout docs are not legal, privacy, security, data-owner, or project-owner approval.                                          | Named approvals for the exact runtime claim and evidence that the approval applies to the requested data, tenant, provider, and operating boundary.         |
| two-key acceptance           | Solo-maintainer owner acknowledgement is not an independent second key under ADR 0000.                                                               | Named Approver, independent Counter-approver, completed review-window evidence, and ADR metadata for each sensitive boundary.                               |
| production-like readiness    | Production-like operation depends on all stronger blockers above, plus operational ownership and support process evidence not present in this suite. | A separate readiness review that proves every production-like gate and explicitly approves the stronger claim.                                              |

## Recommended Bounded Follow-Ups

1. Create a local bounded operator runbook that links each flow to its direct
   repo-owned evidence and uses repo-relative commands only.
2. Add a synthetic practical-use rehearsal checklist covering request, approval,
   apply, provider mock projection, writeback where applicable, CSV/Ops/DLQ,
   audit lookup, failed-path evidence, and cleanup expectations.
3. Add a test-data governance note for synthetic fixture names, prohibited
   aliases, approval-placeholder rejection, and cleanup evidence.
4. Add focused guards for any new runbook or checklist so later edits cannot
   claim real employee data, live-provider, production queue/DLQ,
   retention/deletion, two-key Accepted, or production-like readiness.

## No Surface Expansion Confirmation

No real employee data, No live IdP/Okta, No unrestricted raw payload, No broad
CSV export, No production queue/DLQ, No retention/deletion runtime, No two-key
Accepted claim, and No production-like readiness is introduced by this
assessment.

## Verification Commands

Focused reproduction before assessment:

```sh
npm test -- --test-name-pattern "P2X practical-use gap assessment"
```

The focused guard failed because
`docs/p2x-hr-practical-use-gap-assessment.md` was missing.

Focused verification after assessment:

```sh
npm test -- --test-name-pattern "P2X practical-use gap assessment"
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, MVP-A policy-as-code, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## Closeout Boundary

Issue #338 can close when this assessment, its guard, and local verification
pass. The result is a bounded/non-production practical-use gap map, not HR
practical-use readiness and not production-like readiness.
