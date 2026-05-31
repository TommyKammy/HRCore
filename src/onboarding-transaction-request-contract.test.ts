import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOktaMasteringAdapter,
  type OktaMasteringProjection,
  type OktaMasteringProjectionResult,
} from "./okta-mastering-adapter.js";
import { ingestSyntheticWorkEmailWriteback } from "./writeback-ingest.js";

import {
  applyApprovedOnboardingTransactionRequest,
  applyApprovedOnboardingTransactionRequestWithOktaProjection,
  applyDueOnboardingTransactionRequests,
  createOnboardingTransactionRequestFixture,
  decideOnboardingTransactionRequest,
  OnboardingTransactionRequestValidationError,
  parseOnboardingTransactionRequestInput,
  saveEditableOnboardingTransactionRequest,
  saveOnboardingTransactionRequest,
  type OnboardingTransactionRequestDatabase,
} from "./onboarding-transaction-request.js";
import {
  createOnboardingTransactionRequestFixture as createOnboardingTransactionRequestFixtureFromContract,
  parseOnboardingTransactionRequestInput as parseOnboardingTransactionRequestInputFromContract,
} from "./onboarding-transaction-request-contract.js";
import { saveOnboardingTransactionRequest as saveOnboardingTransactionRequestFromPersistence } from "./onboarding-transaction-request-persistence.js";
import { decideOnboardingTransactionRequest as decideOnboardingTransactionRequestFromApproval } from "./onboarding-transaction-request-approval.js";
import { applyApprovedOnboardingTransactionRequest as applyApprovedOnboardingTransactionRequestFromApply } from "./onboarding-transaction-request-apply.js";
import { applyDueOnboardingTransactionRequests as applyDueOnboardingTransactionRequestsFromWorker } from "./onboarding-transaction-request-worker.js";
import {
  normalizeRow,
  normalizeRows,
  openSchemaBackedDatabase,
  readRepoFile,
} from "./test-helpers/database.js";
import { workerAttemptCorrelationId } from "./test-helpers/onboarding.js";

test("MVP-A onboarding transaction request input is parsed into a typed fail-closed contract", () => {
  const parsed = parseOnboardingTransactionRequestInput(
    createOnboardingTransactionRequestFixture(),
  );

  assert.equal(parsed.requestType, "hire");
  assert.equal(parsed.statusCode, "submitted");
  assert.equal(parsed.person.id, "person-onboarding-001");
  assert.equal(parsed.payload.effectiveDate, "2026-06-01");
  assert.equal(
    parsed.payload.workEmailExpectation.value,
    "onboarding.hire.001@example.invalid",
  );
});

test("MVP-A onboarding Okta writeback integration stays outside the core transaction module", async () => {
  const [coreModule, integrationModule, applyFacade] = await Promise.all([
    readRepoFile("src/onboarding-transaction-request-internal.ts"),
    readRepoFile("src/onboarding-okta-writeback-integration.ts"),
    readRepoFile("src/onboarding-transaction-request-apply.ts"),
  ]);

  assert.match(
    integrationModule,
    /export async function applyApprovedOnboardingTransactionRequestWithOktaProjection/u,
  );
  assert.match(
    applyFacade,
    /from "\.\/onboarding-okta-writeback-integration\.js"/u,
  );
  assert.doesNotMatch(
    coreModule,
    /OktaMasteringAdapter|ingestSyntheticWorkEmailWriteback|refreshSyntheticWorkEmailFromProvider|applyApprovedOnboardingTransactionRequestWithOktaProjection/u,
  );
});

