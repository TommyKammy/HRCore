# MVP-A Onboarding Go/No-Go Checklist

This checklist is the final gate-review artifact for bounded MVP-A onboarding
after P2A-01 and P2A-02 evidence. It summarizes repository-owned evidence and
classifies what HRCore may claim now versus what remains blocked.

## Checklist Status

- Status: Ready for final gate review.
- Part of: #184.
- Depends on: #188.
- Scope: MVP-A onboarding only, using synthetic or explicitly approved
  non-production data.
- Decision owner: TommyKammy.
- Verification command: `npm run verify:pre-pr`.

This checklist does not approve production go-live, real personnel data, real
Okta tenant operation, legal/two-key approvals, or CSV/export launch.

## Readiness Classification

| Classification         | Current status      | Required interpretation                                                                                                   |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| bounded/non-production | Go                  | MVP-A onboarding E2E can be reviewed with synthetic or explicitly approved non-production evidence only.                  |
| practical-use-ready    | No-go until blocked | HR operators must not use this for practical HR work until the follow-up issues below close with accepted evidence.       |
| production-like-ready  | No-go until blocked | Production-like runtime, real tenant, real-data, audit immutability, backup, export, and ops gates are not accepted.      |
| no-go                  | Applies on drift    | Any missing, placeholder, malformed, inferred, or partially trusted gate evidence keeps the stronger readiness claim out. |

## Evidence Checklist

| Gate                                          | Evidence reference                                                                                                                                     | Checklist result                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P2A-01 implementation evidence                | P2A-01 onboarding request, approval, apply, future-date apply, mock Okta projection, and work_email writeback implementation through issues #175-#181. | Sufficient for bounded MVP-A E2E review when paired with P2A-02 traceability. It is not a practical-use or production-like claim.                                                                                                                                |
| P2A-02 traceability evidence                  | `docs/mvp-a-onboarding-traceability-closeout.md`; `verifyMvpAOnboardingCorrelationTrace`; `GET /audit/mvp-a/onboarding-correlations/{correlationId}`.  | Direct correlation trace exists for request, approval, apply, lifecycle, apply-job, audit, mock Okta projection, writeback, refresh, and conflict evidence. Broad production audit search remains blocked.                                                       |
| authorization and data-scope gate             | `docs/mvp-a-onboarding-evidence-authorization-gate.md`; `mvp_a_onboarding_evidence_authorization_v1`.                                                  | Bounded field-scope and data-scope classifications exist for directly linked onboarding evidence only. Enterprise RBAC, PostgreSQL RLS, tenant roles, field permission matrices, and real-data authorization remain follow-ups.                                  |
| PII masking, raw payload, and CSV/export gate | `docs/mvp-a-onboarding-pii-export-gate.md`; `mvp_a_onboarding_pii_export_closed_v1`.                                                                   | Raw payload viewing, CSV/export, download, regulated-data payload keys, and production-like PII processing stay closed. Opening any part requires later legal/privacy, masking, permission, watermark/manifest, download-log, and real-data acceptance evidence. |
| audit search gate                             | Bounded correlation inspection API and `docs/mvp-a-onboarding-traceability-closeout.md`.                                                               | Bounded same-correlation inspection exists. Broad audit search UI, provider audit search, WORM/Object Lock, hash-chain, archive, compliance-grade audit storage, and production support search remain blocked.                                                   |
| backup / restore rehearsal                    | `docs/mvp-a-onboarding-backup-restore-rehearsal-gate.md`; `mvp_a_onboarding_backup_restore_rehearsal_v1`.                                              | Local synthetic backup / restore rehearsal exists with restored trace verification and failed-restore rollback. Production RTO/RPO, point-in-time recovery, cross-region restore, secrets recovery, and live tenant backup remain blocked.                       |
| policy-as-code gate                           | ADR 0002, ADR 0020, repository guard tests, prohibited payload tests, and `npm run verify:pre-pr`.                                                     | Repository-owned guard coverage exists for current MVP-A boundaries. A full policy-as-code parser or production policy engine is not implemented and must not be inferred from guard tests alone.                                                                |
| independent review gate                       | `docs/epic-completion-review.md`, PR review, current-head review signal, and unresolved review-thread check.                                           | Required before stronger readiness. This checklist can prepare final review evidence, but practical-use-ready or production-like-ready needs the independent review outcome recorded by the relevant follow-up issue or PR.                                      |

## Bounded MVP-A E2E

Bounded MVP-A E2E may be marked Go only when all of these remain true:

