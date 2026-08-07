import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import { PNG } from "pngjs";

import {
  createP2zVisualUatFindingIssueRegistry,
  p2zVisualUatFindingIssueRegistryPath,
  p2zVisualUatFindingIssueUrl,
} from "./test-helpers/p2z-webui-visual-uat-issue-registry.js";
import {
  p2zVisualUatChecklistItems,
  p2zVisualUatScenarioIds,
  p2zVisualUatTestedCommitFromRecord,
  type P2zVisualUatOverallVerdict,
  validateP2zVisualUatRecord as validateRecord,
} from "./test-helpers/p2z-webui-visual-uat-record.js";

const pngCache = new Map<string, Buffer>();

function createPng(width: number, height: number, marker = 0): Buffer {
  const cacheKey = `${width}x${height}:${marker}`;
  const cached = pngCache.get(cacheKey);
  if (cached) return cached;

  const image = new PNG({ width, height });
  image.data.fill(255);

  const fillRect = (
    left: number,
    top: number,
    rectWidth: number,
    rectHeight: number,
    red: number,
    green: number,
    blue: number,
  ) => {
    for (let y = top; y < Math.min(height, top + rectHeight); y += 1) {
      for (let x = left; x < Math.min(width, left + rectWidth); x += 1) {
        const offset = (y * width + x) * 4;
        image.data[offset] = red;
        image.data[offset + 1] = green;
        image.data[offset + 2] = blue;
        image.data[offset + 3] = 255;
      }
    }
  };

  const accent = 40 + (marker % 160);
  fillRect(0, 0, width, Math.max(1, Math.floor(height * 0.1)), 25, 45, accent);
  fillRect(
    0,
    Math.floor(height * 0.1),
    Math.max(1, Math.floor(width * 0.16)),
    height,
    225,
    230,
    238,
  );
  for (let row = 0; row < 4; row += 1) {
    fillRect(
      Math.floor(width * 0.22),
      Math.floor(height * (0.2 + row * 0.16)),
      Math.max(1, Math.floor(width * 0.62)),
      Math.max(1, Math.floor(height * 0.07)),
      205 - row * 8,
      215 - row * 5,
      accent,
    );
  }

  const png = PNG.sync.write(image);
  pngCache.set(cacheKey, png);
  return png;
}

function createNearlyBlankPng(width: number, height: number): Buffer {
  const image = new PNG({ width, height });
  image.data.fill(255);
  image.data[0] = 0;
  image.data[1] = 0;
  image.data[2] = 0;
  return PNG.sync.write(image);
}

