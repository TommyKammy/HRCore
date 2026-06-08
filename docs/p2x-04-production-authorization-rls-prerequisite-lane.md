# P2X-04 Production Authorization RLS Prerequisite Lane

Issue: #374
Part of: #371
Depends on: #371
Review scope: production-like prerequisite decomposition for production
authorization, data-scope, tenant, role, trusted proxy identity, and PostgreSQL
RLS boundaries.
Review mode: repository-owned prerequisite record. This document records missing
evidence and blocked status only; it does not replace project-owner, HR
operator, legal, privacy, security, data-owner, operational, architecture, or
two-key approval.

## Lane Verdict

Final verdict: Blocked prerequisite lane.

This lane decomposes the evidence required before a later production
authorization or PostgreSQL RLS claim can be evaluated. It does not approve
production RBAC. It does not accept PostgreSQL RLS as source of truth. It does
not accept HR practical-use readiness. It does not accept production-like
readiness.

Current repository evidence remains bounded, synthetic, and explicitly
non-production only. P2X-04 adds prerequisite decomposition evidence around the
blocked authorization/RLS boundary; it does not expand the boundary.

## Evidence Anchors

| Anchor                                                              | Current role                                           | Lane finding                                                                                                         |
| ------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `docs/adr/0011-data-scope-policy-dsl-rls-boundary.md`               | Proposed data-scope DSL and PostgreSQL RLS boundary    | Proposed/design anchor only; not Accepted production authorization or RLS source-of-truth approval.                  |
| `docs/mvp-a-onboarding-evidence-authorization-gate.md`              | Bounded MVP-A evidence authorization gate              | Bounded evidence authorization is non-production only and cannot stand in for enterprise RBAC or production RLS.     |
| `src/mvp-a-onboarding-evidence-authorization.ts`                    | Bounded helper implementation                          | Helper checks actor, subject, tenant, environment, field, and evidence scope only for repository-owned evidence.     |
| `docs/mvp-a-go-no-go-scope.md`                                      | MVP-A bounded scope record                             | MVP-A proceeds only with default-deny assumptions and no production authorization claim.                             |
| `docs/p2x-hr-practical-use-gap-assessment.md`                       | Stronger-readiness gap assessment                      | Production authorization/RLS remains blocked on accepted authorization/data-scope design and runtime evidence.       |
| `docs/p2x-production-like-blocker-matrix.md`                        | Production-like blocker ledger                         | The production authorization/RLS row stays Blocked with required next evidence and owner decision classes.           |
| `docs/p2x-solo-maintainer-governance-boundary-review.md`            | Solo-maintainer governance boundary review             | Proposed governance anchors remain owner-acknowledged defer, not Accepted two-key authorization/RLS approval.        |
| `docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md`          | Neighbor prerequisite lane for real data/legal privacy | This lane remains separate and cannot supply production authorization or RLS approval.                               |
| `docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md` | Neighbor prerequisite lane for live provider custody   | This lane remains separate and cannot supply tenant, proxy identity, role, or production authorization/RLS approval. |

## Required Future Evidence

The following evidence must be supplied by a later, explicitly scoped record
before this lane can move beyond Blocked:

- must be supplied: accepted authorization/data-scope design naming actors,
  subjects, tenants, environments, fields, and HR operations.
- actor/role/tenant binding evidence for every production role and tenant
  boundary being requested.
- trusted proxy identity boundary that names identity source, forwarded-header
  trust rules, service-to-service caller binding, and spoofing rejection.
- PostgreSQL RLS source-of-truth decision that states whether RLS is authority,
  defense-in-depth, or explicitly deferred.
- query-layer and service-layer enforcement evidence for every allowed data
  scope.
- negative enforcement tests for missing actor, wrong role, wrong tenant,
  unsupported environment, forbidden field, stale policy, and cross-tenant
  access.
- mixed-boundary fail-closed evidence covering app authorization, database
  policy, proxy identity, support-console access, and audit lookup paths.
- owner decision record naming architecture, security, data-owner, legal,
  privacy, operations, and two-key approval boundaries.

This prerequisite record does not supply any of that evidence.

## Blocked Boundary

- production authorization/RLS: Blocked.
- production RBAC authority: Blocked.
- PostgreSQL RLS source of truth: Blocked.
- authorization/data-scope design acceptance: Blocked.
- actor/role/tenant binding: Blocked.
- trusted proxy identity boundary: Blocked.
- query-layer enforcement: Blocked.
- service-layer enforcement: Blocked.
- negative enforcement tests: Blocked.
- mixed-boundary fail-closed evidence: Blocked.
- support-console authority: Blocked.
- real employee data processing: Blocked.
- HR practical-use readiness: Blocked.
- production-like readiness: Blocked.
- two-key approval: Blocked.

## Follow-Up Shape

A later implementation issue may be created only after a separate owner-approved
evidence package names the exact authorization model, data-scope DSL or policy,
tenant boundary, role binding, trusted proxy identity source, PostgreSQL RLS
source-of-truth decision, enforcement tests, and operating owner being
requested.

That later issue must not rely on this prerequisite record, issue titles,
neighboring closeout language, README status text, bounded synthetic evidence,
bounded app authorization checks, proposed ADR anchors, forwarded headers,
inferred tenant links, role-name comments, or local environment placeholders as
approval.

## Verification Commands

Focused reproduction before this lane:

```sh
npm test -- --test-name-pattern "P2X-04 production authorization RLS prerequisite lane"
```

The focused guard failed because
`docs/p2x-04-production-authorization-rls-prerequisite-lane.md` was missing.

Focused verification after this lane:

```sh
npm test -- --test-name-pattern "P2X-04 production authorization RLS prerequisite lane"
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

- No production authorization/RLS implementation.
- No production RBAC.
- No PostgreSQL RLS authority.
- No schema, SQL policy, migration, API, or UI behavior change.
- No trusted proxy identity runtime.
- No support-console authority.
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

Epic #371 can treat this child as complete only for production
authorization/RLS prerequisite decomposition.

Production authorization/RLS remains blocked. Production RBAC authority,
PostgreSQL RLS source of truth, support-console authority, HR practical-use
readiness, and production-like readiness also remain blocked. Future records
must separately supply owner evidence before changing that status.
