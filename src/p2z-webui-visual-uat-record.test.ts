import assert from "node:assert/strict";
import test from "node:test";

import {
  p2zVisualUatChecklistItems,
  p2zVisualUatScenarioIds,
  type P2zVisualUatOverallVerdict,
  validateP2zVisualUatRecord,
} from "./test-helpers/p2z-webui-visual-uat-record.js";

const testedCommit = "a".repeat(40);

type ExecutionFixture = {
  id: string;
  tester: string;
  date: string;
  viewport: string;
  persona: string;
  expected: string;
  actual: string;
  evidence: string;
  verdict: string;
};

type FindingFixture = {
  id: string;
  status: string;
  issue: string;
  owner: string;
  scope: string;
  actor: string;
  tenantEnvironment: string;
  subjectBinding: string;
  routeViewport: string;
  correlationId: string;
  evidenceVersion: string;
  evidence: string;
  cleanupStatus: string;
  disposition: string;
};

type UatFixture = {
  overall: P2zVisualUatOverallVerdict;
  commit: string;
  namedTester: string;
  verdictRecorder: string;
  boundaryVerdict: string;
  closeEligibility: string;
  automatedCandidate: string;
  productionReadiness: string;
  goLiveApproval: string;
  executions: ExecutionFixture[];
  findings: FindingFixture[];
  checklist: Array<{ label: string; status: string; disposition: string }>;
};

function completedExecution(
  id: string,
  verdict = "Accepted",
): ExecutionFixture {
  const personaByScenario: Record<string, string> = {
    "P2Z-UAT-01": "HR operator",
    "P2Z-UAT-02": "HR operator",
    "P2Z-UAT-03": "HR operator",
    "P2Z-UAT-04": "HR operator then Approver",
    "P2Z-UAT-05": "HR Ops/support",
    "P2Z-UAT-06": "HR Ops/support",
    "P2Z-UAT-07": "HR operator",
    "P2Z-UAT-08": "No persona",
  };
  const expectedResultByScenario: Record<string, string> = {
    "P2Z-UAT-01": "Dashboard structure is understandable",
    "P2Z-UAT-02":
      "Masked profile, lifecycle timeline, and external IDs are visible",
    "P2Z-UAT-03":
      "Step 3/5, input, impact preview, validation, and request detail are visible",
    "P2Z-UAT-04": "Approval evidence and actions are clear",
    "P2Z-UAT-05": "Job and DLQ evidence is understandable",
    "P2Z-UAT-06":
      "One exact correlation lookup and evidence timeline are visible",
    "P2Z-UAT-07": "Drawer and primary actions remain usable",
    "P2Z-UAT-08": "Workflow content remains fail-closed",
  };
  return {
    id,
    tester: "Named Tester",
    date: "2026-08-03",
    viewport: id === "P2Z-UAT-07" ? "390x844" : "1440x900",
    persona: personaByScenario[id] ?? "",
    expected: expectedResultByScenario[id] ?? "",
    actual:
      id === "P2Z-UAT-06"
        ? "Approval pending is displayed as observed"
        : `Observed result for ${id}`,
    evidence: `[run](https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000000${id.slice(-2)})`,
    verdict,
  };
}

function pendingExecution(id: string): ExecutionFixture {
  return {
    id,
    tester: "Pending assignment",
    date: "Pending",
    viewport: id === "P2Z-UAT-07" ? "390x844" : "1440x900",
    persona: id === "P2Z-UAT-07" ? "Pending actual persona" : "HR operator",
    expected: `Expected result for ${id}`,
    actual: "Pending human execution",
    evidence: "Run-specific capture pending",
    verdict: "Pending",
  };
}

function cleanFinding(id: string): FindingFixture {
  return {
    id,
    status: "none observed",
    issue: "not applicable",
    owner: "not applicable",
    scope: "not applicable",
    actor: "not applicable",
    tenantEnvironment: "not applicable",
    subjectBinding: "not applicable",
    routeViewport: "not applicable",
    correlationId: "not applicable",
    evidenceVersion: "not applicable",
    evidence: "not applicable",
    cleanupStatus: "not applicable",
    disposition: "not applicable",
  };
}