const desktopPng = createPng(1440, 900);
const desktopFullPagePng = createPng(1440, 1200);
const mobilePng = createPng(1170, 2532);
const oversizedPng = createPng(16_385, 1);
const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function writeFindingIssueRegistry(
  root: string,
  commit: string,
  issueNumbers: readonly number[],
): string {
  const repositoryPath = p2zVisualUatFindingIssueRegistryPath(commit);
  const absolutePath = path.join(root, ...repositoryPath.split("/"));
  const registry = createP2zVisualUatFindingIssueRegistry(
    commit,
    "2026-08-05T00:00:00.000Z",
    issueNumbers.map((issueNumber) => ({
      number: issueNumber,
      nodeId: `I_fixture_${issueNumber}`,
      url: p2zVisualUatFindingIssueUrl(issueNumber),
    })),
  );
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${JSON.stringify(registry, null, 2)}\n`);
  return absolutePath;
}

function createEvidenceRepository({
  includeFindingArtifacts = true,
  includeFindingIssueRegistry = true,
}: {
  includeFindingArtifacts?: boolean;
  includeFindingIssueRegistry?: boolean;
} = {}): {
  root: string;
  commit: string;
  closeoutCommit: string;
  unrelatedCommit: string;
} {
  const root = mkdtempSync(path.join(tmpdir(), "hrcore-p2z-uat-"));
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  writeFileSync(path.join(root, "README.md"), "fixture\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=UAT Fixture",
      "-c",
      "user.email=uat-fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "initialize fixture",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-08-02T00:00:00Z",
        GIT_COMMITTER_DATE: "2026-08-02T00:00:00Z",
      },
    },
  );
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const emptyTree = execFileSync("git", ["mktree"], {
    cwd: root,
    encoding: "utf8",
    input: "",
  }).trim();
  const unrelatedCommit = execFileSync(
    "git",
    [
      "-c",
      "user.name=UAT Fixture",
      "-c",
      "user.email=uat-fixture@example.invalid",
      "commit-tree",
      emptyTree,
      "-m",
      "unrelated fixture",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2026-08-02T00:00:00Z",
        GIT_COMMITTER_DATE: "2026-08-02T00:00:00Z",
      },
    },
  ).trim();
  execFileSync("git", ["update-ref", "refs/heads/unrelated", unrelatedCommit], {
    cwd: root,
  });
  const artifactDirectory = path.join(
    root,
    "docs",
    "evidence",
    "p2z-webui",
    "runs",
    commit,
  );
  mkdirSync(artifactDirectory, { recursive: true });
  for (const scenarioId of p2zVisualUatScenarioIds) {
    const width = scenarioId === "P2Z-UAT-07" ? 1170 : 1440;
    const height = scenarioId === "P2Z-UAT-07" ? 2532 : 900;
    const scenarioMarker = Number(scenarioId.slice(-2));
    writeFileSync(
      path.join(artifactDirectory, `${scenarioId}.png`),
      createPng(width, height, scenarioMarker),
    );
    if (includeFindingArtifacts) {
      for (let issueNumber = 500; issueNumber <= 520; issueNumber += 1) {
        writeFileSync(
          path.join(
            artifactDirectory,
            `${scenarioId}-finding-${issueNumber}.png`,
          ),
          createPng(width, height, 100 + issueNumber - 500),
        );
      }
    }
  }
  if (includeFindingIssueRegistry) {
    writeFindingIssueRegistry(
      root,
      commit,
      Array.from({ length: 21 }, (_, index) => 500 + index),
    );
  }
  execFileSync("git", ["add", "docs/evidence"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=UAT Fixture",
      "-c",
      "user.email=uat-fixture@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "record evidence",
    ],
    { cwd: root },
  );
  const closeoutCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return { root, commit, closeoutCommit, unrelatedCommit };
}

const evidenceRepository = createEvidenceRepository();
const testedCommit = evidenceRepository.commit;
after(() => rmSync(evidenceRepository.root, { recursive: true, force: true }));

function validateP2zVisualUatRecord(
  markdown: string,
  rootDirectory = evidenceRepository.root,
): void {
  validateRecord(markdown, rootDirectory);
}

type ExecutionFixture = {
  id: string;
  tester: string;
  date: string;
  viewport: string;
  persona: string;
  route: string;
  subjectBinding: string;
  correlationId: string;
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
  environment: string;
  boundaryVerdict: string;
  closeEligibility: string;
  automatedCandidate: string;
  productionReadiness: string;
  goLiveApproval: string;
  executions: ExecutionFixture[];
  findings: FindingFixture[];
  checklist: Array<{ label: string; status: string; disposition: string }>;
};

function bindExecutionEvidenceToCommit(
  input: UatFixture,
  commit: string,
): void {
  for (const execution of input.executions) {
    if (execution.verdict !== "Pending") {
      execution.evidence = `[run](evidence/p2z-webui/runs/${commit}/${execution.id}.png)`;
    }
  }
}

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
    "P2Z-UAT-01":
      "KPI, seven-day work queue, integration health, and recent drafts are visible",
    "P2Z-UAT-02":
      "Masked profile, lifecycle timeline, and external IDs are visible",
    "P2Z-UAT-03":
      "Step 3/5, input, impact preview, validation, and request detail are visible",
    "P2Z-UAT-04":
      "Selected transfer evidence and separated reject/return/approve/cancel actions are visible",
    "P2Z-UAT-05":
      "Runtime KPI, recent runs, failed items, job detail, and DLQ decision are visible",
    "P2Z-UAT-06":
      "One exact correlation lookup and evidence timeline are visible",
    "P2Z-UAT-07":
      "Drawer opens explicitly, closes after route selection, and no primary action is lost",
    "P2Z-UAT-08": "Workflows remain hidden and the bounded reason is visible",
  };
  const routeByScenario: Record<string, string> = {
    "P2Z-UAT-01": "/queue",
    "P2Z-UAT-02": "/employee",
    "P2Z-UAT-03": "/transfer",
    "P2Z-UAT-04": "/transfer -> /approvals",
    "P2Z-UAT-05": "/ops",
    "P2Z-UAT-06": "/audit",
    "P2Z-UAT-07": "/transfer",
    "P2Z-UAT-08": "/queue",
  };
  return {
    id,
    tester: "Named Tester",
    date: "2026-08-03",
    viewport: id === "P2Z-UAT-07" ? "390x844" : "1440x900",
    persona: personaByScenario[id] ?? "",
    route: routeByScenario[id] ?? "",
    subjectBinding: id === "P2Z-UAT-02" ? "EMP-000128" : "not applicable",
    correlationId: id === "P2Z-UAT-06" ? "corr-p2z-uat-06" : "not applicable",
    expected: expectedResultByScenario[id] ?? "",
    actual:
      id === "P2Z-UAT-06"
        ? "Approval pending is displayed as observed"
        : `Observed result for ${id}`,
    evidence: `[run](evidence/p2z-webui/runs/${testedCommit}/${id}.png)`,
    verdict,
  };
}

function pendingExecution(id: string): ExecutionFixture {
  const scenario = completedExecution(id);
  const pendingEvidenceByScenario: Record<string, string> = {
    "P2Z-UAT-01":
      "[reference](evidence/p2z-webui/desktop-chromium-dashboard.png); run capture pending",
    "P2Z-UAT-02":
      "[reference](evidence/p2z-webui/desktop-chromium-employee-detail.png); run capture pending",
    "P2Z-UAT-03":
      "[reference](evidence/p2z-webui/desktop-chromium-transfer.png); run capture pending",
    "P2Z-UAT-04":
      "[reference](evidence/p2z-webui/desktop-chromium-approval-inbox.png); run capture pending",
    "P2Z-UAT-05":
      "[reference](evidence/p2z-webui/desktop-chromium-job-monitor.png); run capture pending",
    "P2Z-UAT-06": "Run-specific Audit capture pending",
    "P2Z-UAT-07":
      "[mobile references](evidence/p2z-webui/README.md); run capture pending",
    "P2Z-UAT-08": "Run-specific fail-closed entry capture pending",
  };
  return {
    id,
    tester: "Pending assignment",
    date: "Pending",
    viewport: scenario.viewport,
    persona: id === "P2Z-UAT-07" ? "Pending actual persona" : scenario.persona,
    route: id === "P2Z-UAT-07" ? "Pending actual route" : scenario.route,
    subjectBinding: scenario.subjectBinding,
    correlationId:
      id === "P2Z-UAT-06" ? "Pending exact correlation ID" : "not applicable",
    expected: scenario.expected,
    actual: "Pending human execution",
    evidence: pendingEvidenceByScenario[id] ?? "",
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
    evidence: `[finding](evidence/p2z-webui/runs/${testedCommit}/${id}-finding-${issueNumber}.png)`,
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
    environment: "repo_owned_synthetic_webui_non_production",
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
        `| ${row.id} | ${row.tester} | ${row.date} | ${row.viewport} | ${row.persona} | ${row.route} | ${row.subjectBinding} | ${row.correlationId} | ${row.expected} | ${row.actual} | ${row.evidence} | ${row.verdict} |`,
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
Execution environment/dataset: **${input.environment}**

| ID | Human tester | Execution date | Viewport | Persona | Route | Subject binding | Correlation ID | Expected result | Actual result | Evidence | Scenario verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
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

test("P2Z visual UAT record requires an execution-level Audit correlation ID", () => {
  const input = fixture("Accepted");
  input.executions[5]!.correlationId = "not applicable";
  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(input)),
    /P2Z-UAT-06 must record an exact correlation ID/u,
  );
});

test("P2Z visual UAT record rejects pixel-identical automated references as run evidence", () => {
  const repository = createEvidenceRepository();
  try {
    const copiedReference = createPng(1440, 900, 1);
    const reencodedReference = PNG.sync.write(PNG.sync.read(copiedReference), {
      deflateLevel: 0,
      deflateStrategy: 0,
    });
    assert.equal(reencodedReference.equals(copiedReference), false);
    const referencePath = path.join(
      repository.root,
      "docs",
      "evidence",
      "p2z-webui",
      "desktop-chromium-dashboard.png",
    );
    const runPath = path.join(
      repository.root,
      "docs",
      "evidence",
      "p2z-webui",
      "runs",
      repository.commit,
      "P2Z-UAT-01.png",
    );
    writeFileSync(referencePath, copiedReference);
    writeFileSync(runPath, reencodedReference);
    execFileSync("git", ["add", "docs/evidence"], {
      cwd: repository.root,
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=UAT Fixture",
        "-c",
        "user.email=uat-fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "copy automated reference",
      ],
      { cwd: repository.root },
    );

    const input = fixture("Accepted");
    input.commit = repository.commit;
    bindExecutionEvidenceToCommit(input, repository.commit);
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(input), repository.root),
      /must not duplicate an automated reference screenshot/u,
    );
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("P2Z visual UAT record rejects copied run evidence under another path", () => {
  const repository = createEvidenceRepository();
  try {
    const sourceRelative = `evidence/p2z-webui/runs/${repository.commit}/P2Z-UAT-01.png`;
    const copiedRelative = `evidence/p2z-webui/runs/${repository.commit}/P2Z-UAT-02.png`;
    copyFileSync(
      path.join(repository.root, "docs", ...sourceRelative.split("/")),
      path.join(repository.root, "docs", ...copiedRelative.split("/")),
    );
    execFileSync("git", ["add", "docs/evidence"], {
      cwd: repository.root,
    });

    const input = fixture("Accepted");
    input.commit = repository.commit;
    bindExecutionEvidenceToCommit(input, repository.commit);
    input.executions[1]!.evidence = `[run](${copiedRelative})`;
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(input), repository.root),
      /must not reuse another scenario's evidence artifact/u,
    );
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("P2Z visual UAT record parses escaped pipes inside table cells", () => {
  const input = fixture("Accepted");
  input.executions[3]!.actual = "Approve \\| Return separation is visible";
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));

  const evidence = input.executions[0]!.evidence;
  const contradictoryRenderedVerdict = renderFixture(input).replace(
    `${evidence} | Accepted |`,
    `${evidence} \\\\| Blocked | Accepted |`,
  );
  assert.throws(
    () => validateP2zVisualUatRecord(contradictoryRenderedVerdict),
    /must keep the human execution record schema/u,
  );
});

test("P2Z visual UAT record requires canonical structure for every formal table", () => {
  const accepted = renderFixture(fixture("Accepted"));
  for (const table of [
    {
      header: "| Decision surface | Current verdict |",
      delimiter: "| --- | --- |",
      expected: /must keep the verdict boundary table schema/u,
    },
    {
      header:
        "| ID | Human tester | Execution date | Viewport | Persona | Route | Subject binding | Correlation ID | Expected result | Actual result | Evidence | Scenario verdict |",
      delimiter:
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      expected: /must keep the human execution record schema/u,
    },
    {
      header:
        "| ID | Finding status | Linked GitHub Issue | Owner | Scope boundary | Actor | Tenant/environment | Subject binding | Route and viewport | Correlation ID | Evidence version | Screenshot or trace | Cleanup status | Disposition |",
      delimiter:
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      expected: /must keep the scenario finding record schema/u,
    },
    {
      header: "| Review item | Status | Disposition |",
      delimiter: "| --- | --- | --- |",
      expected: /must keep the visual checklist record schema/u,
    },
  ]) {
    const withoutDelimiter = accepted.replace(
      `${table.header}\n${table.delimiter}`,
      table.header,
    );
    assert.notEqual(withoutDelimiter, accepted);
    assert.throws(
      () => validateP2zVisualUatRecord(withoutDelimiter),
      table.expected,
    );

    const detachedRow = table.delimiter.replaceAll("---", "rogue");
    for (const malformedTable of [
      accepted.replace(table.header, table.header.slice(1)),
      accepted.replace(
        `${table.header}\n${table.delimiter}`,
        `${table.header}\n${table.delimiter.slice(1)}`,
      ),
      accepted.replace(table.header, `${detachedRow}\n${table.header}`),
    ]) {
      assert.notEqual(malformedTable, accepted);
      assert.throws(
        () => validateP2zVisualUatRecord(malformedTable),
        table.expected,
      );
    }
  }

  for (const table of [
    {
      rowPrefix: "| Automated visual UAT candidate |",
      expected: /must keep the verdict boundary table schema/u,
    },
    {
      rowPrefix: "| P2Z-UAT-01 | Named Tester |",
      expected: /must keep the human execution record schema/u,
    },
    {
      rowPrefix: "| P2Z-UAT-01 | none observed |",
      expected: /must keep the scenario finding record schema/u,
    },
    {
      rowPrefix: "| Navigation, page heading",
      expected: /must keep the visual checklist record schema/u,
    },
  ]) {
    const lines = accepted.split("\n");
    const rowIndex = lines.findIndex((line) =>
      line.startsWith(table.rowPrefix),
    );
    assert.notEqual(rowIndex, -1);
    const canonicalRow = lines[rowIndex]!;
    lines[rowIndex] = canonicalRow.replace(/\|$/u, "| unexpected |");
    assert.throws(
      () => validateP2zVisualUatRecord(lines.join("\n")),
      table.expected,
    );

    for (const malformedRow of [
      canonicalRow.slice(1),
      canonicalRow.slice(0, -1),
      canonicalRow.slice(1, -1),
    ]) {
      lines[rowIndex] = malformedRow;
      assert.throws(
        () => validateP2zVisualUatRecord(lines.join("\n")),
        table.expected,
      );
    }
  }

  const acceptedLines = accepted.split("\n");
  const findingRow = acceptedLines.find((line) =>
    line.startsWith("| P2Z-UAT-01 | none observed |"),
  );
  const finalFindingIndex = acceptedLines.findIndex((line) =>
    line.startsWith("| P2Z-UAT-08 | none observed |"),
  );
  assert.ok(findingRow);
  assert.notEqual(finalFindingIndex, -1);
  for (const malformedSupplementalFinding of [
    findingRow.slice(1),
    findingRow.slice(0, -1),
    findingRow.slice(1, -1),
  ]) {
    const lines = [...acceptedLines];
    lines.splice(finalFindingIndex + 1, 0, malformedSupplementalFinding);
    assert.throws(
      () => validateP2zVisualUatRecord(lines.join("\n")),
      /must keep the scenario finding record schema/u,
    );
  }
  const detachedLines = [...acceptedLines];
  detachedLines.splice(
    finalFindingIndex + 1,
    0,
    "Detached explanatory text.",
    findingRow.slice(1, -1),
  );
  assert.throws(
    () => validateP2zVisualUatRecord(detachedLines.join("\n")),
    /must keep the scenario finding record schema/u,
  );

  const indentedFindingLines = [...acceptedLines];
  indentedFindingLines.splice(
    finalFindingIndex + 1,
    0,
    `   ${findingRow.replace("P2Z-UAT-01", "P2Z-UAT-99")}`,
  );
  assert.throws(
    () => validateP2zVisualUatRecord(indentedFindingLines.join("\n")),
    /must provide at least one finding row per scenario/u,
  );
});

test("P2Z visual UAT record validates every visible formal table row", () => {
  const extraExecution = fixture("Accepted");
  extraExecution.executions.push(completedExecution("P2Z-UAT-99"));
  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(extraExecution)),
    /must provide exactly one ordered execution row per scenario/u,
  );

  const extraFinding = fixture("Accepted");
  extraFinding.findings.push(cleanFinding("P2Z-UAT-99"));
  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(extraFinding)),
    /must provide at least one finding row per scenario/u,
  );

  for (const input of [
    fixture("Pending human execution"),
    fixture("Accepted"),
  ]) {
    input.findings.splice(1, 0, { ...input.findings[0]! });
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(input)),
      /must use exactly one pending or none observed marker, or only recorded findings/u,
    );
  }

  const extraChecklist = fixture("Accepted");
  extraChecklist.checklist.push({
    label: "Unrecognized review item",
    status: "Completed",
    disposition: "defect",
  });
  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(extraChecklist)),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(
        error.message,
        /must keep exactly the ordered visual checklist inventory/u,
      );
      assert.match(
        error.message,
        /defect checklist disposition requires a matching must-fix finding/u,
      );
      return true;
    },
  );

  const accepted = renderFixture(fixture("Accepted"));
  const extraVerdictSurface = accepted.replace(
    "| Go-live approval | Blocked |\n\n## Backend Integration Boundary",
    "| Go-live approval | Blocked |\n| Unrecognized decision surface | Blocked |\n\n## Backend Integration Boundary",
  );
  assert.notEqual(extraVerdictSurface, accepted);
  assert.throws(
    () => validateP2zVisualUatRecord(extraVerdictSurface),
    /must keep the exact ordered verdict boundary surfaces/u,
  );
});

test("P2Z visual UAT record accepts a finding bound to the executed subject", () => {
  const input = fixture("Accepted");
  input.findings[1] = recordedFinding("P2Z-UAT-02", "post-UAT", 511);
  input.findings[1]!.subjectBinding = "EMP-000128";
  input.findings[1]!.routeViewport = "/employee @ 1440x900";
  input.findings[1]!.evidence = `[supplemental](https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000001); ${input.findings[1]!.evidence}`;
  input.checklist[0]!.disposition = "post-UAT backlog";
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record accepts canonical subjectless finding bindings", () => {
  const input = fixture("Accepted");
  input.findings[0] = recordedFinding("P2Z-UAT-01", "post-UAT", 513);
  input.findings[0]!.issue = p2zVisualUatFindingIssueUrl(513);
  input.findings[0]!.subjectBinding = "not applicable";
  input.findings[0]!.routeViewport = "/queue @ 1440x900";
  input.checklist[0]!.disposition = "post-UAT backlog";

  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record rejects non-canonical subjectless placeholders", () => {
  for (const placeholder of [
    "N/A",
    "N/A.",
    "not applicable.",
    "(not applicable)",
    "Pending.",
  ]) {
    const input = fixture("Accepted");
    input.findings[0] = recordedFinding("P2Z-UAT-01", "post-UAT", 513);
    input.findings[0]!.subjectBinding = placeholder;
    input.findings[0]!.routeViewport = "/queue @ 1440x900";
    input.checklist[0]!.disposition = "post-UAT backlog";

    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(input)),
      /must include subject binding as visible text or use not applicable/u,
      placeholder,
    );
  }
});

test("P2Z visual UAT record accepts a finding-specific subject on a subjectless scenario", () => {
  const input = fixture("Accepted");
  input.findings[0] = recordedFinding("P2Z-UAT-01", "post-UAT", 514);
  input.findings[0]!.subjectBinding = "queue item HR-000514";
  input.findings[0]!.routeViewport = "/queue @ 1440x900";
  input.checklist[0]!.disposition = "post-UAT backlog";

  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record does not substitute not applicable for a concrete subject", () => {
  const input = fixture("Accepted");
  input.findings[1] = recordedFinding("P2Z-UAT-02", "post-UAT", 511);
  input.findings[1]!.subjectBinding = "not applicable";
  input.findings[1]!.routeViewport = "/employee @ 1440x900";
  input.checklist[0]!.disposition = "post-UAT backlog";

  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(input)),
    /finding subject must match its execution row/u,
  );
});

test("P2Z visual UAT record parses only rendered Markdown records", () => {
  const accepted = renderFixture(fixture("Accepted"));
  for (const hiddenRecord of [
    `<!--\n${accepted}\n-->`,
    `\`\`\`markdown\n${accepted}\n\`\`\``,
    `<pre>\n${accepted}\n</pre>`,
    `<div>\n${accepted.replace("# Fixture\n\n", "# Fixture\n")}\n</div>`,
    `<div></div>\n${accepted.replace("# Fixture\n\n", "# Fixture\n")}`,
    `</div>\n${accepted.replace("# Fixture\n\n", "# Fixture\n")}`,
    `<?uat\n${accepted}\n?>`,
    `<!UAT\n${accepted}\n>`,
    `<![CDATA[\n${accepted}\n]]>`,
  ]) {
    assert.throws(
      () => validateP2zVisualUatRecord(hiddenRecord),
      /must keep exactly one ## Verdict Boundary/u,
    );
  }

  assert.doesNotThrow(() =>
    validateP2zVisualUatRecord(
      `<div></div>\n## Verdict Boundary\n\n${accepted}`,
    ),
  );

  assert.doesNotThrow(() =>
    validateP2zVisualUatRecord(
      `${accepted}\n<!-- Overall human verdict: **Blocked** -->`,
    ),
  );

  const escapedCommentOpener = accepted.replace(
    "Overall human verdict: **Accepted**",
    "Overall human verdict: **Accepted**\n\\<!--\nOverall human verdict: **Blocked**\n-->",
  );
  assert.throws(
    () => validateP2zVisualUatRecord(escapedCommentOpener),
    /exactly one supported overall human verdict/u,
  );

  for (const renderedEquivalentHeading of [
    "## Human Execution Record ##",
    "## Human Execution Record  ",
    "  ## Human Execution Record",
    "Human Execution Record\n---",
  ]) {
    const duplicateSection = accepted.replace(
      "## Human Execution Record",
      `${renderedEquivalentHeading}\n\nContradictory execution record.\n\n## Human Execution Record`,
    );
    assert.throws(
      () => validateP2zVisualUatRecord(duplicateSection),
      /must keep exactly one ## Human Execution Record/u,
    );
  }

  for (const autolink of ["<https://example.com>", "<uat@example.com>"]) {
    const record = accepted.replace(
      "| ID | Human tester |",
      `${autolink}\nOverall human verdict: **Blocked**\n\n| ID | Human tester |`,
    );
    assert.throws(
      () => validateP2zVisualUatRecord(record),
      /exactly one supported overall human verdict/u,
      autolink,
    );
  }

  const blockquotedDuplicate = accepted.replace(
    "Overall human verdict: **Accepted**",
    "Overall human verdict: **Accepted**\n> Overall human verdict: **Blocked**",
  );
  assert.throws(
    () => validateP2zVisualUatRecord(blockquotedDuplicate),
    /exactly one supported overall human verdict/u,
  );

  for (const listPrefix of ["- ", "1. ", "- [ ] "]) {
    const listDuplicate = accepted.replace(
      "Overall human verdict: **Accepted**",
      `Overall human verdict: **Accepted**\n${listPrefix}Overall human verdict: **Blocked**`,
    );
    assert.throws(
      () => validateP2zVisualUatRecord(listDuplicate),
      /exactly one supported overall human verdict/u,
      listPrefix,
    );
  }

  const reorderedSection = accepted
    .replace("## Backend Integration Boundary\n\nFixture boundary.\n\n", "")
    .replace(
      "| ID | Human tester |",
      "## Backend Integration Boundary\n\nFixture boundary.\n\n| ID | Human tester |",
    );
  assert.throws(
    () => validateP2zVisualUatRecord(reorderedSection),
    /without an intervening section/u,
  );
});

