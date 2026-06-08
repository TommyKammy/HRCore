# P2X-04 Raw Payload CSV Export Prerequisite Lane

Issue: #376
Part of: #371
Depends on: #371
Review scope: production-like prerequisite decomposition for raw payload
viewing, raw payload download, CSV export, export download, redaction,
masking, template allowlist, watermark or manifest, download-log evidence,
legal approval, prohibited-payload controls, and negative broad-export tests.
Review mode: repository-owned prerequisite record. This document records missing
evidence and blocked status only; it does not replace project-owner, HR
operator, legal, privacy, security, data-owner, operational, architecture, or
two-key approval.

## Lane Verdict

Final verdict: Blocked prerequisite lane.

This lane decomposes the evidence required before a later unrestricted raw
payload or broad CSV/export claim can be evaluated. It does not approve raw
payload viewing. It does not approve broad CSV export. It does not accept HR
practical-use readiness. It does not accept production-like readiness.

Current repository evidence remains bounded, synthetic, narrow-template, and
explicitly non-production only. P2X-04 adds prerequisite decomposition evidence
around the blocked raw payload and broad CSV/export boundary; it does not expand
the boundary.

## Evidence Anchors

| Anchor                                                                              | Current role                                     | Lane finding                                                                                                       |
| ----------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `docs/adr/0014-raw-payload-csv-export-redaction-watermark-download-log-boundary.md` | Proposed raw payload and CSV export boundary     | Proposed/design anchor only; not finalized raw-view, broad export, watermark, download-log, or legal decision.     |
| `docs/mvp-a-onboarding-pii-export-gate.md`                                          | MVP-A raw payload and export closed gate         | Keeps raw payload viewing and CSV/export blocked before future permission, redaction, and audit evidence.          |
| `docs/mvp-d-csv-import-contract.md`                                                 | MVP-D bounded CSV import contract                | Defines bounded import templates only; it does not authorize broad export, raw payload download, or export jobs.   |
| `docs/mvp-d-p2d-01-readiness-review-closeout.md`                                    | MVP-D bounded CSV/Ops/DLQ readiness closeout     | Bounded synthetic CSV evidence remains non-production and cannot stand in for raw/export readiness.                |
| `docs/mvp-d-p2d-02-refactor-wave-closeout.md`                                       | MVP-D behavior-preserving refactor closeout      | Helper splits preserve existing bounded behavior only; they do not add export runtime or raw payload access.       |
| `docs/p2x-hr-practical-use-gap-assessment.md`                                       | P2X bounded practical-use gap assessment         | Names raw payload and broad export as remaining gaps requiring separate permission, masking, and legal evidence.   |
| `docs/p2x-production-like-blocker-matrix.md`                                        | Production-like blocker ledger                   | The raw payload and CSV export row stays Blocked with required next evidence and owner decision classes.           |
| `docs/p2x-solo-maintainer-governance-boundary-review.md`                            | Solo-maintainer governance boundary review       | Proposed governance anchors remain owner-acknowledged defer; two-key raw/export approval remains missing.          |
| `docs/p2x-04-real-data-legal-privacy-prerequisite-lane.md`                          | Neighbor prerequisite lane for real data/privacy | This lane remains separate and cannot supply raw payload or broad CSV/export authority.                            |
| `docs/p2x-04-production-authorization-rls-prerequisite-lane.md`                     | Neighbor prerequisite lane for authorization/RLS | This lane remains separate and cannot supply export permission, raw-view authority, or data-scope export approval. |

## Required Future Evidence

The following evidence must be supplied by a later, explicitly scoped record
before this lane can move beyond Blocked:

- raw-view/export permission model naming actor, role, tenant, data scope,
  request purpose, delegation, and separate raw-view versus export authority.
- redaction or masking profile covering raw payload fields, CSV fields,
  sensitive personal information, regulated identifiers, and fallback denial
  behavior.
- template allowlist naming permitted export templates, field catalog versions,
  row/object limits, purpose binding, and review ownership.