function recordedFinding(
  id: string,
  status: "blocker" | "must-fix" | "post-UAT",
  issueNumber: number,
): FindingFixture {
  return {
    id,
    status,
    issue: `#${issueNumber}`,
    owner: "@uat-owner",
    scope: "bounded visual UAT",
    actor: "HR operator",
    tenantEnvironment: "repo_owned_synthetic_webui_non_production",
    subjectBinding: `synthetic-subject-${issueNumber}`,
    routeViewport: "/transfer @ 1440x900",
    correlationId: `corr-${issueNumber}`,
    evidenceVersion: "p2z-uat-v1",
    evidence: `[finding](https://github.com/user-attachments/assets/10000000-0000-4000-8000-000000000${issueNumber})`,
    cleanupStatus: "completed",
    disposition:
      status === "blocker"
        ? "blocked"
        : status === "must-fix"
          ? "defect"
          : "post-UAT backlog",
  };
}

function pendingFinding(id: string): FindingFixture {
  return {
    id,
    status: "Pending",
    issue: "Pending",
    owner: "Pending",
    scope: "Pending",
    actor: "Pending",
    tenantEnvironment: "Pending",
    subjectBinding: "Pending",
    routeViewport: "Pending",
    correlationId: "Pending",
    evidenceVersion: "Pending",
    evidence: "Pending",
    cleanupStatus: "Pending",
    disposition: "Pending",
  };
}

function fixture(overall: P2zVisualUatOverallVerdict): UatFixture {
  const permanentBoundary = {
    automatedCandidate: "Go",
    productionReadiness: "Blocked",
    goLiveApproval: "Blocked",
  };
  const checklist = p2zVisualUatChecklistItems.map((label, index) => ({
    label,
    status:
      overall === "Pending human execution" ||
      (overall === "Blocked" && index > 0)
        ? "Pending"
        : "Completed",
    disposition:
      overall === "Pending human execution" ||
      (overall === "Blocked" && index > 0)
        ? "Pending"
        : overall === "Conditional" && index === 0
          ? "defect"
          : overall === "Conditional" && index === 1
            ? "post-UAT backlog"
            : overall === "Blocked" && index === 0
              ? "blocked"
              : "completed",
  }));
  if (overall === "Pending human execution") {
    return {
      overall,
      commit: "Pending human execution",
      namedTester: "Pending assignment",
      verdictRecorder: "Pending assignment",
      boundaryVerdict: overall,
      closeEligibility: "Blocked pending the formal human verdict",
      ...permanentBoundary,
      executions: p2zVisualUatScenarioIds.map(pendingExecution),
      findings: p2zVisualUatScenarioIds.map(pendingFinding),
      checklist,
    };
  }
  if (overall === "Conditional") {
    const executions = p2zVisualUatScenarioIds.map((id) =>
      completedExecution(id, id === "P2Z-UAT-03" ? "Conditional" : "Accepted"),
    );
    const findings = p2zVisualUatScenarioIds.flatMap((id) =>
      id === "P2Z-UAT-03"
        ? [
            recordedFinding(id, "must-fix", 501),
            recordedFinding(id, "post-UAT", 502),
          ]
        : [cleanFinding(id)],
    );
    return {
      overall,
      commit: testedCommit,
      namedTester: "Named Tester",
      verdictRecorder: "Named Tester",
      boundaryVerdict: overall,
      closeEligibility: "Blocked pending named conditions",
      ...permanentBoundary,
      executions,
      findings,
      checklist,
    };
  }
  if (overall === "Blocked") {
    const executions = p2zVisualUatScenarioIds.map((id, index) =>
      index < 2
        ? completedExecution(id)
        : index === 2
          ? completedExecution(id, "Blocked")
          : pendingExecution(id),
    );
    const findings = p2zVisualUatScenarioIds.map((id, index) =>
      index < 2
        ? cleanFinding(id)
        : index === 2
          ? recordedFinding(id, "blocker", 503)
          : pendingFinding(id),
    );
    return {
      overall,
      commit: testedCommit,
      namedTester: "Named Tester",
      verdictRecorder: "Named Tester",
      boundaryVerdict: overall,
      closeEligibility: "Blocked by the formal human verdict",
      ...permanentBoundary,
      executions,
      findings,
      checklist,
    };
  }
  return {
    overall,
    commit: testedCommit,
    namedTester: "Named Tester",
    verdictRecorder: "Named Tester",
    boundaryVerdict: overall,
    closeEligibility: "Eligible after evidence linkage",
    ...permanentBoundary,
    executions: p2zVisualUatScenarioIds.map((id) => completedExecution(id)),
    findings: p2zVisualUatScenarioIds.map(cleanFinding),
    checklist,
  };
}