test("P2Z visual UAT record requires unique package declarations", () => {
  const accepted = renderFixture(fixture("Accepted"));
  const duplicates = [
    {
      declaration: "Overall human verdict: **Blocked**",
      expected: /exactly one supported overall human verdict/u,
    },
    {
      declaration: `Tested commit: **${testedCommit}**`,
      expected: /exactly one tested commit/u,
    },
    {
      declaration: "Named human tester: **Another Tester**",
      expected: /exactly one named human tester/u,
    },
    {
      declaration: "Overall verdict recorded by: **Another Tester**",
      expected: /exactly one verdict recorder/u,
    },
    {
      declaration: "Execution environment/dataset: **production**",
      expected: /exactly one execution environment/u,
    },
  ];
  for (const duplicate of duplicates) {
    const record = accepted.replace(
      "| ID | Human tester |",
      `${duplicate.declaration}\n\n| ID | Human tester |`,
    );
    assert.throws(() => validateP2zVisualUatRecord(record), duplicate.expected);
  }
});

test("P2Z visual UAT record accepts the tested commit before execution", () => {
  for (const commit of [testedCommit, evidenceRepository.closeoutCommit]) {
    const input = fixture("Pending human execution");
    input.commit = commit;
    assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
  }
});

test("P2Z visual UAT record accepts canonical inline link destination variants", () => {
  const target = `evidence/p2z-webui/runs/${testedCommit}/P2Z-UAT-01.png`;
  for (const destination of [
    `<${target}>`,
    `${target} "run evidence"`,
    `${target} 'run evidence'`,
  ]) {
    const input = fixture("Accepted");
    input.executions[0]!.evidence = `[run](${destination})`;
    assert.doesNotThrow(
      () => validateP2zVisualUatRecord(renderFixture(input)),
      destination,
    );
  }
});

