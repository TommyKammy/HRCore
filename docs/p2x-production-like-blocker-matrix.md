# P2X Production-Like Blocker Matrix

Issue: #339
Part of: #336
Depends on: #338
Review scope: production-like blockers after the completed Phase 2 bounded
suite and P2X practical-use gap assessment.
Review mode: repository-owned blocker assessment. This document records blocker
status and next evidence only; it does not replace project-owner, HR operator,
legal, privacy, security, data-owner, operational, architecture, or two-key
approval.

## Assessment Boundary

- bounded/non-production Phase 2 evidence: Recorded.
- HR practical-use ready: Blocked.
- production-like ready: Blocked.
- real employee data: Blocked.
- live Okta/provider operation: Blocked.
- production authorization/RLS: Blocked.
- production audit immutability: Blocked.
- raw payload and broad CSV export: Blocked.
- production scheduler/queue/DLQ: Blocked.
- retention/deletion runtime: Blocked.

This matrix starts from the repository-owned bounded evidence inventory and
P2X practical-use gap assessment. It does not infer readiness from sibling
issues, issue titles, branch names, planning notes, nearby closeout language,
or owner acknowledgement. When a blocker depends on provenance, scope, auth
context, data boundary, or runtime evidence that is not present, the status
stays blocked until the authoritative follow-up record closes it.

P0-R05 / #11, P0-R06 / #12, and P0-R08 / #14 remain owner-acknowledged defer
items, not accepted production-like gates. Issue #240 records the
solo-maintainer governance closeout and owner acknowledgement boundary only; it
does not convert those gates into ADR 0000 two-key acceptance.

## Blocker Matrix

| Blocker surface                | Owner gate or anchor                                                                                                                                                          | Current status                                                        | Required next evidence                                                                                                                                                                                                                                       | Decision required before stronger claim                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| real employee data             | `docs/mvp-abcd-bounded-evidence-inventory.md`; `docs/p2x-hr-practical-use-gap-assessment.md`; ADR 0006; ADR 0007; ADR 0016                                                    | Blocked; current evidence is repo-owned synthetic/non-production only | Named legal/privacy basis, data-owner approval, processing purpose, data classification, masking profile, approved non-production-to-real-data transition plan, custody record, and negative fail-closed evidence.                                           | legal/privacy decision; operational decision                        |
| live Okta/provider operation   | `docs/okta-poc-connection-contract.md`; MVP-A/B/C mock projection closeouts; P2X gap assessment                                                                               | Blocked; current provider evidence is mock-first and deterministic    | Explicit tenant binding, trusted credential source, secret rotation, webhook custody, provider audit search, rollback behavior, retry/error custody, and fail-closed tests for missing or placeholder credentials.                                           | architecture decision; operational decision                         |
| production authorization/RLS   | P0-R05 / #11; ADR 0011; `docs/mvp-a-onboarding-evidence-authorization-gate.md`; `docs/solo-maintainer-governance.md`; `docs/p0-gov-01-solo-maintainer-governance-closeout.md` | Blocked; bounded app checks are not production RBAC/RLS authority     | Required next evidence before promotion: accepted authorization/data-scope design, actor/role/tenant binding, trusted proxy identity boundary, PostgreSQL RLS source-of-truth decision, negative enforcement tests, and mixed-boundary fail-closed evidence. | two-key decision; architecture decision                             |
| production audit immutability  | P0-R06 / #12; ADR 0012; bounded traceability closeouts; `docs/p0-gov-01-solo-maintainer-governance-closeout.md`                                                               | Blocked; local audit/correlation evidence is mutable repository proof | Accepted hash-chain/archive design, WORM/Object Lock or equivalent custody, retention posture, restore evidence, tamper-evidence verification, compliance archive procedure, and completed two-key metadata.                                                 | two-key decision; architecture decision; operational decision       |
| raw payload and CSV export     | P0-R08 / #14; ADR 0014; `docs/mvp-a-onboarding-pii-export-gate.md`; `docs/mvp-d-csv-import-contract.md`; P2D closeouts                                                        | Blocked; only bounded synthetic CSV and denied-export evidence exists | Accepted raw-view/export permissions, redaction/masking profile, template allowlist, watermark or manifest, download-log evidence, legal approval, prohibited-payload controls, and negative broad-export tests.                                             | two-key decision; legal/privacy decision                            |
| production scheduler/queue/DLQ | `docs/mvp-d-local-ops-job-status-runbook.md`; `docs/mvp-d-p2d-01-readiness-review-closeout.md`; P2X gap assessment                                                            | Blocked; current Ops/DLQ evidence is local, synthetic, and bounded    | Production scheduler ownership, queue and DLQ ownership, replay authorization, retry guardrails, monitoring, alerting, support-console custody, incident workflow, ticket binding, and post-use review evidence.                                             | operational decision; architecture decision                         |
| production ops                 | `docs/mvp-d-p2d-01-readiness-review-closeout.md`; `docs/p2x-hr-practical-use-gap-assessment.md`; run-mode governance                                                          | Blocked; no production operating model is recorded                    | SLO/SLA, on-call workflow, escalation path, incident process, backup/restore operation, support access model, production runbooks, release/rollback procedure, and operator acceptance for the exact boundary.                                               | operational decision                                                |
| legal/privacy runtime          | ADR 0005; ADR 0006; ADR 0007; ADR 0016; practical-use gap assessment                                                                                                          | Blocked; repository tests and docs are not legal/privacy approval     | Named legal, privacy, security, data-owner, maintainer, and project-owner approvals that bind to the exact data, tenant, provider, purpose, retention, export, audit, and support boundary being claimed.                                                    | legal/privacy decision; two-key decision                            |
| retention/deletion             | ADR 0009; ADR 0018; MVP-C termination closeouts; P2X gap assessment                                                                                                           | Blocked; no retention/deletion runtime is implemented or accepted     | Accepted retention/deletion ADR evidence, jurisdiction/legal-entity applicability, anonymization/hard-delete/legal-hold behavior, deletion-job custody, retention log, restore cleanup, and no-orphan tests.                                                 | legal/privacy decision; architecture decision; operational decision |
| future-extension surfaces      | ADR 0015 through ADR 0020; bounded evidence inventory; practical-use gap assessment                                                                                           | Blocked; extension anchors are Proposed or design-only                | Explicit scope record for each extension, accepted ADR or follow-up issue, schema/API/runtime authorization, migration plan where applicable, negative no-escape-hatch tests, and directly linked closeout evidence.                                         | architecture decision; two-key decision                             |