function renderFixture(input: UatFixture): string {
  const executionRows = input.executions
    .map(
      (row) =>
        `| ${row.id} | ${row.tester} | ${row.date} | ${row.viewport} | ${row.persona} | ${row.expected} | ${row.actual} | ${row.evidence} | ${row.verdict} |`,
    )
    .join("\n");
  const findingRows = input.findings
    .map(
      (row) =>
        `| ${row.id} | ${row.status} | ${row.issue} | ${row.owner} | ${row.scope} | ${row.actor} | ${row.tenantEnvironment} | ${row.subjectBinding} | ${row.routeViewport} | ${row.correlationId} | ${row.evidenceVersion} | ${row.evidence} | ${row.cleanupStatus} | ${row.disposition} |`,
    )
    .join("\n");
  const checklist = input.checklist
    .map(
      (entry) => `| ${entry.label} | ${entry.status} | ${entry.disposition} |`,
    )
    .join("\n");
  return `# Fixture

## Verdict Boundary

| Decision surface | Current verdict |
| --- | --- |
| Automated visual UAT candidate | ${input.automatedCandidate} |
| Formal human visual UAT verdict | ${input.boundaryVerdict} |
| Issue #406 close eligibility | ${input.closeEligibility} |
| Production-like readiness | ${input.productionReadiness} |
| Go-live approval | ${input.goLiveApproval} |

## Backend Integration Boundary

Fixture boundary.

## Human Execution Record

Overall human verdict: **${input.overall}**
Tested commit: **${input.commit}**
Named human tester: **${input.namedTester}**
Overall verdict recorded by: **${input.verdictRecorder}**

| ID | Human tester | Execution date | Viewport | Persona | Expected result | Actual result | Evidence | Scenario verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${executionRows}

## Scenario Finding Record

| ID | Finding status | Linked GitHub Issue | Owner | Scope boundary | Actor | Tenant/environment | Subject binding | Route and viewport | Correlation ID | Evidence version | Screenshot or trace | Cleanup status | Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${findingRows}

## Visual Review Checklist

| Review item | Status | Disposition |
| --- | --- | --- |
${checklist}

## Evidence Matrix
`;
}

function cloneFixture(input: UatFixture): UatFixture {
  return structuredClone(input);
}

test("P2Z visual UAT record accepts each documented state", () => {
  for (const overall of [
    "Pending human execution",
    "Accepted",
    "Conditional",
    "Blocked",
  ] as const) {
    assert.doesNotThrow(() =>
      validateP2zVisualUatRecord(renderFixture(fixture(overall))),
    );
  }
});