test("P2Z visual UAT record rejects product changes after the tested commit", () => {
  const repository = createEvidenceRepository();
  try {
    const productPath = path.join(
      repository.root,
      "web",
      "src",
      "post-test.ts",
    );
    mkdirSync(path.dirname(productPath), { recursive: true });
    writeFileSync(productPath, "export const changedAfterUat = true;\n");
    execFileSync("git", ["add", "web/src/post-test.ts"], {
      cwd: repository.root,
    });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=UAT Fixture",
        "-c",
        "user.email=uat-fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "change product after UAT",
      ],
      { cwd: repository.root },
    );

    const input = fixture("Accepted");
    input.commit = repository.commit;
    bindExecutionEvidenceToCommit(input, repository.commit);
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(input), repository.root),
      /tested commit must remain product-current/u,
    );
  } finally {
    rmSync(repository.root, { recursive: true, force: true });
  }
});

test("P2Z visual UAT updater reads the tested commit only from the rendered execution record", () => {
  const accepted = renderFixture(fixture("Accepted"));
  assert.equal(p2zVisualUatTestedCommitFromRecord(accepted), testedCommit);

  const pending = renderFixture(fixture("Pending human execution"));
  for (const hiddenOrDetachedCommit of [
    `${pending}\n<!-- Tested commit: **${testedCommit}** -->`,
    `${pending}\n\`\`\`markdown\nTested commit: **${testedCommit}**\n\`\`\``,
    `${pending}\n<pre>\nTested commit: **${testedCommit}**\n</pre>`,
    `Tested commit: **${testedCommit}**\n\n${pending}`,
  ]) {
    assert.equal(
      p2zVisualUatTestedCommitFromRecord(hiddenOrDetachedCommit),
      undefined,
    );
  }

  const duplicateVisibleCommit = accepted.replace(
    "| ID | Human tester |",
    `Tested commit: **${testedCommit}**\n\n| ID | Human tester |`,
  );
  assert.equal(
    p2zVisualUatTestedCommitFromRecord(duplicateVisibleCommit),
    undefined,
  );
});

