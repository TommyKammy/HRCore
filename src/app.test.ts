import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildApp } from "./app.js";
import { buildOktaMasteringAdapter } from "./okta-mastering-adapter.js";
import { openLocalSyntheticWritebackDatabase } from "./local-sqlite.js";
import {
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
} from "./onboarding-transaction-request.js";
import { loadOpenApiContract } from "./openapi.js";
import { buildServerApp, resolvePort } from "./server.js";
import {
  mvpAOnboardingAuditHeaders,
  recordSyntheticOnboardingApplyJobAttempt,
} from "./test-helpers/onboarding.js";
import { createTransferTransactionRequestFixture } from "./transfer-transaction-request.js";
import { createSyntheticWorkEmailWritebackFixture } from "./writeback-ingest.js";

const normalizeRow = <TRow extends Record<string, unknown>>(
  row: TRow | undefined,
): Record<string, unknown> | undefined => (row ? { ...row } : row);

test("GET /health returns the smoke-test health response", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/health",
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok" });
});

test("GET /openapi.json serves the baseline OpenAPI contract", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/openapi.json",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );

  const contract = response.json();
  assert.equal(contract.openapi, "3.1.0");
  assert.equal(contract.info.title, "HRCore API");
  assert.ok(contract.paths["/health"]);
  assert.ok(contract.paths["/provisioning-runs"]);
  assert.ok(
    contract.paths["/audit/mvp-a/onboarding-correlations/{correlationId}"],
  );
  assert.ok(contract.paths["/support/mvp-a/onboarding-reviews"]);
  assert.ok(contract.paths["/onboarding/new-hire"]);
  assert.ok(contract.paths["/onboarding/new-hire/transaction-requests"]);
  assert.ok(
    contract.paths[
      "/onboarding/new-hire/transaction-requests/{transactionRequestId}/decisions"
    ],
  );
  assert.ok(
    contract.paths[
      "/onboarding/new-hire/transaction-requests/{transactionRequestId}/apply"
    ],
  );
  assert.ok(
    contract.paths["/onboarding/new-hire/transaction-requests/validate"],
  );
  assert.ok(contract.paths["/transfers/assignment-change"]);
  assert.ok(
    contract.paths["/transfers/assignment-change/transaction-requests"],
  );
  assert.ok(
    contract.paths[
      "/transfers/assignment-change/transaction-requests/validate"
    ],
  );
  assert.ok(contract.paths["/writeback-events/work-email"]);

  assert.equal(
    contract.paths["/onboarding/new-hire"].get.responses["200"].content[
      "text/html"
    ].schema.type,
    "string",
  );
  assert.equal(
    contract.paths["/onboarding/new-hire/transaction-requests"].post.requestBody
      .content["application/json"].schema.$ref,
    "#/components/schemas/OnboardingTransactionRequestInput",
  );
  assert.equal(
    contract.paths["/transfers/assignment-change"].get.responses["200"].content[
      "text/html"
    ].schema.type,
    "string",
  );
  assert.equal(
    contract.paths["/transfers/assignment-change/transaction-requests"].post
      .requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/TransferTransactionRequestInput",
  );
  assert.equal(
    contract.paths["/transfers/assignment-change/transaction-requests/validate"]
      .post.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/TransferTransactionRequestInput",
  );
  const transferSaveOperation =
    contract.paths["/transfers/assignment-change/transaction-requests"].post;
  assert.equal(
    transferSaveOperation.responses["400"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ValidationErrorResponse",
  );
  assert.equal(
    transferSaveOperation.responses["409"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  assert.equal(
    transferSaveOperation.responses["503"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  const onboardingSaveOperation =
    contract.paths["/onboarding/new-hire/transaction-requests"].post;
  assert.equal(
    onboardingSaveOperation.responses["400"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ValidationErrorResponse",
  );
  assert.equal(
    onboardingSaveOperation.responses["409"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  assert.equal(
    onboardingSaveOperation.responses["503"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  const onboardingDecisionOperation =
    contract.paths[
      "/onboarding/new-hire/transaction-requests/{transactionRequestId}/decisions"
    ].post;
  assert.equal(
    onboardingDecisionOperation.requestBody.content["application/json"].schema
      .$ref,
    "#/components/schemas/OnboardingApprovalDecisionInput",
  );
  assert.equal(
    onboardingDecisionOperation.responses["200"].content["application/json"]
      .schema.$ref,
    "#/components/schemas/OnboardingApprovalDecisionResult",
  );
  assert.equal(
    onboardingDecisionOperation.responses["404"].content["application/json"]
      .schema.$ref,
    "#/components/schemas/ErrorResponse",
  );
  const onboardingApplyOperation =
    contract.paths[
      "/onboarding/new-hire/transaction-requests/{transactionRequestId}/apply"
    ].post;
  assert.equal(
    onboardingApplyOperation.requestBody.content["application/json"].schema
      .$ref,
    "#/components/schemas/ApplyApprovedOnboardingTransactionRequestInput",
  );
  assert.equal(
    onboardingApplyOperation.responses["200"].content["application/json"].schema
      .$ref,
    "#/components/schemas/AppliedOnboardingTransactionRequestResult",
  );
  assert.equal(
    contract.components.schemas.AppliedOnboardingTransactionRequestResult
      .properties.statusCode.const,
    "completed",
  );
  assert.deepEqual(
    contract.components.schemas.MvpAOnboardingTransactionTrace.properties
      .statusCode.enum,
    ["approved", "completed"],
  );
  assert.deepEqual(
    contract.components.schemas.OnboardingApprovalDecisionInput.properties
      .decision.enum,
    ["approve", "return", "reject", "cancel"],
  );
  assert.deepEqual(
    contract.components.schemas.OnboardingApprovalDecisionResult.properties
      .statusCode.enum,
    ["returned", "rejected", "cancelled", "approved"],
  );
  const onboardingRequestInput =
    contract.components.schemas.OnboardingTransactionRequestInput;
  assert.equal(onboardingRequestInput.properties.id.minLength, 1);
  assert.equal(
    onboardingRequestInput.properties.requestedAt.pattern,
    "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$",
  );
  assert.equal(onboardingRequestInput.properties.correlationId.minLength, 1);

  const onboardingPersonInput =
    contract.components.schemas.OnboardingPersonInput;
  assert.equal(onboardingPersonInput.properties.id.minLength, 1);
  assert.equal(onboardingPersonInput.properties.displayName.minLength, 1);
  assert.equal(
    onboardingPersonInput.properties.createdAt.pattern,
    "^\\d{4}-\\d{2}-\\d{2}T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d+)?(?:Z|[+-](?:[01]\\d|2[0-3]):[0-5]\\d)$",
  );

  const onboardingPayload = contract.components.schemas.OnboardingPayload;
  assert.deepEqual(onboardingPayload.required, [
    "tenantEnvironmentId",
    "effectiveDate",
    "employment",
    "assignment",
    "workEmailExpectation",
  ]);
  assert.equal(
    onboardingPayload.properties.tenantEnvironmentId.const,
    "repo_owned_synthetic_mvp_a_onboarding",
  );
  assert.equal(
    onboardingPayload.properties.effectiveDate.pattern,
    "^\\d{4}-\\d{2}-\\d{2}$",
  );

  const onboardingEmploymentPayload =
    contract.components.schemas.OnboardingEmploymentPayload;
  assert.equal(onboardingEmploymentPayload.properties.id.minLength, 1);
  assert.equal(
    onboardingEmploymentPayload.properties.employmentCode.minLength,
    1,
  );
  assert.equal(
    onboardingEmploymentPayload.properties.startDate.pattern,
    "^\\d{4}-\\d{2}-\\d{2}$",
  );

  const onboardingAssignmentPayload =
    contract.components.schemas.OnboardingAssignmentPayload;
  assert.equal(onboardingAssignmentPayload.properties.id.minLength, 1);
  assert.equal(
    onboardingAssignmentPayload.properties.assignmentCode.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.departmentReference.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.legalEntityReference.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.managerReference.minLength,
    1,
  );
  assert.equal(
    onboardingAssignmentPayload.properties.positionCode.minLength,
    1,
  );

  const onboardingWorkEmailExpectation =
    contract.components.schemas.OnboardingWorkEmailExpectation;
  assert.equal(
    onboardingWorkEmailExpectation.properties.contactPointId.minLength,
    1,
  );
  assert.equal(onboardingWorkEmailExpectation.properties.value.minLength, 1);
  assert.equal(
    onboardingWorkEmailExpectation.properties.value.pattern,
    "^[^@]+@.+$",
  );

  const transferRequestInput =
    contract.components.schemas.TransferTransactionRequestInput;
  assert.equal(transferRequestInput.properties.requestType.const, "transfer");
  assert.equal(
    transferRequestInput.properties.payloadVersion.const,
    "mvp_b_transfer_v1",
  );
  assert.equal(
    transferRequestInput.properties.payload.$ref,
    "#/components/schemas/TransferPayload",
  );
  const transferPayload = contract.components.schemas.TransferPayload;
  assert.deepEqual(transferPayload.required, [
    "tenantEnvironmentId",
    "effectiveDate",
    "currentAssignment",
    "targetAssignment",
    "transferReason",
  ]);
  assert.equal(
    transferPayload.properties.tenantEnvironmentId.const,
    "repo_owned_synthetic_mvp_b_transfer",
  );
  assert.equal(
    transferPayload.properties.effectiveDate.pattern,
    "^\\d{4}-\\d{2}-\\d{2}$",
  );
  assert.deepEqual(
    Object.keys(transferPayload.properties).filter((propertyName) =>
      /raw|csv|upload|provider|search/u.test(propertyName),
    ),
    [],
  );
  assert.deepEqual(
    contract.components.schemas.TransferReasonPayload.properties.reasonCode
      .enum,
    ["team_change", "manager_change", "organization_change"],
  );

  const writebackOperation =
    contract.paths["/writeback-events/work-email"].post;
  assert.equal(
    writebackOperation.responses["201"].description,
    "Synthetic writeback event was persisted and either applied or recorded as PoC conflict evidence.",
  );
  assert.equal(
    writebackOperation.responses["201"].content["application/json"].schema.$ref,
    "#/components/schemas/SyntheticWorkEmailWritebackResult",
  );
  assert.equal(
    writebackOperation.responses["400"].description,
    "Synthetic writeback input was malformed or violated local synthetic constraints.",
  );
  assert.equal(
    writebackOperation.responses["400"].content["application/json"].schema.$ref,
    "#/components/schemas/ErrorResponse",
  );

  const writebackResult =
    contract.components.schemas.SyntheticWorkEmailWritebackResult;
  assert.equal(writebackResult.properties.applied.type, "boolean");
  assert.equal(writebackResult.properties.applied.const, undefined);
  assert.equal(
    writebackResult.properties.conflict.$ref,
    "#/components/schemas/SyntheticWorkEmailConflictEvidence",
  );
  assert.deepEqual(
    contract.components.schemas.SyntheticWorkEmailConflictEvidence.required,
    [
      "conflictId",
      "conflictType",
      "currentContactValue",
      "attemptedProviderValue",
      "correlationId",
    ],
  );
  const auditTraceOperation =
    contract.paths["/audit/mvp-a/onboarding-correlations/{correlationId}"].get;
  assert.equal(
    auditTraceOperation.responses["200"].content["application/json"].schema
      .$ref,
    "#/components/schemas/MvpAOnboardingCorrelationTraceResponse",
  );
  assert.equal(
    auditTraceOperation.responses["409"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  assert.equal(
    auditTraceOperation.responses["403"].content["application/json"].schema
      .$ref,
    "#/components/schemas/ErrorResponse",
  );
  assert.match(
    auditTraceOperation.description,
    /runtime actor, tenant\/environment, field-scope, and data-scope checks/u,
  );
  assert.deepEqual(
    auditTraceOperation.parameters
      .filter((parameter: { in: string }) => parameter.in === "header")
      .map((parameter: { name: string }) => parameter.name),
    [
      "x-hrcore-mvp-a-actor-id",
      "x-hrcore-mvp-a-tenant-environment",
      "x-hrcore-mvp-a-evidence-surfaces",
      "x-hrcore-mvp-a-field-scopes",
    ],
  );
  assert.deepEqual(
    contract.components.schemas.MvpAOnboardingCorrelationTraceSummary
      .required ?? [],
    [],
  );
  assert.deepEqual(
    Object.keys(
      contract.components.schemas.MvpAOnboardingCorrelationTraceSummary
        .properties,
    ).filter((propertyName) => propertyName.includes("Refresh")),
    ["providerRefreshId", "providerRefreshConflictId"],
  );
  assert.deepEqual(
    contract.components.schemas.MvpAOnboardingCorrelationTraceResponse.required,
    [
      "correlationId",
      "evidenceType",
      "authorization",
      "trace",
      "deferredProductionGates",
    ],
  );
  const supportReviewOperation =
    contract.paths["/support/mvp-a/onboarding-reviews"].post;
  assert.equal(
    supportReviewOperation.requestBody.content["application/json"].schema.$ref,
    "#/components/schemas/MvpAOnboardingSupportReviewInput",
  );
  assert.equal(
    supportReviewOperation.responses["201"].content["application/json"].schema
      .$ref,
    "#/components/schemas/MvpAOnboardingSupportReviewResponse",
  );
  assert.match(
    supportReviewOperation.description,
    /keeps unredacted request-body disclosure, broad audit lookup, provider-side audit lookup/u,
  );
  assert.equal(
    contract.components.schemas.MvpAOnboardingSupportReviewInput.properties
      .reasonCode.const,
    "onboarding_evidence_review",
  );
  assert.equal(
    contract.components.schemas.MvpAOnboardingSupportReviewAuthorizationDecision
      .properties.gateId.const,
    "mvp_a_onboarding_support_review_v1",
  );
  assert.deepEqual(
    contract.components.schemas.MvpAOnboardingSupportReviewResponse.required,
    [
      "reviewType",
      "correlationId",
      "reviewCorrelationId",
      "reasonCode",
      "authorization",
      "trace",
      "reviewAuditEvidence",
      "deferredProductionGates",
    ],
  );
});

test("GET /provisioning-runs exposes minimal synthetic run evidence", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/provisioning-runs",
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );

  assert.deepEqual(response.json(), {
    runs: [
      {
        runId: "synthetic-okta-run-001",
        status: "completed",
        targetOperation: "create",
        result: "success",
        correlationId:
          "okta:mock:create:EMP-LOG-001:2026-05-18T07%3A00%3A00.000Z",
        synthetic: true,
      },
      {
        runId: "synthetic-okta-run-002",
        status: "needs_attention",
        targetOperation: "disable",
        result: "permanent_failure",
        correlationId:
          "okta:mock:disable:EMP-PERM:2026-05-18T06%3A00%3A00.000Z",
        synthetic: true,
      },
    ],
  });
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId exposes bounded onboarding evidence", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-audit-lookup-001";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: rootCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(
    onboardingDb,
    {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: rootCorrelationId,
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    },
  );
  recordSyntheticOnboardingApplyJobAttempt(onboardingDb, rootCorrelationId);
  onboardingDb
    .prepare(
      `
        INSERT INTO writeback_provider_refresh (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    )
    .run(
      "synthetic-work-email-provider-refresh-audit-lookup-001",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:00:00Z",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T03%3A00%3A00Z",
    );

  const response = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: mvpAOnboardingAuditHeaders,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.headers["content-type"],
    "application/json; charset=utf-8",
  );
  assert.deepEqual(response.json(), {
    correlationId: rootCorrelationId,
    evidenceType: "mvp_a_onboarding_correlation_trace",
    authorization: {
      decision: "allow",
      gateId: "mvp_a_onboarding_evidence_authorization_v1",
      actorId: "operator-people-ops-001",
      tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
      evidenceSurfaces: [
        "transaction_request",
        "person",
        "audit_event",
        "lifecycle_event",
        "apply_job_attempt",
        "okta_projection",
        "work_email_evidence",
      ],
      fieldScopes: [
        "request_metadata",
        "person_identity",
        "audit_evidence",
        "lifecycle_evidence",
        "apply_job_attempt_evidence",
        "provider_projection",
        "work_email_contact",
      ],
      dataScopes: [
        "same_onboarding_request",
        "same_correlation_id",
        "same_person",
        "same_lifecycle_event",
        "same_apply_job_attempt",
        "same_mock_okta_projection",
        "same_work_email_evidence_chain",
      ],
      auditCorrelation: "same_onboarding_request_or_linked_operation",
    },
    trace: {
      transactionRequest: {
        id: "transaction-request-onboarding-001",
        requestType: "hire",
        statusCode: "completed",
        correlationId: rootCorrelationId,
      },
      person: {
        id: "person-onboarding-001",
      },
      approvalAuditEvent: {
        id: "audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-audit-lookup-001",
        actorId: "operator-people-ops-001",
        action: "mvp_a.onboarding.approve",
        subjectTable: "transaction_request",
        subjectId: "transaction-request-onboarding-001",
        occurredAt: "2026-05-21T01:00:00Z",
        correlationId: rootCorrelationId,
      },
      applyAuditEvent: {
        id: "audit-event-lifecycle-event-transaction-request-onboarding-001-apply-applied",
        actorId: "operator-people-ops-apply-001",
        action: "mvp_a.onboarding.apply",
        subjectTable: "lifecycle_event",
        subjectId: "lifecycle-event-transaction-request-onboarding-001-apply",
        occurredAt: "2026-05-21T02:00:00Z",
        correlationId: rootCorrelationId,
      },
      auditEventCount: 2,
      lifecycleEventId:
        "lifecycle-event-transaction-request-onboarding-001-apply",
      applyJobAttemptCount: 1,
      workEmailWritebackEventId:
        "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      providerRefreshId:
        "synthetic-work-email-provider-refresh-audit-lookup-001",
      workEmailConflictId: null,
    },
    deferredProductionGates: [
      "WORM / S3 Object Lock audit immutability and archive evidence",
      "broad audit search UI for production support and review",
      "production backup readiness beyond the local synthetic backup / restore rehearsal",
      "production field-level RBAC and data-scope enforcement beyond the bounded MVP-A onboarding evidence authorization gate",
      "export controls for raw payloads, CSV output, download logs, and watermark or manifest traceability",
      "real Okta tenant credentials, tenant binding, webhook custody, and provider audit search",
    ],
  });
  assert.doesNotMatch(response.body, /payload_json|payloadJson|rawPayload/u);

  const limitedResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "transaction_request",
      "x-hrcore-mvp-a-field-scopes": "request_metadata",
    },
  });

  assert.equal(limitedResponse.statusCode, 200);
  assert.deepEqual(limitedResponse.json().authorization.evidenceSurfaces, [
    "transaction_request",
  ]);
  assert.deepEqual(limitedResponse.json().authorization.fieldScopes, [
    "request_metadata",
  ]);
  assert.deepEqual(limitedResponse.json().trace, {
    transactionRequest: {
      id: "transaction-request-onboarding-001",
      requestType: "hire",
      statusCode: "completed",
      correlationId: rootCorrelationId,
    },
  });
  assert.doesNotMatch(
    limitedResponse.body,
    /personId|approvalAuditEvent|applyAuditEvent|lifecycleEventId|applyJobAttemptCount|workEmailWritebackEventId|providerRefreshId|providerRefreshConflictId|workEmailConflictId/u,
  );

  const personOnlyResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "person",
      "x-hrcore-mvp-a-field-scopes": "person_identity",
    },
  });

  assert.equal(personOnlyResponse.statusCode, 200);
  assert.deepEqual(personOnlyResponse.json().authorization.evidenceSurfaces, [
    "person",
  ]);
  assert.deepEqual(personOnlyResponse.json().authorization.fieldScopes, [
    "person_identity",
  ]);
  assert.deepEqual(personOnlyResponse.json().trace, {
    person: {
      id: "person-onboarding-001",
    },
  });

  const employmentOnlyResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "employment",
      "x-hrcore-mvp-a-field-scopes": "employment_status",
    },
  });

  assert.equal(employmentOnlyResponse.statusCode, 200);
  assert.deepEqual(
    employmentOnlyResponse.json().authorization.evidenceSurfaces,
    ["employment"],
  );
  assert.deepEqual(employmentOnlyResponse.json().authorization.fieldScopes, [
    "employment_status",
  ]);
  assert.deepEqual(employmentOnlyResponse.json().trace, {
    employment: {
      id: "employment-onboarding-001",
      employmentCode: "EMP-ONBOARDING-001",
      statusCode: "active",
      startDate: "2026-06-01",
      endDate: null,
    },
  });

  const assignmentOnlyResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "assignment",
      "x-hrcore-mvp-a-field-scopes": "assignment_reference",
    },
  });

  assert.equal(assignmentOnlyResponse.statusCode, 200);
  assert.deepEqual(
    assignmentOnlyResponse.json().authorization.evidenceSurfaces,
    ["assignment"],
  );
  assert.deepEqual(assignmentOnlyResponse.json().authorization.fieldScopes, [
    "assignment_reference",
  ]);
  assert.deepEqual(assignmentOnlyResponse.json().trace, {
    assignment: {
      id: "assignment-onboarding-001",
      employmentId: "employment-onboarding-001",
      assignmentCode: "ASN-ONBOARDING-001",
      organizationCode: "department-people-ops",
      positionCode: "position-engineer-001",
      startDate: "2026-06-01",
      endDate: null,
    },
  });

  onboardingDb.exec("DELETE FROM writeback_provider_refresh");
  onboardingDb.exec("DELETE FROM writeback_event");
  const requestOnlyWithoutWritebackResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "transaction_request",
      "x-hrcore-mvp-a-field-scopes": "request_metadata",
    },
  });

  assert.equal(requestOnlyWithoutWritebackResponse.statusCode, 200);
  assert.deepEqual(requestOnlyWithoutWritebackResponse.json().trace, {
    transactionRequest: {
      id: "transaction-request-onboarding-001",
      requestType: "hire",
      statusCode: "completed",
      correlationId: rootCorrelationId,
    },
  });
  assert.doesNotMatch(
    requestOnlyWithoutWritebackResponse.body,
    /workEmailWritebackEventId|providerRefreshId|providerRefreshConflictId|workEmailConflictId/u,
  );

  onboardingDb.exec("DELETE FROM writeback_provider_refresh");
  const wrongOwnerResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-actor-id": "operator-people-ops-002",
    },
  });

  assert.equal(wrongOwnerResponse.statusCode, 403);
  assert.deepEqual(wrongOwnerResponse.json(), {
    error:
      "MVP-A onboarding evidence access requires actor to match the trusted request owner",
  });

  const missingProviderRefreshResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: mvpAOnboardingAuditHeaders,
  });

  assert.equal(missingProviderRefreshResponse.statusCode, 409);
  assert.deepEqual(missingProviderRefreshResponse.json(), {
    error:
      "MVP-A onboarding trace requires work_email writeback evidence linked to the correlated onboarding payload",
  });
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId does not require apply evidence for request metadata scope", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-request-metadata-only-001";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: rootCorrelationId,
  });

  const response = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "transaction_request",
      "x-hrcore-mvp-a-field-scopes": "request_metadata",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().authorization.evidenceSurfaces, [
    "transaction_request",
  ]);
  assert.deepEqual(response.json().authorization.fieldScopes, [
    "request_metadata",
  ]);
  assert.deepEqual(response.json().trace, {
    transactionRequest: {
      id: "transaction-request-onboarding-001",
      requestType: "hire",
      statusCode: "approved",
      correlationId: rootCorrelationId,
    },
  });
  assert.doesNotMatch(
    response.body,
    /approvalAuditEvent|applyAuditEvent|lifecycleEventId|applyJobAttemptCount|employment|assignment|workEmailWritebackEventId|providerRefreshId|providerRefreshConflictId|workEmailConflictId/u,
  );
});

test("POST /support/mvp-a/onboarding-reviews records reasoned bounded support review evidence", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-support-review-001";
  const reviewCorrelationId = "correlation-support-review-001";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: rootCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(
    onboardingDb,
    {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: rootCorrelationId,
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    },
  );

  const response = await app.inject({
    method: "POST",
    url: "/support/mvp-a/onboarding-reviews",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-support-001",
      "x-hrcore-mvp-a-tenant-environment":
        "repo_owned_synthetic_mvp_a_onboarding",
    },
    payload: {
      correlationId: rootCorrelationId,
      reviewCorrelationId,
      reasonCode: "onboarding_evidence_review",
      requestedEvidenceSurfaces: ["transaction_request", "audit_event"],
      requestedFieldScopes: ["request_metadata", "audit_evidence"],
    },
  });

  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), {
    reviewType: "mvp_a_onboarding_support_review",
    correlationId: rootCorrelationId,
    reviewCorrelationId,
    reasonCode: "onboarding_evidence_review",
    authorization: {
      decision: "allow",
      gateId: "mvp_a_onboarding_support_review_v1",
      actorId: "operator-support-001",
      tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
      evidenceSurfaces: ["transaction_request", "audit_event"],
      fieldScopes: ["request_metadata", "audit_evidence"],
      dataScopes: ["same_onboarding_request", "same_correlation_id"],
      auditCorrelation: "direct_onboarding_correlation_with_reason",
    },
    trace: {
      transactionRequest: {
        id: "transaction-request-onboarding-001",
        requestType: "hire",
        statusCode: "completed",
        correlationId: rootCorrelationId,
      },
      approvalAuditEvent: {
        id: "audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-support-review-001",
        actorId: "operator-people-ops-001",
        action: "mvp_a.onboarding.approve",
        subjectTable: "transaction_request",
        subjectId: "transaction-request-onboarding-001",
        occurredAt: "2026-05-21T01:00:00Z",
        correlationId: rootCorrelationId,
      },
      applyAuditEvent: {
        id: "audit-event-lifecycle-event-transaction-request-onboarding-001-apply-applied",
        actorId: "operator-people-ops-apply-001",
        action: "mvp_a.onboarding.apply",
        subjectTable: "lifecycle_event",
        subjectId: "lifecycle-event-transaction-request-onboarding-001-apply",
        occurredAt: "2026-05-21T02:00:00Z",
        correlationId: rootCorrelationId,
      },
      auditEventCount: 2,
    },
    reviewAuditEvidence: {
      auditEventId: "audit-event-support-review-correlation-support-review-001",
      actorId: "operator-support-001",
      action: "mvp_a.support_review.inspect.reason.onboarding_evidence_review",
      subjectTable: "transaction_request",
      subjectId: "transaction-request-onboarding-001",
      correlationId: reviewCorrelationId,
    },
    deferredProductionGates: [
      "WORM / S3 Object Lock audit immutability and archive evidence",
      "hash-chain archive verification for production audit storage",
      "provider audit search for live Okta or other external tenants",
      "compliance restore evidence beyond the local synthetic rehearsal",
      "production support procedures, custody, ticket binding, and post-use review",
    ],
  });
  assert.doesNotMatch(response.body, /payload_json|payloadJson|rawPayload/u);

  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT actor_id, action, subject_table, subject_id, correlation_id
            FROM audit_event
            WHERE id = ?
          `,
        )
        .get("audit-event-support-review-correlation-support-review-001") as
        | Record<string, unknown>
        | undefined,
    ),
    {
      actor_id: "operator-support-001",
      action: "mvp_a.support_review.inspect.reason.onboarding_evidence_review",
      subject_table: "transaction_request",
      subject_id: "transaction-request-onboarding-001",
      correlation_id: reviewCorrelationId,
    },
  );

  const duplicateReviewResponse = await app.inject({
    method: "POST",
    url: "/support/mvp-a/onboarding-reviews",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-support-001",
      "x-hrcore-mvp-a-tenant-environment":
        "repo_owned_synthetic_mvp_a_onboarding",
    },
    payload: {
      correlationId: rootCorrelationId,
      reviewCorrelationId,
      reasonCode: "onboarding_evidence_review",
      requestedEvidenceSurfaces: ["transaction_request", "audit_event"],
      requestedFieldScopes: ["request_metadata", "audit_evidence"],
    },
  });

  assert.equal(duplicateReviewResponse.statusCode, 409);
  assert.match(
    duplicateReviewResponse.body,
    /duplicate review correlation id/u,
  );

  const duplicateConstraintDb = new Proxy(onboardingDb, {
    get(target, property, receiver) {
      if (property !== "prepare") {
        return Reflect.get(target, property, receiver);
      }

      return (sql: string) => {
        const statement = target.prepare(sql);
        if (
          sql.includes("SELECT id") &&
          sql.includes("FROM audit_event") &&
          sql.includes("mvp_a.support_review.%")
        ) {
          return {
            get: () => undefined,
            run: (...values: Parameters<typeof statement.run>) =>
              statement.run(...values),
          };
        }

        if (sql.includes("INSERT INTO audit_event")) {
          return {
            get: (...values: Parameters<typeof statement.get>) =>
              statement.get(...values),
            run: (...values: Parameters<typeof statement.run>) => {
              if (
                values[0] ===
                "audit-event-support-review-correlation-support-review-001"
              ) {
                const error = new Error(
                  "UNIQUE constraint failed: audit_event.id",
                ) as Error & { code: string };
                error.code = "SQLITE_CONSTRAINT_PRIMARYKEY";
                throw error;
              }

              return statement.run(...values);
            },
          };
        }

        return statement;
      };
    },
  });
  const duplicateConstraintApp = await buildApp({
    onboardingDb: duplicateConstraintDb,
  });
  t.after(async () => {
    await duplicateConstraintApp.close();
  });
  const duplicateConstraintResponse = await duplicateConstraintApp.inject({
    method: "POST",
    url: "/support/mvp-a/onboarding-reviews",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-support-001",
      "x-hrcore-mvp-a-tenant-environment":
        "repo_owned_synthetic_mvp_a_onboarding",
    },
    payload: {
      correlationId: rootCorrelationId,
      reviewCorrelationId,
      reasonCode: "onboarding_evidence_review",
      requestedEvidenceSurfaces: ["transaction_request", "audit_event"],
      requestedFieldScopes: ["request_metadata", "audit_evidence"],
    },
  });

  assert.equal(duplicateConstraintResponse.statusCode, 409);
  assert.match(
    duplicateConstraintResponse.body,
    /duplicate review correlation id/u,
  );
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT COUNT(*) AS count
            FROM audit_event
            WHERE id = ?
          `,
        )
        .get("audit-event-support-review-correlation-support-review-001") as
        | Record<string, unknown>
        | undefined,
    ),
    { count: 1 },
  );

  const unboundSupportActorResponse = await app.inject({
    method: "POST",
    url: "/support/mvp-a/onboarding-reviews",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-support-",
      "x-hrcore-mvp-a-tenant-environment":
        "repo_owned_synthetic_mvp_a_onboarding",
    },
    payload: {
      correlationId: rootCorrelationId,
      reviewCorrelationId: "correlation-support-review-unbound-actor-001",
      reasonCode: "onboarding_evidence_review",
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
    },
  });

  assert.equal(unboundSupportActorResponse.statusCode, 403);
  assert.match(
    unboundSupportActorResponse.body,
    /requires a bound support actor/u,
  );

  for (const payload of [
    {
      reviewCorrelationId: "correlation-support-review-missing-reason-001",
      correlationId: rootCorrelationId,
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
    },
    {
      reasonCode: "onboarding_evidence_review",
      reviewCorrelationId: "correlation-support-review-broad-001",
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
    },
    {
      reasonCode: "onboarding_evidence_review",
      correlationId: rootCorrelationId,
      reviewCorrelationId: "correlation-support-review-raw-001",
      requestedEvidenceSurfaces: ["raw_payload"],
      requestedFieldScopes: ["request_metadata"],
    },
    {
      reasonCode: "provider_audit_search",
      correlationId: rootCorrelationId,
      reviewCorrelationId: "correlation-support-review-provider-001",
      requestedEvidenceSurfaces: ["okta_projection"],
      requestedFieldScopes: ["provider_projection"],
    },
    {
      reasonCode: "onboarding_evidence_review",
      correlationId: rootCorrelationId,
      reviewCorrelationId: "fake001",
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
    },
    {
      reasonCode: "onboarding_evidence_review",
      correlationId: rootCorrelationId,
      reviewCorrelationId: "unknown123",
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
    },
    {
      reasonCode: "onboarding_evidence_review",
      correlationId: rootCorrelationId,
      reviewCorrelationId: "correlation-support-review-raw-field-001",
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
      rawPayload: { blocked: true },
    },
    {
      reasonCode: "onboarding_evidence_review",
      correlationId: rootCorrelationId,
      reviewCorrelationId: "correlation-support-review-provider-field-001",
      requestedEvidenceSurfaces: ["transaction_request"],
      requestedFieldScopes: ["request_metadata"],
      providerAuditSearch: { provider: "synthetic_okta" },
    },
  ]) {
    const rejectedResponse = await app.inject({
      method: "POST",
      url: "/support/mvp-a/onboarding-reviews",
      headers: {
        "x-hrcore-mvp-a-actor-id": "operator-support-001",
        "x-hrcore-mvp-a-tenant-environment":
          "repo_owned_synthetic_mvp_a_onboarding",
      },
      payload,
    });

    assert.equal(rejectedResponse.statusCode, 403);
  }

  assert.equal(
    (
      onboardingDb
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_event WHERE action LIKE 'mvp_a.support_review.%'",
        )
        .get() as { count: number }
    ).count,
    1,
  );
});

test("POST /support/mvp-a/onboarding-reviews defaults to public apply evidence", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId =
    "correlation-onboarding-support-review-public-apply-001";
  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  });
  assert.equal(submitResponse.statusCode, 201);

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: rootCorrelationId,
    },
  });
  assert.equal(decisionResponse.statusCode, 200);

  const applyResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/apply",
    payload: {
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: rootCorrelationId,
    },
  });
  assert.equal(applyResponse.statusCode, 200);

  const reviewResponse = await app.inject({
    method: "POST",
    url: "/support/mvp-a/onboarding-reviews",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-support-001",
      "x-hrcore-mvp-a-tenant-environment":
        "repo_owned_synthetic_mvp_a_onboarding",
    },
    payload: {
      correlationId: rootCorrelationId,
      reviewCorrelationId: "correlation-support-review-public-apply-001",
      reasonCode: "onboarding_evidence_review",
    },
  });

  assert.equal(reviewResponse.statusCode, 201);
  assert.deepEqual(reviewResponse.json().authorization.evidenceSurfaces, [
    "transaction_request",
    "person",
    "employment",
    "assignment",
    "audit_event",
    "lifecycle_event",
  ]);
  assert.deepEqual(reviewResponse.json().authorization.fieldScopes, [
    "request_metadata",
    "person_identity",
    "employment_status",
    "assignment_reference",
    "audit_evidence",
    "lifecycle_evidence",
  ]);
  assert.doesNotMatch(
    reviewResponse.body,
    /applyJobAttemptCount|providerRefresh|workEmail/u,
  );
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId fails closed when apply job evidence is absent", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-missing-apply-job-001";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: rootCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(
    onboardingDb,
    {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: rootCorrelationId,
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    },
  );

  const response = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "apply_job_attempt",
      "x-hrcore-mvp-a-field-scopes": "apply_job_attempt_evidence",
    },
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), {
    error:
      "MVP-A onboarding trace requires apply job attempt evidence linked to the correlated transaction request",
  });
  assert.doesNotMatch(response.body, /applyJobAttemptCount/u);
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId fails closed without actor context", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-audit-missing-actor-001";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: rootCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(
    onboardingDb,
    {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: rootCorrelationId,
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    },
  );
  recordSyntheticOnboardingApplyJobAttempt(onboardingDb, rootCorrelationId);
  onboardingDb
    .prepare(
      `
        INSERT INTO writeback_provider_refresh (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    )
    .run(
      "synthetic-work-email-provider-refresh-audit-missing-actor-001",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:00:00Z",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T03%3A00%3A00Z",
    );

  const response = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    error: "MVP-A onboarding evidence access requires actor context",
  });
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId validates tenant before trace lookup", async (t) => {
  let traceLookupCount = 0;
  const app = await buildApp({
    auditTraceDb: {
      prepare() {
        traceLookupCount += 1;
        throw new Error("trace lookup ran before tenant validation");
      },
    },
  });
  t.after(async () => {
    await app.close();
  });

  const missingTenantResponse = await app.inject({
    method: "GET",
    url: "/audit/mvp-a/onboarding-correlations/correlation-before-tenant-001",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-people-ops-001",
    },
  });

  assert.equal(missingTenantResponse.statusCode, 403);
  assert.deepEqual(missingTenantResponse.json(), {
    error:
      "MVP-A onboarding evidence access requires tenant environment context",
  });
  assert.equal(traceLookupCount, 0);

  const wrongTenantResponse = await app.inject({
    method: "GET",
    url: "/audit/mvp-a/onboarding-correlations/correlation-before-tenant-001",
    headers: {
      "x-hrcore-mvp-a-actor-id": "operator-people-ops-001",
      "x-hrcore-mvp-a-tenant-environment": "prod",
    },
  });

  assert.equal(wrongTenantResponse.statusCode, 403);
  assert.deepEqual(wrongTenantResponse.json(), {
    error:
      "MVP-A onboarding binding gate requires the explicit repo-owned synthetic tenant environment",
  });
  assert.equal(traceLookupCount, 0);
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId validates requested evidence scopes before trace lookup", async (t) => {
  let traceLookupCount = 0;
  const app = await buildApp({
    auditTraceDb: {
      prepare() {
        traceLookupCount += 1;
        throw new Error("trace lookup ran before scope validation");
      },
    },
  });
  t.after(async () => {
    await app.close();
  });

  const forbiddenSurfaceResponse = await app.inject({
    method: "GET",
    url: "/audit/mvp-a/onboarding-correlations/correlation-before-scope-001",
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "payroll_export",
    },
  });

  assert.equal(forbiddenSurfaceResponse.statusCode, 403);
  assert.deepEqual(forbiddenSurfaceResponse.json(), {
    error:
      "MVP-A onboarding evidence access rejects unclassified payroll_export evidence surface",
  });
  assert.equal(traceLookupCount, 0);

  const forbiddenFieldResponse = await app.inject({
    method: "GET",
    url: "/audit/mvp-a/onboarding-correlations/correlation-before-scope-001",
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "transaction_request",
      "x-hrcore-mvp-a-field-scopes": "work_email_contact",
    },
  });

  assert.equal(forbiddenFieldResponse.statusCode, 403);
  assert.deepEqual(forbiddenFieldResponse.json(), {
    error:
      "MVP-A onboarding evidence access rejects forbidden work_email_contact field scope",
  });
  assert.equal(traceLookupCount, 0);

  const mismatchedSurfaceFieldResponse = await app.inject({
    method: "GET",
    url: "/audit/mvp-a/onboarding-correlations/correlation-before-scope-001",
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "transaction_request,audit_event",
      "x-hrcore-mvp-a-field-scopes": "request_metadata",
    },
  });

  assert.equal(mismatchedSurfaceFieldResponse.statusCode, 403);
  assert.deepEqual(mismatchedSurfaceFieldResponse.json(), {
    error:
      "MVP-A onboarding evidence access requires field scope for audit_event evidence surface",
  });
  assert.equal(traceLookupCount, 0);
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId resolves root-linked operation correlation ids", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-audit-lookup-root-002";
  const approvalCorrelationId =
    "correlation-onboarding-audit-lookup-approval-002";
  const applyCorrelationId = "correlation-onboarding-audit-lookup-apply-002";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: approvalCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(
    onboardingDb,
    {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: applyCorrelationId,
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    },
  );
  recordSyntheticOnboardingApplyJobAttempt(onboardingDb, applyCorrelationId);
  onboardingDb
    .prepare(
      `
        INSERT INTO writeback_provider_refresh (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          provider_value,
          refreshed_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    )
    .run(
      "synthetic-work-email-provider-refresh-audit-lookup-002",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:00:00Z",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T03%3A00%3A00Z",
    );

  for (const lookupCorrelationId of [
    rootCorrelationId,
    approvalCorrelationId,
    applyCorrelationId,
  ]) {
    const response = await app.inject({
      method: "GET",
      url: `/audit/mvp-a/onboarding-correlations/${lookupCorrelationId}`,
      headers: mvpAOnboardingAuditHeaders,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().correlationId, lookupCorrelationId);
    assert.equal(
      response.json().trace.transactionRequest.correlationId,
      rootCorrelationId,
    );
    assert.equal(
      response.json().trace.providerRefreshId,
      "synthetic-work-email-provider-refresh-audit-lookup-002",
    );
  }
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId summarizes conflict-only writebacks", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const rootCorrelationId = "correlation-onboarding-audit-lookup-conflict-001";
  saveOnboardingTransactionRequest(
    onboardingDb,
    createOnboardingTransactionRequestFixture({
      correlationId: rootCorrelationId,
    }),
  );
  onboardingDb.exec(`
    INSERT INTO contact_point (
      id,
      person_id,
      contact_type,
      value,
      is_primary,
      created_at
    )
    VALUES (
      'contact-point-onboarding-001',
      'person-onboarding-001',
      'work_email',
      'manual.override@example.invalid',
      1,
      '2026-05-21T00:30:00Z'
    );
  `);
  decideOnboardingTransactionRequest(onboardingDb, {
    transactionRequestId: "transaction-request-onboarding-001",
    decision: "approve",
    decidedAt: "2026-05-21T01:00:00Z",
    decidedBy: "operator-people-ops-001",
    correlationId: rootCorrelationId,
  });
  await applyApprovedOnboardingTransactionRequestWithOktaProjection(
    onboardingDb,
    {
      transactionRequestId: "transaction-request-onboarding-001",
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: rootCorrelationId,
      oktaAdapter: buildOktaMasteringAdapter({ mode: "mock" }),
    },
  );
  recordSyntheticOnboardingApplyJobAttempt(onboardingDb, rootCorrelationId);

  const defaultResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: mvpAOnboardingAuditHeaders,
  });

  assert.equal(defaultResponse.statusCode, 409);
  assert.deepEqual(defaultResponse.json(), {
    error:
      "MVP-A onboarding trace requires provider refresh or provider refresh conflict evidence linked to the writeback event",
  });
  assert.doesNotMatch(
    defaultResponse.body,
    /workEmailWritebackEventId|workEmailConflictId|providerRefreshConflictId|inbound_value_conflict/u,
  );

  const response = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "work_email_evidence",
      "x-hrcore-mvp-a-field-scopes": "work_email_contact",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(
    response.json().trace.workEmailConflictId,
    "synthetic-work-email-conflict:okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z:inbound_value_conflict",
  );
  assert.doesNotMatch(
    response.body,
    /providerRefreshId|providerRefreshConflictId/u,
  );

  const providerOnlyResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "okta_projection",
      "x-hrcore-mvp-a-field-scopes": "provider_projection",
    },
  });

  assert.equal(providerOnlyResponse.statusCode, 409);
  assert.deepEqual(providerOnlyResponse.json(), {
    error:
      "MVP-A onboarding trace requires provider refresh or provider refresh conflict evidence linked to the writeback event",
  });
  assert.doesNotMatch(
    providerOnlyResponse.body,
    /workEmailWritebackEventId|workEmailConflictId|providerRefreshConflictId|inbound_value_conflict/u,
  );

  onboardingDb
    .prepare(
      `
        INSERT INTO writeback_work_email_conflict (
          id,
          writeback_event_id,
          person_id,
          contact_point_id,
          provider_name,
          provider_subject_id,
          conflict_type,
          current_contact_value,
          attempted_provider_value,
          detected_at,
          correlation_id,
          poc_marker
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synthetic_poc')
      `,
    )
    .run(
      "correlated-provider-refresh-conflict-app-001",
      "okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z",
      "person-onboarding-001",
      "contact-point-onboarding-001",
      "synthetic_okta",
      "synthetic-okta-user-person-onboarding-001",
      "provider_refresh_conflict",
      "manual.override@example.invalid",
      "onboarding.hire.001@example.invalid",
      "2026-05-21T03:15:00Z",
      "okta:mock:work_email_writeback:create:EMP-ONBOARDING-001:2026-05-21T02%3A00%3A00Z:provider_refresh:2026-05-21T03%3A15%3A00Z:conflict:provider_refresh_conflict",
    );

  const workEmailOnlyWithProviderConflictResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "work_email_evidence",
      "x-hrcore-mvp-a-field-scopes": "work_email_contact",
    },
  });

  assert.equal(workEmailOnlyWithProviderConflictResponse.statusCode, 200);
  assert.equal(
    workEmailOnlyWithProviderConflictResponse.json().trace.workEmailConflictId,
    "synthetic-work-email-conflict:okta-work-email-writeback-create-EMP-ONBOARDING-001-2026-05-21T02%3A00%3A00Z:inbound_value_conflict",
  );
  assert.doesNotMatch(
    workEmailOnlyWithProviderConflictResponse.body,
    /providerRefreshId|providerRefreshConflictId|correlated-provider-refresh-conflict-app-001/u,
  );

  const providerConflictResponse = await app.inject({
    method: "GET",
    url: `/audit/mvp-a/onboarding-correlations/${rootCorrelationId}`,
    headers: {
      ...mvpAOnboardingAuditHeaders,
      "x-hrcore-mvp-a-evidence-surfaces": "okta_projection",
      "x-hrcore-mvp-a-field-scopes": "provider_projection",
    },
  });

  assert.equal(providerConflictResponse.statusCode, 200);
  assert.deepEqual(providerConflictResponse.json().trace, {
    providerRefreshId: null,
    providerRefreshConflictId: "correlated-provider-refresh-conflict-app-001",
  });
  assert.doesNotMatch(
    providerConflictResponse.body,
    /workEmailWritebackEventId|workEmailConflictId|inbound_value_conflict/u,
  );
});

test("GET /audit/mvp-a/onboarding-correlations/:correlationId does not map database errors to audit conflicts", async (t) => {
  const app = await buildApp({
    auditTraceDb: {
      prepare() {
        throw new Error("SQLITE_ERROR: no such table: transaction_request");
      },
    },
  });
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/audit/mvp-a/onboarding-correlations/correlation-db-failure-001",
    headers: mvpAOnboardingAuditHeaders,
  });

  assert.equal(response.statusCode, 500);
});

test("GET /onboarding/new-hire renders the MVP-A onboarding wizard surface", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/onboarding/new-hire",
  });

  assert.equal(response.statusCode, 200);
  assert.match(
    response.headers["content-type"] ?? "",
    /^text\/html; charset=utf-8/u,
  );
  assert.match(response.body, /id="mvp-a-onboarding-wizard"/u);
  assert.match(response.body, /name="person.displayName"/u);
  assert.match(response.body, /name="payload.tenantEnvironmentId"/u);
  assert.match(
    response.body,
    /tenantEnvironmentId: read\("payload\.tenantEnvironmentId"\)/u,
  );
  assert.match(response.body, /name="payload.effectiveDate"/u);
  assert.match(response.body, /name="payload.workEmailExpectation.value"/u);
  assert.doesNotMatch(response.body, /myNumber|transfer|termination|CSV/u);
});

test("POST /onboarding/new-hire/transaction-requests validates MVP-A request payloads through the shared contract", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const fixture = createOnboardingTransactionRequestFixture();
  const response = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/validate",
    payload: {
      ...fixture,
      payload: {
        ...fixture.payload,
        assignment: {
          ...fixture.payload.assignment,
          managerReference: "",
        },
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "payload.assignment.managerReference must be a non-empty string",
    validationErrors: [
      {
        message:
          "payload.assignment.managerReference must be a non-empty string",
      },
    ],
  });
});

test("POST /onboarding/new-hire/transaction-requests returns save-path validation details", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const fixture = createOnboardingTransactionRequestFixture();
  const response = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: {
      ...fixture,
      payload: {
        ...fixture.payload,
        effectiveDate: "2026-06-02",
      },
    },
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: "payload.employment.startDate must match payload.effectiveDate",
    validationErrors: [
      {
        message:
          "payload.employment.startDate must match payload.effectiveDate",
      },
    ],
  });
});

test("POST /onboarding/new-hire/transaction-requests reports unavailable and conflict states with error bodies", async (t) => {
  const unavailableApp = await buildApp();
  t.after(async () => {
    await unavailableApp.close();
  });

  const unavailableResponse = await unavailableApp.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture(),
  });

  assert.equal(unavailableResponse.statusCode, 503);
  assert.deepEqual(unavailableResponse.json(), {
    error: "onboarding transaction request database is not configured",
  });

  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const firstResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture({
      statusCode: "draft",
    }),
  });
  assert.equal(firstResponse.statusCode, 201);

  const conflictResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture({
      id: "transaction-request-onboarding-conflict",
      correlationId: "correlation-onboarding-conflict",
      statusCode: "draft",
    }),
  });

  assert.equal(conflictResponse.statusCode, 409);
  assert.deepEqual(conflictResponse.json(), {
    error:
      "onboarding transaction request conflicts with existing local synthetic state",
  });
});

test("POST /onboarding/new-hire/transaction-requests saves draft edits and submit through the shared contract", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const draft = createOnboardingTransactionRequestFixture({
    statusCode: "draft",
  });
  const createResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: draft,
  });

  assert.equal(createResponse.statusCode, 201);
  assert.deepEqual(createResponse.json(), {
    personId: "person-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    statusCode: "draft",
    correlationId: "correlation-onboarding-001",
  });

  const draftRetryResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: draft,
  });

  assert.equal(draftRetryResponse.statusCode, 200);
  assert.deepEqual(draftRetryResponse.json(), createResponse.json());

  const editedDraft = createOnboardingTransactionRequestFixture({
    statusCode: "draft",
    person: {
      displayName: "MVP-A Onboarding Edited Hire",
    },
    payload: {
      assignment: {
        ...draft.payload.assignment,
        managerReference: "manager-edited-001",
      },
    },
  });
  const editResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: editedDraft,
  });

  assert.equal(editResponse.statusCode, 200);

  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: {
      ...editedDraft,
      statusCode: "submitted",
    },
  });

  assert.equal(submitResponse.statusCode, 201);
  assert.deepEqual(submitResponse.json(), {
    personId: "person-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    statusCode: "submitted",
    correlationId: "correlation-onboarding-001",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
          SELECT
            person.display_name,
            transaction_request.status_code,
            transaction_request.payload_json
          FROM transaction_request
          JOIN person ON person.id = transaction_request.person_id
          WHERE transaction_request.id = ?
        `,
        )
        .get("transaction-request-onboarding-001"),
    ),
    {
      display_name: "MVP-A Onboarding Edited Hire",
      status_code: "submitted",
      payload_json: JSON.stringify({
        tenantEnvironmentId: "repo_owned_synthetic_mvp_a_onboarding",
        effectiveDate: "2026-06-01",
        employment: {
          id: "employment-onboarding-001",
          employmentCode: "EMP-ONBOARDING-001",
          startDate: "2026-06-01",
        },
        assignment: {
          id: "assignment-onboarding-001",
          assignmentCode: "ASN-ONBOARDING-001",
          departmentReference: "department-people-ops",
          legalEntityReference: "legal-entity-jp-001",
          managerReference: "manager-edited-001",
          positionCode: "position-engineer-001",
        },
        workEmailExpectation: {
          contactPointId: "contact-point-onboarding-001",
          value: "onboarding.hire.001@example.invalid",
        },
      }),
    },
  );
});

