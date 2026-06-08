# P2X-04 Real Data Legal Privacy Prerequisite Lane

Issue: #372
Part of: #371
Depends on: #371
Review scope: production-like prerequisite decomposition for real employee data
and legal/privacy runtime boundaries.
Review mode: repository-owned prerequisite record. This document records missing
evidence and blocked status only; it does not replace project-owner, HR
operator, legal, privacy, security, data-owner, operational, architecture, or
two-key approval.

## Lane Verdict

Final verdict: Blocked prerequisite lane.

This lane decomposes the evidence required before a later real employee data or
legal/privacy runtime claim can be evaluated. It does not approve a personnel
data processing path. It does not approve legal/privacy runtime use. It does not
accept HR practical-use readiness. It does not accept production-like readiness.

Current repository evidence remains synthetic or explicitly non-production
only. P2X-04 adds prerequisite decomposition evidence around the blocked
boundary; it does not expand the boundary.

## Evidence Anchors

| Anchor                                                                                                       | Current role                                                                                                       | Lane finding                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `docs/mvp-abcd-bounded-evidence-inventory.md`                                                                | Bounded MVP-A/B/C/D evidence inventory                                                                             | Repository-owned evidence is synthetic/non-production only and cannot stand in for real employee data custody.                  |
| `docs/p2x-hr-practical-use-gap-assessment.md`                                                                | Stronger-readiness gap assessment                                                                                  | Real employee data remains outside bounded practical-use follow-up and requires separate legal/privacy and data-owner evidence. |
| `docs/p2x-production-like-blocker-matrix.md`                                                                 | Production-like blocker ledger                                                                                     | The real employee data row stays Blocked with required next evidence and legal/privacy plus operational decision classes.       |
| `docs/adr/0006-appi-processing-purpose-dsar-boundary.md`                                                     | Proposed APPI processing-purpose and DSAR handling boundary                                                        | Proposed/design anchor only; not accepted approval for this lane.                                                               |
| `docs/adr/0007-sensitive-personal-information-boundary.md`                                                   | Proposed sensitive personal information boundary                                                                   | Proposed/design anchor only; not accepted approval for regulated or sensitive data use.                                         |
| `docs/adr/0016-sensitive-personal-information-privacy-classification-consent-processing-purpose-boundary.md` | Proposed sensitive personal information privacy classification, consent, and processing-purpose extension boundary | Proposed/design anchor only; no sensitive personal information runtime is introduced.                                           |

## Required Future Evidence

The following evidence must be supplied by a later, explicitly scoped record
before this lane can move beyond Blocked:

- named legal/privacy basis for the exact data class and processing purpose.
- named data-owner approval for the exact tenant, dataset, and lifecycle flow.
- processing-purpose record linked to the requested HR operation.
- data classification for personal, sensitive, regulated, payroll, benefit, and
  provider-originated fields.
- masking or minimization profile that names allowed fields and prohibited
  aliases.
- custody record covering source, transfer, storage, access, support, export,
  audit, and cleanup handling.
- transition plan for any future non-production-to-protected-data movement with
  rollback and fail-closed criteria.
- separate owner approval record for that transition plan.
- negative fail-closed evidence for missing approval, placeholder approval,
  unknown owner, unsupported data class, prohibited alias, raw payload, broad
  export, live-provider drift, retention/deletion request, and partial durable
  write attempts.

This prerequisite record does not supply any of that evidence.

## Blocked Boundary

- real employee data processing: Blocked.
- legal/privacy runtime approval: Blocked.
- data-owner approval: Blocked.
- production-like data processing: Blocked.
- payroll/benefit data use: Blocked.
- regulated identifier use: Blocked.
- sensitive personal information use: Blocked.
- live tenant data: Blocked.
- raw payload access: Blocked.
- broad CSV/export expansion: Blocked.
- retention/deletion runtime: Blocked.
- HR practical-use readiness: Blocked.
- production-like readiness: Blocked.
- two-key approval: Blocked.

## Follow-Up Shape

A later implementation issue may be created only after a separate owner-approved
evidence package names the exact data class, tenant, provider, purpose,
retention/export boundary, support access path, and operational custody being
requested.

That later issue must not rely on this prerequisite record, issue titles,
neighboring closeout language, README status text, bounded synthetic evidence,
or proposed ADR anchors as approval.

## Verification Commands

Focused reproduction before this lane:

```sh
npm test -- --test-name-pattern "P2X-04 real data prerequisite lane"
```

The focused guard failed because
`docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md` was missing.

Focused verification after this lane:

```sh
npm test -- --test-name-pattern "P2X-04 real data prerequisite lane"
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
employee data flow, live IdP/Okta path, legal/privacy approval, two-key
approval, HR practical-use readiness, or production-like readiness surface is
introduced by this prerequisite lane.

- No real employee data.
- No live IdP/Okta.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No two-key approval claim.
- No HR practical-use readiness.
- No production-like readiness surface.

## Epic Update Boundary

Epic #371 can treat this child as complete only for real employee data and
legal/privacy prerequisite decomposition.

Real employee data processing remains blocked. Legal/privacy runtime approval,
HR practical-use readiness, and production-like readiness also remain blocked.
Future records must separately supply owner evidence before changing that
status.