- watermark or manifest design naming durable identifier, request binding,
  correlation id, row/object count, field set, and tamper-evidence expectation.
- download-log evidence proving every raw-payload access attempt, raw-payload download,
  CSV export, and export download records actor, purpose, scope, outcome, and
  correlation.
- legal/privacy and data-owner approval record naming APPI basis, processing
  purpose, retention expectation, DSAR impact, and two-key approval boundary.
- prohibited-payload controls proving raw provider payloads, raw import/export
  payloads, untyped metadata, notes, attachments, logs, fixtures, seeds, and
  migration examples cannot become escape hatches.
- negative broad-export tests covering denied unrestricted raw payload access,
  denied broad CSV/export, denied unsupported fields, denied missing purpose,
  denied stale template, and denied missing download evidence.
- ADR 0000 metadata with Accepted status, named author, approver,
  counter-approver or documented exception, and time-locked review window.
- owner decision record naming architecture, security, operations, legal,
  privacy, data-owner, and two-key approval boundaries.

This prerequisite record does not supply any of that evidence.

## Blocked Boundary

- unrestricted raw payload: Blocked.
- raw payload viewing: Blocked.
- raw payload download: Blocked.
- raw-view/export permissions: Blocked.
- broad CSV export: Blocked.
- broad CSV/export expansion: Blocked.
- export download: Blocked.
- export permission runtime: Blocked.
- redaction or masking profile: Blocked.
- template allowlist: Blocked.
- watermark or manifest: Blocked.
- download-log evidence: Blocked.
- legal/privacy runtime approval: Blocked.
- data-owner approval: Blocked.
- prohibited-payload controls: Blocked.
- negative broad-export tests: Blocked.
- real employee data processing: Blocked.
- HR practical-use readiness: Blocked.
- production-like readiness: Blocked.
- two-key approval: Blocked.

## Follow-Up Shape

A later implementation issue may be created only after a separate owner-reviewed
evidence package names the exact raw-view/export permissions, redaction or
masking profile, template allowlist, watermark or manifest design,
download-log evidence, prohibited-payload controls, negative broad-export
tests, legal/privacy approval record, data-owner approval record, and operating
owner being requested.

That later issue must not rely on this prerequisite record, issue titles,
neighboring closeout language, README status text, bounded synthetic evidence,
MVP-D import fixtures, denied-export evidence, local audit rows, proposed ADR
anchors, ordinary role membership, generic admin flags, fixture logs, or
operator notes as approval.

## Verification Commands

Focused reproduction before this lane:

```sh
npm test -- --test-name-pattern "P2X-04 raw payload CSV export prerequisite lane"
```

The focused guard failed because
`docs/p2x-04-raw-payload-csv-export-prerequisite-lane.md` was missing.

Focused verification after this lane:

```sh
npm test -- --test-name-pattern "P2X-04 raw payload CSV export prerequisite lane"
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

- No unrestricted raw payload.
- No raw payload viewer.
- No raw payload download.
- No broad CSV export.
- No export download.
- No export permission runtime.
- No redaction runtime.
- No masking runtime.
- No watermark generation.
- No export manifest writer.
- No download-log runtime.
- No prohibited-payload runtime.
- No legal/privacy approval claim.
- No data-owner approval claim.
- No real employee data.
- No live IdP/Okta.
- No production authorization/RLS.
- No production audit immutability.
- No production queue/DLQ.
- No retention/deletion runtime.
- No two-key approval claim.
- No HR practical-use readiness.
- No production-like readiness surface.

## Epic Update Boundary

Epic #371 can scope this child to raw payload and broad CSV/export
prerequisite decomposition only.

Unrestricted raw payload and broad CSV export remain blocked. Raw-view/export
permissions, redaction or masking profile, template allowlist, watermark or
manifest, download-log evidence, legal/privacy approval, data-owner approval,
prohibited-payload controls, HR practical-use readiness, and production-like
readiness also remain blocked. Future records must separately supply owner
evidence before changing that status.