test("MVP-A onboarding transaction request modules keep contract parsing, reads, and ids focused", async () => {
  const [
    internalModule,
    persistenceModule,
    approvalModule,
    applyModule,
    workerModule,
    parserModule,
    validationModule,
    readerModule,
    idModule,
  ] = await Promise.all([
    readRepoFile("src/onboarding-transaction-request-internal.ts"),
    readRepoFile("src/onboarding-transaction-request-persistence.ts"),
    readRepoFile("src/onboarding-transaction-request-approval.ts"),
    readRepoFile("src/onboarding-transaction-request-apply.ts"),
    readRepoFile("src/onboarding-transaction-request-worker.ts"),
    readRepoFile("src/onboarding-transaction-request-parser.ts"),
    readRepoFile("src/onboarding-transaction-request-validation.ts"),
    readRepoFile("src/onboarding-transaction-request-readers.ts"),
    readRepoFile("src/onboarding-transaction-request-ids.ts"),
  ]);

  assert.match(
    internalModule,
    /from "\.\/onboarding-transaction-request-parser\.js"/u,
  );
  assert.match(
    persistenceModule,
    /from "\.\/onboarding-transaction-request-parser\.js"/u,
  );
  assert.match(
    approvalModule,
    /from "\.\/onboarding-transaction-request-readers\.js"/u,
  );
  assert.match(
    applyModule,
    /from "\.\/onboarding-transaction-request-readers\.js"/u,
  );
  assert.match(
    workerModule,
    /from "\.\/onboarding-transaction-request-ids\.js"/u,
  );
  assert.match(
    parserModule,
    /export function parseOnboardingTransactionRequestInput/u,
  );
  assert.match(validationModule, /export function assertSupportedFields/u);
  assert.match(
    readerModule,
    /export function readOnboardingTransactionRequest/u,
  );
  assert.match(
    idModule,
    /export function buildOnboardingApplyLifecycleEventId/u,
  );
  assert.doesNotMatch(internalModule, /^function |^export function /mu);
});

test("MVP-A onboarding transaction request focused boundary modules preserve lifecycle behavior", async (t) => {
  const db = await openSchemaBackedDatabase(t);
  if (!db) {
    return;
  }

  const directApplyFixture =
    createOnboardingTransactionRequestFixtureFromContract({
      id: "transaction-request-focused-direct",
      person: {
        id: "person-focused-direct",
      },
      correlationId: "correlation-focused-direct-submit",
      payload: {
        employment: {
          id: "employment-focused-direct",
          employmentCode: "EMP-FOCUSED-DIRECT",
          startDate: "2026-06-01",
        },
        assignment: {
          id: "assignment-focused-direct",
          assignmentCode: "ASN-FOCUSED-DIRECT",
          departmentReference: "department-focused-direct",
          legalEntityReference: "legal-entity-focused-direct",
          managerReference: "manager-focused-direct",
          positionCode: "position-focused-direct",
        },
        workEmailExpectation: {
          contactPointId: "contact-point-focused-direct",
          value: "focused.direct@example.invalid",
        },
      },
    });
  parseOnboardingTransactionRequestInputFromContract(directApplyFixture);
  saveOnboardingTransactionRequestFromPersistence(db, directApplyFixture);
  decideOnboardingTransactionRequestFromApproval(db, {
    transactionRequestId: directApplyFixture.id,
    decision: "approve",
    decidedAt: "2026-05-22T00:00:00Z",
    decidedBy: "approver-focused-direct",
    correlationId: "correlation-focused-direct-approval",
  });

  assert.deepEqual(
    applyApprovedOnboardingTransactionRequestFromApply(db, {
      transactionRequestId: directApplyFixture.id,
      appliedAt: "2026-06-01T00:00:00Z",
      appliedBy: "worker-focused-direct",
      correlationId: "correlation-focused-direct-apply",
    }),
    {
      personId: "person-focused-direct",
      employmentId: "employment-focused-direct",
      assignmentId: "assignment-focused-direct",
      transactionRequestId: "transaction-request-focused-direct",
      lifecycleEventId:
        "lifecycle-event-transaction-request-focused-direct-apply",
      statusCode: "completed",
      correlationId: "correlation-focused-direct-apply",
    },
  );

  const workerFixture = createOnboardingTransactionRequestFixtureFromContract({
    id: "transaction-request-focused-worker",
    person: {
      id: "person-focused-worker",
    },
    correlationId: "correlation-focused-worker-submit",
    payload: {
      employment: {
        id: "employment-focused-worker",
        employmentCode: "EMP-FOCUSED-WORKER",
        startDate: "2026-06-01",
      },
      assignment: {
        id: "assignment-focused-worker",
        assignmentCode: "ASN-FOCUSED-WORKER",
        departmentReference: "department-focused-worker",
        legalEntityReference: "legal-entity-focused-worker",
        managerReference: "manager-focused-worker",
        positionCode: "position-focused-worker",
      },
      workEmailExpectation: {
        contactPointId: "contact-point-focused-worker",
        value: "focused.worker@example.invalid",
      },
    },
  });
  saveOnboardingTransactionRequestFromPersistence(db, workerFixture);
  decideOnboardingTransactionRequestFromApproval(db, {
    transactionRequestId: workerFixture.id,
    decision: "approve",
    decidedAt: "2026-05-22T00:00:00Z",
    decidedBy: "approver-focused-worker",
    correlationId: "correlation-focused-worker-approval",
  });

  assert.deepEqual(
    applyDueOnboardingTransactionRequestsFromWorker(db, {
      now: "2026-06-01T00:00:00Z",
      workerId: "worker-focused-boundary",
      correlationId: "correlation-focused-worker-run",
    }),
    {
      attempted: 1,
      applied: 1,
      failed: 0,
      skipped: 0,
      correlationId: "correlation-focused-worker-run",
      results: [
        {
          transactionRequestId: "transaction-request-focused-worker",
          status: "applied",
          lifecycleEventId:
            "lifecycle-event-transaction-request-focused-worker-apply",
        },
      ],
    },
  );
});