test("P2Z visual UAT record accepts every application bounded persona", () => {
  const input = fixture("Accepted");
  input.executions[6]!.persona = "Bounded admin";
  input.executions[6]!.route = "/admin";
  assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
});

test("P2Z visual UAT record accepts findings on both approval scenario legs", () => {
  for (const [actor, route, issueNumber] of [
    ["HR operator", "/transfer", 507],
    ["Approver", "/approvals", 508],
  ] as const) {
    const input = fixture("Accepted");
    input.findings[3] = recordedFinding("P2Z-UAT-04", "post-UAT", issueNumber);
    input.findings[3]!.actor = actor;
    input.findings[3]!.routeViewport = `${route} @ 1440x900`;
    input.checklist[0]!.disposition = "post-UAT backlog";
    assert.doesNotThrow(() => validateP2zVisualUatRecord(renderFixture(input)));
  }
});

test("P2Z visual UAT record validates repository-backed artifact contents", (t) => {
  for (const artifact of [
    { name: "valid PNG", extension: "png", contents: desktopPng, valid: true },
    {
      name: "valid full-page PNG",
      extension: "png",
      contents: desktopFullPagePng,
      valid: true,
    },
    {
      name: "PNG from another viewport",
      extension: "png",
      contents: mobilePng,
      valid: false,
    },
    {
      name: "one-pixel PNG",
      extension: "png",
      contents: tinyPng,
      valid: false,
    },
    {
      name: "nearly blank PNG",
      extension: "png",
      contents: createNearlyBlankPng(1440, 900),
      valid: false,
      expected: /must contain meaningful visual content/u,
    },
    {
      name: "PNG outside safe decode bounds",
      extension: "png",
      contents: oversizedPng,
      valid: false,
      expected: /must stay within safe decode bounds/u,
    },
    {
      name: "valid JSON trace",
      extension: "json",
      contents: Buffer.from('{"events":[{"type":"screenshot"}]}'),
      valid: true,
    },
    {
      name: "valid eventType JSON trace with root metadata",
      extension: "json",
      contents: Buffer.from(
        '{"schemaVersion":1,"events":[{"eventType":"visual.capture"}]}',
      ),
      valid: true,
    },
    {
      name: "empty PNG",
      extension: "png",
      contents: Buffer.alloc(0),
      valid: false,
    },
    {
      name: "empty JSON object",
      extension: "json",
      contents: Buffer.from("{}"),
      valid: false,
    },
    {
      name: "empty JSON array",
      extension: "json",
      contents: Buffer.from("[]"),
      valid: false,
    },
    {
      name: "nested empty JSON trace",
      extension: "json",
      contents: Buffer.from('{"events":[]}'),
      valid: false,
    },
    {
      name: "metadata-only JSON trace with empty events",
      extension: "json",
      contents: Buffer.from('{"events":[],"schemaVersion":1}'),
      valid: false,
    },
    {
      name: "root-metadata-only JSON trace",
      extension: "json",
      contents: Buffer.from('{"schemaVersion":1}'),
      valid: false,
    },
    {
      name: "empty event object JSON trace",
      extension: "json",
      contents: Buffer.from('{"events":[{}]}'),
      valid: false,
    },
    {
      name: "event-metadata-only JSON trace",
      extension: "json",
      contents: Buffer.from('{"events":[{"schemaVersion":1}]}'),
      valid: false,
    },
    {
      name: "scalar event JSON trace",
      extension: "json",
      contents: Buffer.from('{"events":[1]}'),
      valid: false,
    },
    {
      name: "blank event type JSON trace",
      extension: "json",
      contents: Buffer.from('{"events":[{"type":"   "}]}'),
      valid: false,
    },
    {
      name: "mixed valid and invalid event JSON trace",
      extension: "json",
      contents: Buffer.from(
        '{"events":[{"type":"screenshot"},{"schemaVersion":1}]}',
      ),
      valid: false,
    },
    {
      name: "meaningful text trace",
      extension: "txt",
      contents: Buffer.from("Observed employee detail trace"),
      valid: true,
    },
    {
      name: "token-only text trace",
      extension: "txt",
      contents: Buffer.from("x"),
      valid: false,
    },
    {
      name: "long single-word text trace",
      extension: "txt",
      contents: Buffer.from("successful"),
      valid: false,
    },
    {
      name: "empty rendered Markdown trace",
      extension: "md",
      contents: Buffer.from("<span></span>"),
      valid: false,
    },
    {
      name: "reference-only Markdown trace",
      extension: "md",
      contents: Buffer.from(
        "[obs]: https://example.invalid/observed-run-details",
      ),
      valid: false,
    },
    {
      name: "multiline reference-only Markdown trace",
      extension: "md",
      contents: Buffer.from(
        '[obs]:\n  https://example.invalid/observed-run-details\n  "Observed run details"',
      ),
      valid: false,
    },
    {
      name: "symlink PNG",
      extension: "png",
      contents: desktopPng,
      valid: false,
      symlink: true,
    },
  ]) {
    const { root, commit } = createEvidenceRepository({
      includeFindingArtifacts: false,
    });
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const relativeArtifact = `evidence/p2z-webui/runs/${commit}/P2Z-UAT-01.${artifact.extension}`;
    const artifactPath = path.join(
      root,
      "docs",
      ...relativeArtifact.split("/"),
    );
    mkdirSync(path.dirname(artifactPath), { recursive: true });
    if (artifact.symlink) {
      const target = path.join(root, "artifact-target.png");
      writeFileSync(target, artifact.contents);
      rmSync(artifactPath, { force: true });
      symlinkSync(target, artifactPath);
    } else {
      writeFileSync(artifactPath, artifact.contents);
    }
    execFileSync("git", ["add", "--", path.relative(root, artifactPath)], {
      cwd: root,
    });

    const input = fixture("Accepted");
    input.commit = commit;
    bindExecutionEvidenceToCommit(input, commit);
    input.executions[0]!.evidence = `[run](${relativeArtifact})`;
    const validate = () =>
      validateP2zVisualUatRecord(renderFixture(input), root);
    if (artifact.valid) {
      assert.doesNotThrow(validate, artifact.name);
    } else {
      assert.throws(
        validate,
        artifact.expected ?? /repository evidence must/u,
        artifact.name,
      );
    }
  }
});