test("P2Z visual UAT record accepts literal pending UI copy in observations", () => {
  const input = fixture("Accepted");
  input.executions[5]!.actual = "Approval pending is displayed as observed";
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record parses escaped pipes inside table cells", () => {
  const input = fixture("Accepted");
  input.executions[3]!.actual = "Approve \\| Return separation is visible";
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record accepts the tested commit before execution", () => {
  const input = fixture("Pending human execution");
  input.commit = testedCommit;
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record accepts every application bounded persona", () => {
  const input = fixture("Accepted");
  input.executions[6]!.persona = "Bounded admin";
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record rejects cross-state contradictions", () => {
  const cases: Array<{
    name: string;
    input: UatFixture;
    expected: RegExp;
  }> = [];

  const completedAfterBlocker = fixture("Blocked");
  completedAfterBlocker.executions[3] = completedExecution("P2Z-UAT-04");
  cases.push({
    name: "completed scenario after blocker",
    input: completedAfterBlocker,
    expected: /must remain pending after the first blocker/u,
  });

  const unnamedCondition = fixture("Conditional");
  unnamedCondition.executions[2]!.verdict = "Accepted";
  unnamedCondition.findings.splice(2, 2, cleanFinding("P2Z-UAT-03"));
  cases.push({
    name: "conditional verdict without a named condition",
    input: unnamedCondition,
    expected: /requires a Conditional scenario/u,
  });

  const mixedCleanFinding = fixture("Accepted");
  mixedCleanFinding.findings.push(
    recordedFinding("P2Z-UAT-01", "post-UAT", 504),
  );
  cases.push({
    name: "clean marker alongside a recorded finding",
    input: mixedCleanFinding,
    expected: /cannot mix none observed/u,
  });

  const wrongEvidenceBinding = fixture("Accepted");
  wrongEvidenceBinding.executions[0]!.evidence = `[run](evidence/p2z-webui/runs/${"b".repeat(40)}/P2Z-UAT-02.png)`;
  cases.push({
    name: "evidence from another commit and scenario",
    input: wrongEvidenceBinding,
    expected: /must link evidence for this run and scenario/u,
  });

  const malformedAttachment = fixture("Accepted");
  malformedAttachment.executions[0]!.evidence =
    "[run](https://github.com/user-attachments/assets/-)";
  cases.push({
    name: "malformed GitHub attachment identifier",
    input: malformedAttachment,
    expected: /must link evidence for this run and scenario/u,
  });

  const missingRepositoryEvidence = fixture("Accepted");
  missingRepositoryEvidence.executions[0]!.evidence = `[run](evidence/p2z-webui/runs/${testedCommit}/P2Z-UAT-01.png)`;
  cases.push({
    name: "repository evidence that does not exist",
    input: missingRepositoryEvidence,
    expected: /must link an existing tracked evidence artifact/u,
  });

  const wrongViewport = fixture("Accepted");
  wrongViewport.executions[6]!.viewport = "1440x900";
  cases.push({
    name: "mobile scenario at desktop viewport",
    input: wrongViewport,
    expected: /must use viewport 390x844/u,
  });

  const wrongFixedPersona = fixture("Accepted");
  wrongFixedPersona.executions[7]!.persona = "HR operator";
  cases.push({
    name: "wrong persona for the fail-closed scenario",
    input: wrongFixedPersona,
    expected: /must use persona No persona/u,
  });

  const missingBoundedPersona = fixture("Accepted");
  missingBoundedPersona.executions[6]!.persona = "Unknown actor";
  cases.push({
    name: "mobile scenario without a bounded persona",
    input: missingBoundedPersona,
    expected: /must record a concrete bounded persona/u,
  });

  const mismatchedFindingScenario = fixture("Accepted");
  mismatchedFindingScenario.findings[7] = recordedFinding(
    "P2Z-UAT-08",
    "post-UAT",
    506,
  );
  mismatchedFindingScenario.checklist[0]!.disposition = "post-UAT backlog";
  cases.push({
    name: "finding metadata from another scenario",
    input: mismatchedFindingScenario,
    expected: /finding actor must match its execution row/u,
  });

  const changedExpectedResult = fixture("Accepted");
  changedExpectedResult.executions[0]!.expected = "Any result is acceptable";
  cases.push({
    name: "scenario expected result drift",
    input: changedExpectedResult,
    expected: /must retain its documented expected result/u,
  });

  const staleBoundary = fixture("Conditional");
  staleBoundary.closeEligibility = "Eligible after evidence linkage";
  cases.push({
    name: "stale verdict boundary",
    input: staleBoundary,
    expected: /close eligibility must match/u,
  });

  const promotedReadiness = fixture("Accepted");
  promotedReadiness.productionReadiness = "Go";
  cases.push({
    name: "production-like readiness promoted by visual UAT",
    input: promotedReadiness,
    expected: /Production-like readiness must remain Blocked/u,
  });

  const staleAutomatedCandidate = fixture("Accepted");
  staleAutomatedCandidate.automatedCandidate = "Blocked";
  cases.push({
    name: "automated candidate verdict drift",
    input: staleAutomatedCandidate,
    expected: /Automated visual UAT candidate must remain Go/u,
  });

  const promotedGoLive = fixture("Accepted");
  promotedGoLive.goLiveApproval = "Go";
  cases.push({
    name: "go-live approval promoted by visual UAT",
    input: promotedGoLive,
    expected: /Go-live approval must remain Blocked/u,
  });

  const mixedPendingState = fixture("Pending human execution");
  mixedPendingState.commit = testedCommit;
  mixedPendingState.executions[0] = completedExecution("P2Z-UAT-01");
  cases.push({
    name: "completed scenario under a pending overall verdict",
    input: mixedPendingState,
    expected: /must keep every scenario verdict pending/u,
  });

  const mismatchedTester = fixture("Accepted");
  mismatchedTester.executions[0]!.tester = "Another Tester";
  cases.push({
    name: "scenario completed by another tester",
    input: mismatchedTester,
    expected: /must use the named human tester/u,
  });

  const mismatchedVerdictRecorder = fixture("Accepted");
  mismatchedVerdictRecorder.verdictRecorder = "Another Tester";
  cases.push({
    name: "overall verdict assigned by another tester",
    input: mismatchedVerdictRecorder,
    expected: /named human tester must record the overall verdict/u,
  });

  const missingScenario = fixture("Accepted");
  missingScenario.executions.pop();
  cases.push({
    name: "missing execution row",
    input: missingScenario,
    expected: /exactly one ordered execution row/u,
  });

  const missingChecklistItem = fixture("Accepted");
  missingChecklistItem.checklist.pop();
  cases.push({
    name: "missing checklist item",
    input: missingChecklistItem,
    expected: /keep every required visual checklist item/u,
  });

  const uncheckedAcceptance = fixture("Accepted");
  uncheckedAcceptance.checklist[0]!.status = "Pending";
  uncheckedAcceptance.checklist[0]!.disposition = "Pending";
  cases.push({
    name: "unchecked accepted record",
    input: uncheckedAcceptance,
    expected: /requires a completed checklist/u,
  });

  const adverseAcceptedDisposition = fixture("Accepted");
  adverseAcceptedDisposition.checklist[0]!.disposition = "defect";
  cases.push({
    name: "accepted record with adverse checklist disposition",
    input: adverseAcceptedDisposition,
    expected: /cannot retain adverse dispositions/u,
  });

  const incompleteFinding = fixture("Conditional");
  incompleteFinding.findings[2]!.owner = "not applicable";
  cases.push({
    name: "recorded finding without owner",
    input: incompleteFinding,
    expected: /must include owner/u,
  });

  const incompleteEvidenceRecord = fixture("Conditional");
  incompleteEvidenceRecord.findings[2]!.evidenceVersion = "not applicable";
  cases.push({
    name: "recorded finding without evidence version",
    input: incompleteEvidenceRecord,
    expected: /must include evidence version/u,
  });

  const missingFindingEvidence = fixture("Conditional");
  missingFindingEvidence.findings[2]!.evidence = `[finding](evidence/p2z-webui/runs/${testedCommit}/P2Z-UAT-03-finding-501.png)`;
  cases.push({
    name: "repository-backed finding evidence that does not exist",
    input: missingFindingEvidence,
    expected: /recorded finding must link an existing tracked evidence/u,
  });

  const reusedFindingEvidence = fixture("Conditional");
  reusedFindingEvidence.findings[3]!.evidence =
    reusedFindingEvidence.findings[2]!.evidence;
  cases.push({
    name: "repeated findings sharing one evidence artifact",
    input: reusedFindingEvidence,
    expected: /must not reuse an evidence artifact/u,
  });

  const earlierBlockerFinding = fixture("Blocked");
  earlierBlockerFinding.findings[0] = recordedFinding(
    "P2Z-UAT-01",
    "blocker",
    505,
  );
  cases.push({
    name: "blocker finding before the blocked scenario",
    input: earlierBlockerFinding,
    expected: /blocker finding requires a Blocked scenario/u,
  });

  const conditionWithoutChecklistDisposition = fixture("Conditional");
  conditionWithoutChecklistDisposition.checklist[0]!.disposition = "completed";
  cases.push({
    name: "conditional verdict without checklist disposition",
    input: conditionWithoutChecklistDisposition,
    expected: /must-fix findings require a defect or workaround/u,
  });

  for (const entry of cases) {
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(entry.input)),
      entry.expected,
      entry.name,
    );
  }
});