- P2A-01 implementation evidence and P2A-02 traceability evidence are both
  present in repository-owned code, tests, and docs.
- Evidence uses synthetic or explicitly approved non-production data.
- Mock-first provider behavior remains the active provider boundary.
- Authorization and data-scope evidence is limited to the directly linked
  onboarding request, person, employment, assignment, lifecycle, apply-job,
  audit, mock Okta projection, and work_email chain.
- PII masking, raw payload viewing, CSV/export, and regulated-data payload
  surfaces remain closed.
- The local synthetic backup / restore rehearsal passes and failed restore
  paths leave no partial durable state.
- `npm run verify:pre-pr` passes in the final gate-review branch.

## HR Practical-Use Readiness

HR practical-use readiness is No-go until follow-up issues provide accepted
evidence for:

- production-grade actor, subject, tenant, field-level RBAC, and data-scope
  enforcement;
- HR operator workflow controls, including independent review and
  requester/approver governance where applicable;
- practical audit search, support procedures, and incident handling;
- approved non-production or real-data handling basis with masking and
  prohibited-payload controls;
- provider environment binding that is explicit and not inferred from tenant
  names, branch names, comments, fixtures, or issue text.

## Production-Like Readiness

Production-like readiness is No-go until follow-up issues provide accepted
evidence for:

- legal/two-key approvals required by ADR 0000 for authorization, auditability,
  data retention, backup/restore, production operations, external provider
  trust, irreversible migration shape, or compliance evidence;
- real Okta tenant operation, including tenant binding, credential source,
  webhook custody, secret rotation, and provider audit search;
- real personnel data controls, including legal/privacy acceptance, processing
  purpose, retention, DSAR, My Number, Specific Personal Information, and
  sensitive personal information boundaries when in scope;
- production audit immutability, WORM/Object Lock, hash-chain, archive, and
  compliance-grade restore evidence;
- production backup readiness, including RTO/RPO, point-in-time recovery,
  cross-region restore where required, and secrets recovery;
- CSV/export launch controls, including redaction, separate export permission,
  template allowlists, data-scope filtering, watermark or manifest
  traceability, and download-log evidence;
- production operations, support console, DLQ, replay, monitoring, alerting,
  and failed-path cleanup evidence.

## No-Go blockers

Any one of these conditions forces No-go for practical-use-ready and
production-like-ready claims:

- missing or stale P2A-01 or P2A-02 evidence;
- missing `npm run verify:pre-pr` evidence for the final gate-review branch;
- placeholder credentials, sample secrets, unsigned tokens, TODO values, or
  untrusted forwarded identity/context headers;
- tenant, repository, issue, account, environment, or subject linkage inferred
  from naming conventions, path shape, comments, nearby metadata, or GitHub
  issue text instead of authoritative bindings;
- mixed-snapshot backup, restore, export, readiness, or detail aggregation
  evidence;
- partial durable writes or orphan records after rejected, forbidden, failed,
  or restore-failure paths;
- unresolved independent review, unresolved current-head review findings, or
  unresolved gate-review questions.

## Follow-Up Issues Before Stronger Than Bounded

The final gate reviewer must keep the following placeholders open or create the
exact issue references before claiming anything stronger than
bounded/non-production:

- `<follow-up-authorization-data-scope>`: accepted authorization, actor,
  subject, tenant, field-level RBAC, and data-scope enforcement.
- `<follow-up-practical-audit-search>`: practical audit search and support
  review workflow.
- `<follow-up-provider-binding>`: real Okta tenant binding, credentials,
  webhook custody, secret source, and provider audit search.
- `<follow-up-production-audit-immutability>`: WORM/Object Lock, hash-chain,
  archive, and compliance-grade restore evidence.
- `<follow-up-production-backup-readiness>`: production backup, RTO/RPO,
  point-in-time recovery, cross-region restore if required, and secrets
  recovery.
- `<follow-up-pii-masking-export>`: legal/privacy approval, masking,
  redaction, raw-view permission, CSV/export permission, watermark or manifest,
  and download-log evidence.
- `<follow-up-independent-review>`: independent review outcome for practical
  or production-like readiness.
- `<follow-up-operations-dlq-replay>`: support console, DLQ, replay,
  monitoring, alerting, and failed-path cleanup evidence.

Until those follow-ups are accepted, the only allowed final gate result is
bounded/non-production Go for MVP-A onboarding E2E, or No-go if the bounded
evidence itself is missing or stale.