test("P2Z visual UAT record accepts a provenance-bound subjectless JSON finding", (t) => {
  const { root, commit } = createEvidenceRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const relativeArtifact = `evidence/p2z-webui/runs/${commit}/P2Z-UAT-01.json`;
  const artifactPath = path.join(root, "docs", ...relativeArtifact.split("/"));
  writeFileSync(
    artifactPath,
    '{"schemaVersion":1,"events":[{"eventType":"visual.capture"}]}',
  );
  execFileSync("git", ["add", "--", path.relative(root, artifactPath)], {
    cwd: root,
  });

  const input = fixture("Accepted");
  input.commit = commit;
  bindExecutionEvidenceToCommit(input, commit);
  input.executions[0]!.evidence = `[run](${relativeArtifact})`;
  input.findings[0] = recordedFinding("P2Z-UAT-01", "post-UAT", 513);
  input.findings[0]!.issue = p2zVisualUatFindingIssueUrl(513);
  input.findings[0]!.subjectBinding = "not applicable";
  input.findings[0]!.routeViewport = "/queue @ 1440x900";
  input.findings[0]!.evidence = `[finding](evidence/p2z-webui/runs/${commit}/P2Z-UAT-01-finding-513.png)`;
  input.checklist[0]!.disposition = "post-UAT backlog";

  assert.doesNotThrow(() =>
    validateP2zVisualUatRecord(renderFixture(input), root),
  );
});

test("P2Z visual UAT record does not require an Issue registry for clean findings", (t) => {
  const { root, commit } = createEvidenceRepository({
    includeFindingIssueRegistry: false,
  });
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = fixture("Accepted");
  input.commit = commit;
  bindExecutionEvidenceToCommit(input, commit);

  assert.doesNotThrow(() =>
    validateP2zVisualUatRecord(renderFixture(input), root),
  );
});

test("P2Z visual UAT record requires a tracked regular finding Issue registry", (t) => {
  for (const registryState of [
    "missing",
    "untracked",
    "symlink",
    "invalid JSON",
  ] as const) {
    const { root, commit } = createEvidenceRepository({
      includeFindingIssueRegistry: false,
    });
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const repositoryPath = p2zVisualUatFindingIssueRegistryPath(commit);
    const registryPath = path.join(root, ...repositoryPath.split("/"));
    if (registryState === "untracked") {
      writeFindingIssueRegistry(root, commit, [513]);
    } else if (registryState === "symlink") {
      writeFindingIssueRegistry(root, commit, [513]);
      const target = path.join(root, "finding-issues-target.json");
      renameSync(registryPath, target);
      symlinkSync(target, registryPath);
      execFileSync("git", ["add", "--", repositoryPath], { cwd: root });
    } else if (registryState === "invalid JSON") {
      writeFileSync(registryPath, "{");
      execFileSync("git", ["add", "--", repositoryPath], { cwd: root });
    }

    const input = fixture("Accepted");
    input.commit = commit;
    bindExecutionEvidenceToCommit(input, commit);
    input.findings[0] = recordedFinding("P2Z-UAT-01", "post-UAT", 513);
    input.findings[0]!.subjectBinding = "not applicable";
    input.findings[0]!.routeViewport = "/queue @ 1440x900";
    input.checklist[0]!.disposition = "post-UAT backlog";

    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(input), root),
      registryState === "symlink"
        ? /finding Issue registry must be a tracked regular file/u
        : registryState === "invalid JSON"
          ? /finding Issue registry must contain valid JSON/u
          : /finding Issue registry must be an existing tracked regular file/u,
      registryState,
    );
  }
});

test("P2Z visual UAT record rejects an unverified finding Issue reference", () => {
  const input = fixture("Accepted");
  input.findings[0] = recordedFinding("P2Z-UAT-01", "post-UAT", 999_999_999);
  input.findings[0]!.subjectBinding = "not applicable";
  input.findings[0]!.routeViewport = "/queue @ 1440x900";
  input.findings[0]!.evidence = `[finding](evidence/p2z-webui/runs/${testedCommit}/P2Z-UAT-01-finding-513.png)`;
  input.checklist[0]!.disposition = "post-UAT backlog";

  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(input)),
    /finding Issue registry must include required Issue #999999999/u,
  );
});