## Cross-Gate Linkage Rules

- A blocker closes only when the directly linked owner gate or follow-up record
  records the required evidence. Same-parent issue linkage, nearby docs, shared
  table rows, or planning-note naming conventions do not close blockers.
- Owner acknowledgement under #240 may allow bounded/non-production work to
  continue, but it does not supply independent counter-approval for P0-R05 /
  #11, P0-R06 / #12, or P0-R08 / #14.
- P0-R05 / #11 remains a production authorization/RLS blocker until the later
  record supplies ADR 0000-compliant decision evidence.
- P0-R06 / #12 remains a production audit immutability blocker until the later
  record supplies ADR 0000-compliant decision evidence.
- P0-R08 / #14 remains a raw payload, CSV/export, and future-extension blocker
  until the later record supplies ADR 0000-compliant decision evidence.
- A follow-up that adds runtime behavior must prove both the enforcement
  boundary and durable failed-path cleanliness; returning an error alone is not
  enough if partial durable state can survive.

## Required Next Evidence by Decision Class

| Decision class         | Required before production-like readiness can be claimed                                                                                                                                         |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| two-key decision       | Named Approver, independent Counter-approver, completed review-window evidence, and scope-specific ADR or closeout metadata for each sensitive gate that requires ADR 0000 handling.             |
| legal/privacy decision | Named legal/privacy/security/data-owner approval for the exact data class, processing purpose, tenant, provider, retention/export boundary, support access path, and operational custody.        |
| operational decision   | Production owner, runbook, queue/DLQ ownership, incident and escalation model, support-console custody, monitoring/alerting, SLO/SLA, backup/restore operation, rollback, and post-use review.   |
| architecture decision  | Accepted boundary for tenant/auth/RLS, audit archive, provider integration, retention/deletion, future extension schemas, all-or-nothing writes, snapshot consistency, and fail-closed verifier. |

## Verification Commands

Focused reproduction before this matrix:

```sh
npm test -- --test-name-pattern "P2X production-like blocker matrix"
```

The focused guard failed because
`docs/p2x-production-like-blocker-matrix.md` was missing.

Focused verification after this matrix:

```sh
npm test -- --test-name-pattern "P2X production-like blocker matrix"
```

Final verification:

```sh
npm run verify:pre-pr
```

The final command covers TypeScript build, MVP-A policy-as-code, tests,
formatting, dependency audit, and Drizzle migration/config checks.

## Non-Expansion Confirmation

No application behavior, migration, runtime, real-data path, live-provider
path, production ops surface, production queue, DLQ runtime, retention/deletion
runtime, raw payload viewer, broad CSV export, or production-like readiness
surface is introduced by this matrix.

- No real employee data.
- No live IdP/Okta.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No two-key Accepted claim.
- No production-like readiness surface.

## Closeout Boundary

Issue #339 can close when this blocker matrix, its focused guard, and local
verification pass. The result is a production-like blocker ledger for follow-up
planning, not HR practical-use readiness, not live-provider readiness, and not
production-like readiness.
