# MVP-A Onboarding Evidence Authorization Gate

This document defines the bounded MVP-A field-level and data-scope gate for
onboarding evidence. It is a classification gate for PoC-depth evidence
exposure, not a production authorization policy engine.

## Contract

Evidence surfaces may be exposed by the MVP-A onboarding trace verifier only
when they have an explicit field-scope and data-scope classification in the
repo-owned gate `mvp_a_onboarding_evidence_authorization_v1`.

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

ADR 0011 remains Proposed. Permissions that require final DSL grammar, field
permission matrices, masking rules, raw-payload viewers, audit-log viewers,
tenant roles, RLS policies, OPA/Rego policy, or real provider/user provisioning
remain design-only or two-key gated until a later Accepted ADR and
implementation issue explicitly authorize them.

## Verification

- Runtime classification artifact:
  `src/mvp-a-onboarding-evidence-authorization.ts`.
- Trace verifier integration:
  `verifyMvpAOnboardingCorrelationTrace` returns the gate with every trace.
- Negative guard:
  `assertMvpAOnboardingEvidenceAuthorizationGate` rejects missing, duplicated,
  or empty evidence classifications.