test("P2Z visual UAT record binds finding PNGs to the scenario viewport", (t) => {
  const { root, commit } = createEvidenceRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const relativeArtifact = `evidence/p2z-webui/runs/${commit}/P2Z-UAT-07-finding-512.png`;
  const artifactPath = path.join(root, "docs", ...relativeArtifact.split("/"));
  const input = fixture("Accepted");
  input.commit = commit;
  bindExecutionEvidenceToCommit(input, commit);
  const finding = recordedFinding("P2Z-UAT-07", "post-UAT", 512);
  finding.subjectBinding = "synthetic-mobile-subject";
  finding.routeViewport = "/transfer @ 390x844";
  finding.evidence = `[finding](${relativeArtifact})`;
  input.findings[6] = finding;
  input.checklist[0]!.disposition = "post-UAT backlog";

  assert.doesNotThrow(() =>
    validateP2zVisualUatRecord(renderFixture(input), root),
  );

  writeFileSync(artifactPath, desktopPng);
  execFileSync("git", ["add", "--", path.relative(root, artifactPath)], {
    cwd: root,
  });
  assert.throws(
    () => validateP2zVisualUatRecord(renderFixture(input), root),
    /P2Z-UAT-07 recorded finding evidence must match the recorded 390x844 capture geometry/u,
  );
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
    expected: /must link repository evidence for this run and scenario/u,
  });

  const externalAttachment = fixture("Accepted");
  externalAttachment.executions[0]!.evidence =
    "[run](https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000001)";
  cases.push({
    name: "external attachment without repository evidence",
    input: externalAttachment,
    expected: /must link repository evidence for this run and scenario/u,
  });

  const nonexistentTestedCommit = fixture("Accepted");
  nonexistentTestedCommit.commit = "0".repeat(40);
  cases.push({
    name: "completed run bound to a nonexistent commit",
    input: nonexistentTestedCommit,
    expected: /tested commit must resolve to a repository commit/u,
  });

  for (const overall of ["Pending human execution", "Accepted"] as const) {
    const unrelatedTestedCommit = fixture(overall);
    unrelatedTestedCommit.commit = evidenceRepository.unrelatedCommit;
    cases.push({
      name: `${overall} run bound to an unrelated repository commit`,
      input: unrelatedTestedCommit,
      expected: /tested commit must be an ancestor of repository HEAD/u,
    });
  }

  const missingRepositoryEvidence = fixture("Accepted");
  missingRepositoryEvidence.executions[0]!.evidence = `[run](evidence/p2z-webui/runs/${testedCommit}/P2Z-UAT-01.json)`;
  cases.push({
    name: "repository evidence that does not exist",
    input: missingRepositoryEvidence,
    expected: /repository evidence must be an existing tracked regular file/u,
  });

  const wrongViewport = fixture("Accepted");
  wrongViewport.executions[6]!.viewport = "1440x900";
  cases.push({
    name: "mobile scenario at desktop viewport",
    input: wrongViewport,
    expected: /must use viewport 390x844/u,
  });

  const futureExecutionDate = fixture("Accepted");
  futureExecutionDate.executions[0]!.date = "2999-01-01";
  cases.push({
    name: "completed scenario dated in the future",
    input: futureExecutionDate,
    expected: /must record a valid non-future ISO execution date/u,
  });

  const executionBeforeTestedCommit = fixture("Accepted");
  executionBeforeTestedCommit.executions[0]!.date = "2026-08-01";
  cases.push({
    name: "completed scenario dated before the tested commit",
    input: executionBeforeTestedCommit,
    expected: /execution date must not predate the tested commit/u,
  });

  const tokenOnlyObservation = fixture("Accepted");
  tokenOnlyObservation.executions[0]!.actual = "x";
  cases.push({
    name: "completed scenario with a token-only observation",
    input: tokenOnlyObservation,
    expected: /must record a meaningful actual observation/u,
  });

  const longSingleWordObservation = fixture("Accepted");
  longSingleWordObservation.executions[0]!.actual = "successful";
  cases.push({
    name: "completed scenario with a long single-word observation",
    input: longSingleWordObservation,
    expected: /must record a meaningful actual observation/u,
  });

  const disallowedMobileRoute = fixture("Accepted");
  disallowedMobileRoute.executions[6]!.route = "/admin";
  cases.push({
    name: "mobile scenario route outside the persona allowlist",
    input: disallowedMobileRoute,
    expected: /must record a route allowed for its persona/u,
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

  const wrongEmployeeSubject = fixture("Accepted");
  wrongEmployeeSubject.executions[1]!.subjectBinding = "EMP-000999";
  cases.push({
    name: "employee detail executed against the wrong subject",
    input: wrongEmployeeSubject,
    expected: /P2Z-UAT-02 must use subject binding EMP-000128/u,
  });

  const mismatchedFindingSubject = fixture("Accepted");
  mismatchedFindingSubject.findings[1] = recordedFinding(
    "P2Z-UAT-02",
    "post-UAT",
    511,
  );
  mismatchedFindingSubject.findings[1]!.routeViewport = "/employee @ 1440x900";
  mismatchedFindingSubject.checklist[0]!.disposition = "post-UAT backlog";
  cases.push({
    name: "employee finding bound to another subject",
    input: mismatchedFindingSubject,
    expected: /finding subject must match its execution row/u,
  });

  const staleBoundary = fixture("Conditional");
  staleBoundary.closeEligibility = "Eligible after evidence linkage";
  cases.push({
    name: "stale verdict boundary",
    input: staleBoundary,
    expected: /close eligibility must match/u,
  });

  const unboundedEnvironment = fixture("Accepted");
  unboundedEnvironment.environment = "production";
  cases.push({
    name: "completed run without its bounded environment binding",
    input: unboundedEnvironment,
    expected: /must bind the formal run to the bounded execution environment/u,
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
    expected: /must remain pending under a pending overall verdict/u,
  });

  const mismatchedTester = fixture("Accepted");
  mismatchedTester.executions[0]!.tester = "Another Tester";
  cases.push({
    name: "scenario completed by another tester",
    input: mismatchedTester,
    expected: /must use the named human tester/u,
  });

  const invisibleTester = fixture("Accepted");
  invisibleTester.namedTester = "<span></span>";
  invisibleTester.verdictRecorder = "<span></span>";
  for (const execution of invisibleTester.executions) {
    execution.tester = "<span></span>";
  }
  cases.push({
    name: "completed run with a non-visible tester identity",
    input: invisibleTester,
    expected: /must identify the named human tester/u,
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
    expected: /keep exactly the ordered visual checklist inventory/u,
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

  for (const [field, label, expected] of [
    ["owner", "owner", /must include owner as a visible identity/u],
    ["scope", "scope boundary", /must include scope boundary as visible text/u],
    ["actor", "actor", /must include actor as visible text/u],
    [
      "subjectBinding",
      "subject binding",
      /must include subject binding as visible text/u,
    ],
    [
      "routeViewport",
      "route and viewport",
      /must include route and viewport as visible text/u,
    ],
    [
      "evidenceVersion",
      "evidence version",
      /must include evidence version as visible text/u,
    ],
    [
      "correlationId",
      "correlation ID",
      /must include correlation ID or not applicable as visible text/u,
    ],
  ] as const) {
    const invisibleFindingMetadata = fixture("Conditional");
    invisibleFindingMetadata.findings[2]![field] = "<span></span>";
    cases.push({
      name: `recorded finding with invisible ${label}`,
      input: invisibleFindingMetadata,
      expected,
    });
  }

  const auditFindingWithoutCorrelation = fixture("Accepted");
  auditFindingWithoutCorrelation.findings[5] = recordedFinding(
    "P2Z-UAT-06",
    "post-UAT",
    510,
  );
  auditFindingWithoutCorrelation.findings[5]!.actor = "HR Ops/support";
  auditFindingWithoutCorrelation.findings[5]!.routeViewport =
    "/audit @ 1440x900";
  auditFindingWithoutCorrelation.findings[5]!.correlationId = "not applicable";
  auditFindingWithoutCorrelation.checklist[0]!.disposition = "post-UAT backlog";
  cases.push({
    name: "Audit finding without its exact correlation ID",
    input: auditFindingWithoutCorrelation,
    expected: /must bind the Audit correlation ID/u,
  });

  const auditFindingWithDifferentCorrelation = fixture("Accepted");
  auditFindingWithDifferentCorrelation.findings[5] = recordedFinding(
    "P2Z-UAT-06",
    "post-UAT",
    510,
  );
  auditFindingWithDifferentCorrelation.findings[5]!.actor = "HR Ops/support";
  auditFindingWithDifferentCorrelation.findings[5]!.routeViewport =
    "/audit @ 1440x900";
  auditFindingWithDifferentCorrelation.findings[5]!.correlationId =
    "different-correlation";
  auditFindingWithDifferentCorrelation.checklist[0]!.disposition =
    "post-UAT backlog";
  cases.push({
    name: "Audit finding bound to another executed correlation ID",
    input: auditFindingWithDifferentCorrelation,
    expected: /finding correlation ID must match its execution row/u,
  });

  const externalIssueLink = fixture("Conditional");
  externalIssueLink.findings[2]!.issue = "https://example.com/issues/501";
  cases.push({
    name: "finding linked outside the HRCore GitHub repository",
    input: externalIssueLink,
    expected: /must link a GitHub Issue/u,
  });

  const mismatchedFindingDisposition = fixture("Conditional");
  mismatchedFindingDisposition.findings[2]!.disposition = "post-UAT backlog";
  cases.push({
    name: "must-fix finding recorded as post-UAT backlog",
    input: mismatchedFindingDisposition,
    expected: /must-fix finding must use its matching disposition/u,
  });

  const incompleteEvidenceRecord = fixture("Conditional");
  incompleteEvidenceRecord.findings[2]!.evidenceVersion = "not applicable";
  cases.push({
    name: "recorded finding without evidence version",
    input: incompleteEvidenceRecord,
    expected: /must include evidence version/u,
  });

  const externalFindingEvidence = fixture("Conditional");
  externalFindingEvidence.findings[2]!.evidence =
    "[finding](https://github.com/user-attachments/assets/00000000-0000-4000-8000-000000000001)";
  cases.push({
    name: "external finding attachment without repository evidence",
    input: externalFindingEvidence,
    expected: /must link its repository-backed screenshot or trace/u,
  });

  const missingFindingEvidence = fixture("Conditional");
  missingFindingEvidence.findings[2]!.evidence = `[finding](evidence/p2z-webui/runs/${testedCommit}/P2Z-UAT-03-finding-missing.png)`;
  cases.push({
    name: "repository-backed finding evidence that does not exist",
    input: missingFindingEvidence,
    expected:
      /recorded finding evidence must be an existing tracked regular file/u,
  });

  const reusedFindingEvidence = fixture("Conditional");
  reusedFindingEvidence.findings[3]!.evidence =
    reusedFindingEvidence.findings[2]!.evidence;
  cases.push({
    name: "repeated findings sharing one evidence artifact",
    input: reusedFindingEvidence,
    expected: /must not reuse an evidence artifact/u,
  });

  const codeSpanFindingEvidence = fixture("Conditional");
  codeSpanFindingEvidence.findings[2]!.evidence = `\`${codeSpanFindingEvidence.findings[2]!.evidence}\``;
  cases.push({
    name: "finding evidence link shown only as code",
    input: codeSpanFindingEvidence,
    expected: /must link its repository-backed screenshot or trace/u,
  });

  const crossTableEvidenceReuse = fixture("Conditional");
  crossTableEvidenceReuse.findings[2]!.evidence =
    crossTableEvidenceReuse.executions[0]!.evidence;
  cases.push({
    name: "finding using the execution artifact namespace",
    input: crossTableEvidenceReuse,
    expected: /must link its repository-backed screenshot or trace/u,
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

  const blockedWithUnexplainedCondition = fixture("Blocked");
  blockedWithUnexplainedCondition.executions[0]!.verdict = "Conditional";
  cases.push({
    name: "Blocked run with an unexplained earlier Conditional scenario",
    input: blockedWithUnexplainedCondition,
    expected: /Conditional scenario requires its own must-fix finding/u,
  });

  const executedFieldsAfterBlocker = fixture("Blocked");
  executedFieldsAfterBlocker.executions[3]!.tester = "Named Tester";
  executedFieldsAfterBlocker.executions[3]!.date = "2026-08-03";
  executedFieldsAfterBlocker.executions[3]!.actual = "Observed after blocker";
  executedFieldsAfterBlocker.executions[3]!.evidence =
    completedExecution("P2Z-UAT-04").evidence;
  cases.push({
    name: "execution details recorded after the first blocker",
    input: executedFieldsAfterBlocker,
    expected: /human tester must remain pending after the first blocker/u,
  });

  const postUatOnlyCondition = fixture("Conditional");
  postUatOnlyCondition.findings.splice(
    2,
    2,
    recordedFinding("P2Z-UAT-03", "post-UAT", 509),
  );
  postUatOnlyCondition.checklist[0]!.disposition = "completed";
  cases.push({
    name: "conditional verdict supported only by post-UAT backlog",
    input: postUatOnlyCondition,
    expected: /Conditional scenario requires its own must-fix finding/u,
  });

  const unexplainedConditionalScenario = fixture("Conditional");
  unexplainedConditionalScenario.executions[3]!.verdict = "Conditional";
  cases.push({
    name: "second Conditional scenario without its own finding",
    input: unexplainedConditionalScenario,
    expected:
      /P2Z-UAT-04 Conditional scenario requires its own must-fix finding/u,
  });

  const conditionWithoutChecklistDisposition = fixture("Conditional");
  conditionWithoutChecklistDisposition.checklist[0]!.disposition = "completed";
  cases.push({
    name: "conditional verdict without checklist disposition",
    input: conditionWithoutChecklistDisposition,
    expected: /must-fix findings require a matching checklist disposition/u,
  });

  const findingWithDifferentChecklistDisposition = fixture("Conditional");
  findingWithDifferentChecklistDisposition.findings[2]!.disposition =
    "workaround";
  cases.push({
    name: "finding and checklist using different allowed dispositions",
    input: findingWithDifferentChecklistDisposition,
    expected:
      /must-fix finding disposition workaround requires a matching checklist disposition/u,
  });

  for (const disposition of ["defect", "workaround"] as const) {
    const dispositionWithoutMustFixFinding = fixture("Blocked");
    dispositionWithoutMustFixFinding.checklist[1]!.status = "Completed";
    dispositionWithoutMustFixFinding.checklist[1]!.disposition = disposition;
    cases.push({
      name: `${disposition} checklist disposition without a must-fix finding`,
      input: dispositionWithoutMustFixFinding,
      expected: new RegExp(
        `${disposition} checklist disposition requires a matching must-fix finding`,
        "u",
      ),
    });
  }

  for (const entry of cases) {
    assert.throws(
      () => validateP2zVisualUatRecord(renderFixture(entry.input)),
      entry.expected,
      entry.name,
    );
  }
});