test("POST /onboarding/new-hire/transaction-requests/:id/decisions applies approval decisions", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture(),
  });
  assert.equal(submitResponse.statusCode, 201);

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    },
  });

  assert.equal(decisionResponse.statusCode, 200);
  assert.deepEqual(decisionResponse.json(), {
    personId: "person-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    statusCode: "approved",
    decision: "approve",
    auditEventId:
      "audit-event-transaction-request-onboarding-001-approve-correlation-onboarding-approval-001",
    correlationId: "correlation-onboarding-approval-001",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT transaction_request.status_code, audit_event.action
            FROM transaction_request
            JOIN audit_event ON audit_event.subject_id = transaction_request.id
            WHERE transaction_request.id = ?
          `,
        )
        .get("transaction-request-onboarding-001"),
    ),
    {
      status_code: "approved",
      action: "mvp_a.onboarding.approve",
    },
  );
});

test("POST /onboarding/new-hire/transaction-requests/:id/apply commits approved onboarding", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture(),
  });
  assert.equal(submitResponse.statusCode, 201);

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    },
  });
  assert.equal(decisionResponse.statusCode, 200);

  const applyResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/apply",
    payload: {
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
    },
  });

  assert.equal(applyResponse.statusCode, 200);
  assert.deepEqual(applyResponse.json(), {
    personId: "person-onboarding-001",
    employmentId: "employment-onboarding-001",
    assignmentId: "assignment-onboarding-001",
    transactionRequestId: "transaction-request-onboarding-001",
    lifecycleEventId:
      "lifecycle-event-transaction-request-onboarding-001-apply",
    statusCode: "completed",
    correlationId: "correlation-onboarding-apply-001",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT
              transaction_request.status_code,
              employment.id AS employment_id,
              assignment.id AS assignment_id,
              lifecycle_event.id AS lifecycle_event_id,
              audit_event.action
            FROM transaction_request
            JOIN employment ON employment.person_id = transaction_request.person_id
            JOIN assignment ON assignment.employment_id = employment.id
            JOIN lifecycle_event ON lifecycle_event.transaction_request_id = transaction_request.id
            JOIN audit_event ON audit_event.subject_id = lifecycle_event.id
            WHERE transaction_request.id = ?
          `,
        )
        .get("transaction-request-onboarding-001"),
    ),
    {
      status_code: "completed",
      employment_id: "employment-onboarding-001",
      assignment_id: "assignment-onboarding-001",
      lifecycle_event_id:
        "lifecycle-event-transaction-request-onboarding-001-apply",
      action: "mvp_a.onboarding.apply",
    },
  );
});

