# MVP-A Onboarding Evidence Authorization Gate

This document defines the bounded MVP-A field-level and data-scope gate for
onboarding evidence. It is a runtime-enforced synthetic MVP-A evidence gate for
PoC-depth evidence exposure, not a production authorization policy engine.

## Contract

Evidence surfaces may be exposed by the MVP-A onboarding trace verifier and
audit endpoint only when the request passes explicit actor, subject,
tenant/environment, field-scope, and data-scope checks in the repo-owned gate
`mvp_a_onboarding_evidence_authorization_v1`.

| Evidence surface    | Field scope                | Data scope                                                                        | Readiness      |
| ------------------- | -------------------------- | --------------------------------------------------------------------------------- | -------------- |
| transaction_request | request_metadata           | same_onboarding_request, same_correlation_id                                      | MVP-A PoC only |
| person              | person_identity            | same_person, same_onboarding_request                                              | MVP-A PoC only |
| employment          | employment_status          | same_employment, same_person                                                      | MVP-A PoC only |
| assignment          | assignment_reference       | same_assignment, same_employment, same_person                                     | MVP-A PoC only |
| lifecycle_event     | lifecycle_evidence         | same_lifecycle_event, same_onboarding_request, same_person                        | MVP-A PoC only |
| apply_job_attempt   | apply_job_attempt_evidence | same_apply_job_attempt, same_onboarding_request, same_person, same_correlation_id | MVP-A PoC only |
| audit_event         | audit_evidence             | same_correlation_id, same_onboarding_request                                      | MVP-A PoC only |
| okta_projection     | provider_projection        | same_mock_okta_projection, same_onboarding_request, same_person                   | MVP-A PoC only |
| work_email_evidence | work_email_contact         | same_work_email_evidence_chain, same_mock_okta_projection, same_person            | MVP-A PoC only |

Unknown, omitted, duplicated, or empty classifications must fail closed in the
repository verifier. A generic role name, admin flag, route permission, raw JSON
blob, memo, fixture, seed, log, forwarded header, or operator comment is not an
authorization substitute for this explicit classification.

At runtime, `GET /audit/mvp-a/onboarding-correlations/{correlationId}` requires
`x-hrcore-mvp-a-actor-id` and `x-hrcore-mvp-a-tenant-environment` headers. The
actor must be the trusted synthetic request owner, the tenant/environment must
match `repo_owned_synthetic_mvp_a_onboarding`, and optional requested evidence
surface or field-scope headers must stay inside the directly classified MVP-A
onboarding evidence set. Missing actor context, mismatched tenant/environment,
unclassified evidence surfaces, forbidden field scopes, and cross-owner access
fail closed before the endpoint returns evidence.

## Boundary

This gate is anchored to ADR 0011. It preserves application-owned
classification before any practical-use claim and keeps the verifier tied to
the directly linked onboarding request, person, employment, assignment,
lifecycle, apply-job attempt, audit, mock Okta projection, and work_email
evidence chain.

Broad enterprise RBAC, PostgreSQL RLS as source of truth, production tenant
roles, real HR user provisioning, and legal acceptance remain out of scope.
Live personal-data access paths and production authorization policy engines
also remain out of scope.

## Actor / Subject / Tenant Binding Gate

MVP-A onboarding correlation evidence must also pass the reusable
`mvp_a_onboarding_actor_subject_tenant_binding_v1` gate before the trace
verifier returns evidence. The gate is repo-owned synthetic/non-production
evidence only. It does not prove live identity governance, production RBAC, or
real tenant authorization.

The gate requires all of these explicit bindings:

| Binding            | MVP-A synthetic source of truth                                                                                                                 | Fail-closed rule                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| trusted actor      | approval `audit_event.actor_id` with the trusted synthetic `operator-` prefix                                                                   | Missing, placeholder, sample, fake, anonymous, admin, or non-synthetic actor IDs are rejected.                                                  |
| effective actor    | every returned onboarding `audit_event.actor_id` and apply-worker `worker_id`, limited to `operator-` or `worker-`                              | Inferred actor context from headers, comments, fixtures, branch names, issue text, or logs is never accepted.                                   |
| subject employee   | the directly linked `transaction_request.person_id`, carried through lifecycle, apply-job, writeback, and trace rows                            | Missing or cross-subject evidence stays blocked by the existing direct-link verifier joins.                                                     |
| tenant/environment | persisted onboarding payload `tenantEnvironmentId` with fixed repo-owned synthetic environment `repo_owned_synthetic_mvp_a_onboarding`          | Tenant, account, environment, or legal-entity context inferred from names or nearby metadata is rejected.                                       |
| request owner      | the same explicit synthetic actor as the approval trusted actor                                                                                 | A different or placeholder owner cannot approve the request-owner binding.                                                                      |
| correlation        | requested trace correlation plus root `transaction_request.correlation_id` or a directly linked audit / worker-attempt operation correlation ID | Missing, placeholder, or unlinked requested correlations fail closed; operation correlations do not have to equal the root request correlation. |

The binding gate is intentionally limited to repository-owned synthetic
fixtures and verifier evidence. Live Okta tenant binding, production credential
custody, real personnel data, enterprise identity governance, production actor
directory lookup, and production tenant roles remain blocked follow-up work.

ADR 0011 remains Proposed. Permissions that require final DSL grammar, field
permission matrices, masking rules, raw-payload viewers, audit-log viewers,
tenant roles, RLS policies, OPA/Rego policy, or real provider/user provisioning
remain design-only or two-key gated until a later Accepted ADR and
implementation issue explicitly authorize them.

## Verification

- Runtime classification and enforcement artifact:
  `src/mvp-a-onboarding-evidence-authorization.ts`.
- Trace verifier integration:
  `verifyMvpAOnboardingCorrelationTrace` returns the gate with every trace.
- Audit endpoint integration:
  `GET /audit/mvp-a/onboarding-correlations/{correlationId}` returns an
  authorization decision with the allowed actor, tenant/environment, evidence
  surfaces, field scopes, data scopes, and audit-correlation binding.
- Binding verifier integration:
  `mvp_a_onboarding_actor_subject_tenant_binding_v1` rejects missing,
  placeholder, inferred, or mismatched actor, subject, tenant/environment,
  request-owner, and correlation binding evidence before trace evidence is
  returned.
- Negative guard:
  `assertMvpAOnboardingEvidenceAuthorizationGate` rejects missing, duplicated,
  unknown, empty, unsupported, or per-surface mismatched evidence
  classifications.
- Runtime negative guard:
  `authorizeMvpAOnboardingEvidenceRuntimeAccess` rejects missing actor context,
  cross-owner actors, mismatched tenant/environment values, unclassified
  evidence surfaces, forbidden field scopes, and empty runtime requests.
