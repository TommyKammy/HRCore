# P2X-04 Live Provider Custody Credential Prerequisite Lane

Issue: #373
Part of: #371
Depends on: #371
Review scope: production-like prerequisite decomposition for live IdP, Okta, and
provider custody boundaries.
Review mode: repository-owned prerequisite record. This document records missing
evidence and blocked status only; it does not replace project-owner, HR
operator, security, operational, architecture, legal, privacy, data-owner, or
two-key approval.

## Lane Verdict

Final verdict: Blocked prerequisite lane.

This lane decomposes the evidence required before a later live IdP, Okta, or
provider custody claim can be evaluated. It does not authorize live provider
traffic. It does not approve provider credentials. It does not accept HR
practical-use readiness. It does not accept production-like readiness.

Current repository evidence remains mock-first, synthetic, and explicitly
non-production only. P2X-04 adds prerequisite decomposition evidence around the
blocked live-provider boundary; it does not expand the boundary.

## Evidence Anchors

| Anchor                                                     | Current role                                           | Lane finding                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `docs/okta-poc-connection-contract.md`                     | Mock-first Okta PoC connection contract                | Repository verification remains mock-first and must not require live tenant credentials or external service access.   |
| `docs/mvp-a-onboarding-traceability-closeout.md`           | MVP-A onboarding mock Okta traceability closeout       | Mock projection evidence is synthetic and does not prove live tenant binding, credential custody, or webhook custody. |
| `docs/mvp-b-transfer-traceability-closeout.md`             | MVP-B transfer mock Okta traceability closeout         | Transfer evidence remains bounded to mock provider projection and does not imply live provider readiness.             |
| `docs/mvp-c-termination-traceability-closeout.md`          | MVP-C termination mock Okta traceability closeout      | Termination evidence remains bounded to mock provider projection and does not imply live provider readiness.          |
| `docs/p2x-hr-practical-use-gap-assessment.md`              | Stronger-readiness gap assessment                      | Live IdP/Okta readiness remains blocked on tenant binding, credential custody, webhook custody, and provider audit.   |
| `docs/p2x-production-like-blocker-matrix.md`               | Production-like blocker ledger                         | The live Okta/provider operation row stays Blocked with required next evidence and owner decision classes.            |
| `docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md` | Neighbor prerequisite lane for real data/legal privacy | This lane remains separate and cannot supply live-provider approval.                                                  |

## Required Future Evidence

The following evidence must be supplied by a later, explicitly scoped record
before this lane can move beyond Blocked:

- named tenant binding for the exact IdP, Okta, or provider tenant.
- trusted credential source and custody owner for every credential class.
- secret rotation and revocation plan with tested rollback behavior.
- webhook custody boundary covering source authentication, replay handling,
  retry semantics, dead-letter custody, and cleanup ownership.
- provider audit search evidence for projection, writeback, webhook, retry,
  error, and rollback events.
- provider error and retry custody record covering partial success, duplicate
  delivery, stale event, and provider drift handling.
- fail-closed evidence for placeholder credentials, missing credential source,
  unknown tenant, untrusted webhook source, unsupported provider event, and
  stale provider state.
- owner decision record naming security, operations, architecture, and
  provider-custody approval boundaries.

This prerequisite record does not supply any of that evidence.

## Blocked Boundary

- live IdP/Okta operation: Blocked.
- live provider traffic: Blocked.
- live tenant binding: Blocked.
- provider credential custody: Blocked.
- production credential use: Blocked.
- secret rotation readiness: Blocked.
- webhook runtime custody: Blocked.
- provider audit search: Blocked.
- provider retry/error custody: Blocked.
- provider rollback behavior: Blocked.
- HR practical-use readiness: Blocked.
- production-like readiness: Blocked.
- two-key approval: Blocked.

## Follow-Up Shape

A later implementation issue may be created only after a separate owner-approved
evidence package names the exact provider, tenant, credential source, webhook
source, audit search boundary, rollback path, retry/error custody, and operating
owner being requested.

That later issue must not rely on this prerequisite record, issue titles,
neighboring closeout language, README status text, bounded synthetic evidence,
mock-first Okta PoC evidence, local environment placeholders, or proposed ADR
anchors as approval.

## Verification Commands

Focused reproduction before this lane:

```sh
npm test -- --test-name-pattern "P2X-04 live provider prerequisite lane"
```

The focused guard failed because
`docs/p2x-04-live-provider-custody-credential-prerequisite-lane.md` was missing.

Focused verification after this lane:

```sh
npm test -- --test-name-pattern "P2X-04 live provider prerequisite lane"
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

- No real employee data.
- No live IdP/Okta.
- No provider credentials.
- No webhook runtime.
- No unrestricted raw payload.
- No broad CSV export.
- No production queue/DLQ.
- No retention/deletion runtime.
- No two-key approval claim.
- No HR practical-use readiness.
- No production-like readiness surface.

## Epic Update Boundary

Epic #371 can treat this child as complete only for live provider custody and
credential prerequisite decomposition.

Live IdP/Okta operation remains blocked. Provider credential custody, webhook
runtime custody, HR practical-use readiness, and production-like readiness also
remain blocked. Future records must separately supply owner evidence before
changing that status.