test("POST /onboarding/new-hire/transaction-requests/:id/apply treats corrupted persisted payload as server-side state", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const submitResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests",
    payload: createOnboardingTransactionRequestFixture(),
  });
  assert.equal(submitResponse.statusCode, 201);

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    },
  });
  assert.equal(decisionResponse.statusCode, 200);

  onboardingDb
    .prepare(
      `
        UPDATE transaction_request
        SET payload_json = '{'
        WHERE id = 'transaction-request-onboarding-001'
      `,
    )
    .run();

  const applyResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-onboarding-001/apply",
    payload: {
      appliedAt: "2026-05-21T02:00:00Z",
      appliedBy: "operator-people-ops-apply-001",
      correlationId: "correlation-onboarding-apply-001",
    },
  });

  assert.equal(applyResponse.statusCode, 500);
});

test("POST /onboarding/new-hire/transaction-requests/:id/decisions returns not found for missing targets", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-missing/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    },
  });

  assert.equal(decisionResponse.statusCode, 404);
  assert.deepEqual(decisionResponse.json(), {
    error: "onboarding transaction request decision target not found",
  });
});

test("POST /onboarding/new-hire/transaction-requests/:id/decisions rejects non-hire targets without mutation", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  onboardingDb
    .prepare(
      `
        INSERT INTO person (id, display_name, created_at)
        VALUES ('person-change-request-001', 'Change Request One', '2026-05-21T00:00:00Z')
      `,
    )
    .run();
  onboardingDb
    .prepare(
      `
        INSERT INTO transaction_request (
          id,
          person_id,
          request_type,
          status_code,
          requested_at,
          correlation_id,
          payload_version,
          payload_json
        )
        VALUES (
          'transaction-request-change-001',
          'person-change-request-001',
          'change',
          'submitted',
          '2026-05-21T00:00:00Z',
          'correlation-change-request-001',
          NULL,
          NULL
        )
      `,
    )
    .run();

  const decisionResponse = await app.inject({
    method: "POST",
    url: "/onboarding/new-hire/transaction-requests/transaction-request-change-001/decisions",
    payload: {
      decision: "approve",
      decidedAt: "2026-05-21T01:00:00Z",
      decidedBy: "operator-people-ops-001",
      correlationId: "correlation-onboarding-approval-001",
    },
  });

  assert.equal(decisionResponse.statusCode, 404);
  assert.deepEqual(decisionResponse.json(), {
    error: "onboarding transaction request decision target not found",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT request_type, status_code
            FROM transaction_request
            WHERE id = 'transaction-request-change-001'
          `,
        )
        .get() as Record<string, unknown> | undefined,
    ),
    { request_type: "change", status_code: "submitted" },
  );
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare("SELECT count(*) AS count FROM audit_event")
        .get() as Record<string, unknown> | undefined,
    ),
    { count: 0 },
  );
});

test("GET /transfers/assignment-change renders the bounded MVP-B transfer wizard surface", async (t) => {
  const app = await buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/transfers/assignment-change",
  });

  assert.equal(response.statusCode, 200);
  assert.match(
    response.headers["content-type"] ?? "",
    /^text\/html; charset=utf-8/u,
  );
  assert.match(response.body, /id="mvp-b-transfer-wizard"/u);
  assert.match(response.body, /name="person.displayName"/u);
  assert.match(response.body, /name="payload.tenantEnvironmentId"/u);
  assert.match(
    response.body,
    /tenantEnvironmentId: read\("payload\.tenantEnvironmentId"\)/u,
  );
  assert.match(response.body, /name="payload.effectiveDate"/u);
  assert.match(response.body, /name="payload.currentAssignment.assignmentId"/u);
  assert.match(
    response.body,
    /name="payload.targetAssignment.departmentReference"/u,
  );
  assert.match(response.body, /name="payload.transferReason.reasonCode"/u);
  assert.doesNotMatch(
    response.body,
    /rawPayload|csvExport|CSV|liveProvider|employeeSearch|upload/u,
  );
});

test("POST /transfers/assignment-change/transaction-requests validates and submits bounded transfer requests", async (t) => {
  const onboardingDb = await openLocalSyntheticWritebackDatabase(":memory:");
  const app = await buildApp({ onboardingDb });
  t.after(async () => {
    await app.close();
    onboardingDb.close();
  });

  const fixture = createTransferTransactionRequestFixture();
  const invalidResponse = await app.inject({
    method: "POST",
    url: "/transfers/assignment-change/transaction-requests/validate",
    payload: {
      ...fixture,
      payload: {
        ...fixture.payload,
        effectiveDate: "2026-02-30",
      },
    },
  });

  assert.equal(invalidResponse.statusCode, 400);
  assert.deepEqual(invalidResponse.json(), {
    error: "payload.effectiveDate must be an ISO date",
    validationErrors: [
      {
        message: "payload.effectiveDate must be an ISO date",
      },
    ],
  });

  const submitResponse = await app.inject({
    method: "POST",
    url: "/transfers/assignment-change/transaction-requests",
    payload: fixture,
  });

  assert.equal(submitResponse.statusCode, 201);
  assert.deepEqual(submitResponse.json(), {
    personId: "person-transfer-001",
    transactionRequestId: "transaction-request-transfer-001",
    statusCode: "submitted",
    correlationId: "correlation-transfer-001",
  });
  assert.deepEqual(
    normalizeRow(
      onboardingDb
        .prepare(
          `
            SELECT
              transaction_request.request_type,
              transaction_request.status_code,
              transaction_request.payload_version,
              transaction_request.payload_json
            FROM transaction_request
            WHERE transaction_request.id = ?
          `,
        )
        .get("transaction-request-transfer-001"),
    ),
    {
      request_type: "transfer",
      status_code: "submitted",
      payload_version: "mvp_b_transfer_v1",
      payload_json: JSON.stringify(fixture.payload),
    },
  );
});

test("OpenAPI contract loading is independent from process cwd", async () => {
  const originalCwd = process.cwd();
  process.chdir("..");
  try {
    const contract = await loadOpenApiContract();
    assert.equal((contract as { openapi?: unknown }).openapi, "3.1.0");
  } finally {
    process.chdir(originalCwd);
  }
});

test("resolvePort accepts only explicit integer port values", () => {
  assert.equal(resolvePort(undefined), 3000);
  assert.equal(resolvePort("0"), 0);
  assert.equal(resolvePort("3000"), 3000);

  for (const invalidPort of ["", "3000abc", "abc3000", "-1", "65536"]) {
    assert.throws(
      () => resolvePort(invalidPort),
      /PORT must be an integer between 0 and 65535/,
    );
  }
});

test("buildServerApp wires the local writeback database into the actual server app", async (t) => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const tempDirectory = await mkdtemp(join(tmpdir(), "hrcore-server-db-"));
  process.env.DATABASE_URL = `file:${join(tempDirectory, "hrcore.sqlite")}`;

  t.after(async () => {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    await rm(tempDirectory, { recursive: true, force: true });
  });

  const app = await buildServerApp();
  t.after(async () => {
    await app.close();
  });

  const db = await import("node:sqlite");
  const sqlite = new db.DatabaseSync(join(tempDirectory, "hrcore.sqlite"));
  t.after(() => {
    sqlite.close();
  });

  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    INSERT INTO person (id, display_name, created_at)
    VALUES ('person-writeback-001', 'Synthetic Writeback Person', '2026-05-18T00:00:00Z');
  `);

  const response = await app.inject({
    method: "POST",
    url: "/writeback-events/work-email",
    payload: createSyntheticWorkEmailWritebackFixture(),
  });

  assert.equal(response.statusCode, 201);
  assert.equal(
    sqlite
      .prepare(
        `
          SELECT provider_value
          FROM writeback_event
          WHERE id = 'writeback-event-work-email-001'
        `,
      )
      .get()?.provider_value,
    "confirmed.writeback@example.invalid",
  );
});
