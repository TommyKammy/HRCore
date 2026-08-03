import assert from "node:assert/strict";
import test from "node:test";

import {
  p2zVisualUatChecklistItems,
  p2zVisualUatScenarioIds,
  type P2zVisualUatOverallVerdict,
  validateP2zVisualUatRecord,
} from "./p2z-webui-visual-uat-record.js";

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
  disposition: string;
};

type UatFixture = {
  overall: P2zVisualUatOverallVerdict;
  commit: string;
  boundaryVerdict: string;
  closeEligibility: string;
  executions: ExecutionFixture[];
  findings: FindingFixture[];
  checklist: Array<{ checked: boolean; label: string }>;
};

function completedExecution(
  id: string,
  verdict = "Accepted",
): ExecutionFixture {
  return {
    id,
    tester: "Named Tester",
    date: "2026-08-03",
    viewport: id === "P2Z-UAT-07" ? "390x844" : "1440x900",
    persona:
      id === "P2Z-UAT-08"
        ? "No persona"
        : id === "P2Z-UAT-07"
          ? "HR operator"
          : "HR operator",
    expected: `Expected result for ${id}`,
    actual:
      id === "P2Z-UAT-06"
        ? "Approval pending is displayed as observed"
        : `Observed result for ${id}`,
    evidence: `[run](evidence/p2z-webui/runs/${testedCommit}/${id}.png)`,
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
    disposition: `${status} disposition recorded`,
  };
}

function pendingFinding(id: string): FindingFixture {
  return {
    id,
    status: "Pending",
    issue: "Pending",
    owner: "Pending",
    scope: "Pending",
    disposition: "Pending",
  };
}

function fixture(overall: P2zVisualUatOverallVerdict): UatFixture {
  const checklist = p2zVisualUatChecklistItems.map((label) => ({
    checked: overall !== "Pending human execution" && overall !== "Blocked",
    label,
  }));
  if (overall === "Pending human execution") {
    return {
      overall,
      commit: "Pending human execution",
      boundaryVerdict: overall,
      closeEligibility: "Blocked pending the formal human verdict",
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
      boundaryVerdict: overall,
      closeEligibility: "Blocked pending named conditions",
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
      boundaryVerdict: overall,
      closeEligibility: "Blocked by the formal human verdict",
      executions,
      findings,
      checklist,
    };
  }
  return {
    overall,
    commit: testedCommit,
    boundaryVerdict: overall,
    closeEligibility: "Eligible after evidence linkage",
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
        `| ${row.id} | ${row.status} | ${row.issue} | ${row.owner} | ${row.scope} | ${row.disposition} |`,
    )
    .join("\n");
  const checklist = input.checklist
    .map((entry) => `- [${entry.checked ? "x" : " "}] ${entry.label}`)
    .join("\n");
  return `# Fixture

## Verdict Boundary

| Decision surface | Current verdict |
| --- | --- |
| Formal human visual UAT verdict | ${input.boundaryVerdict} |
| Issue #406 close eligibility | ${input.closeEligibility} |

## Backend Integration Boundary

Fixture boundary.

## Human Execution Record

Overall human verdict: **${input.overall}**
Tested commit: **${input.commit}**

| ID | Human tester | Execution date | Viewport | Persona | Expected result | Actual result | Evidence | Scenario verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${executionRows}

## Scenario Finding Record

| ID | Finding status | Linked GitHub Issue | Owner | Scope boundary | Disposition |
| --- | --- | --- | --- | --- | --- |
${findingRows}

## Visual Review Checklist

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

  const wrongViewport = fixture("Accepted");
  wrongViewport.executions[6]!.viewport = "1440x900";
  cases.push({
    name: "mobile scenario at desktop viewport",
    input: wrongViewport,
    expected: /must use viewport 390x844/u,
  });

  const staleBoundary = fixture("Conditional");
  staleBoundary.closeEligibility = "Eligible after evidence linkage";
  cases.push({
    name: "stale verdict boundary",
    input: staleBoundary,
    expected: /close eligibility must match/u,
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
  uncheckedAcceptance.checklist[0]!.checked = false;
  cases.push({
    name: "unchecked accepted record",
    input: uncheckedAcceptance,
    expected: /requires a completed checklist/u,
  });

  const incompleteFinding = fixture("Conditional");
  incompleteFinding.findings[2]!.owner = "not applicable";
  cases.push({
    name: "recorded finding without owner",
    input: incompleteFinding,
    expected: /must include owner/u,
  });

  for (const entry of cases) {
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(entry.input)),
      entry.expected,
      entry.name,
    );
  }
});