test("MVP-A onboarding transaction request focused boundary modules own runtime implementations", async () => {
  const [persistenceModule, approvalModule, applyModule, workerModule] =
    await Promise.all([
      readRepoFile("src/onboarding-transaction-request-persistence.ts"),
      readRepoFile("src/onboarding-transaction-request-approval.ts"),
      readRepoFile("src/onboarding-transaction-request-apply.ts"),
      readRepoFile("src/onboarding-transaction-request-worker.ts"),
    ]);

  assert.match(
    persistenceModule,
    /export function saveOnboardingTransactionRequest/u,
  );
  assert.match(
    persistenceModule,
    /export function saveEditableOnboardingTransactionRequest/u,
  );
  assert.match(
    approvalModule,
    /export function decideOnboardingTransactionRequest/u,
  );
  assert.match(
    applyModule,
    /export function applyApprovedOnboardingTransactionRequest/u,
  );
  assert.match(
    workerModule,
    /export function applyDueOnboardingTransactionRequests/u,
  );

  for (const focusedModule of [
    persistenceModule,
    approvalModule,
    applyModule,
    workerModule,
  ]) {
    assert.doesNotMatch(
      focusedModule,
      /from "\.\/onboarding-transaction-request-internal\.js"/u,
    );
  }
});

test("MVP-A onboarding transaction request validation returns deterministic required-field errors", () => {
  const fixture = createOnboardingTransactionRequestFixture();

  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput({
        ...fixture,
        payload: {
          ...fixture.payload,
          assignment: {
            ...fixture.payload.assignment,
            managerReference: "",
          },
        },
      }),
    (error) =>
      error instanceof OnboardingTransactionRequestValidationError &&
      error instanceof Error &&
      error.message ===
        "payload.assignment.managerReference must be a non-empty string",
  );
});

test("MVP-A onboarding transaction request validation reports assignment reference paths", () => {
  const fixture = createOnboardingTransactionRequestFixture();

  for (const fieldName of [
    "departmentReference",
    "legalEntityReference",
    "managerReference",
  ] as const) {
    assert.throws(
      () =>
        parseOnboardingTransactionRequestInput({
          ...fixture,
          payload: {
            ...fixture.payload,
            assignment: {
              ...fixture.payload.assignment,
              [fieldName]: "",
            },
          },
        }),
      (error) =>
        error instanceof OnboardingTransactionRequestValidationError &&
        error instanceof Error &&
        error.message ===
          `payload.assignment.${fieldName} must be a non-empty string`,
    );
  }
});

test("MVP-A onboarding transaction request validation rejects invalid effective dates", () => {
  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput(
        createOnboardingTransactionRequestFixture({
          payload: {
            effectiveDate: "2026-02-30",
          },
        }),
      ),
    (error) =>
      error instanceof OnboardingTransactionRequestValidationError &&
      error instanceof Error &&
      error.message === "payload.effectiveDate must be an ISO date",
  );
});

test("MVP-A onboarding transaction request validation rejects unsupported and regulated fields", () => {
  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput({
        ...createOnboardingTransactionRequestFixture(),
        myNumber: "123456789012",
      }),
    /request contains unsupported fields: myNumber/,
  );

  assert.throws(
    () =>
      parseOnboardingTransactionRequestInput(
        createOnboardingTransactionRequestFixture({
          payload: {
            providerPayload: {
              id: "live-provider-payload",
            },
          } as Record<string, unknown>,
        }),
      ),
    /payload contains unsupported fields: providerPayload/,
  );
});
