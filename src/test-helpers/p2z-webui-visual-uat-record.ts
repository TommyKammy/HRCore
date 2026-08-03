export const p2zVisualUatScenarioIds = [
  "P2Z-UAT-01",
  "P2Z-UAT-02",
  "P2Z-UAT-03",
  "P2Z-UAT-04",
  "P2Z-UAT-05",
  "P2Z-UAT-06",
  "P2Z-UAT-07",
  "P2Z-UAT-08",
] as const;

type P2zVisualUatScenarioId = (typeof p2zVisualUatScenarioIds)[number];

const p2zVisualUatScenarioContracts: Record<
  P2zVisualUatScenarioId,
  {
    viewport: string;
    persona: string | "Any bounded persona";
    expectedResult: string;
  }
> = {
  "P2Z-UAT-01": {
    viewport: "1440x900",
    persona: "HR operator",
    expectedResult: "Dashboard structure is understandable",
  },
  "P2Z-UAT-02": {
    viewport: "1440x900",
    persona: "HR operator",
    expectedResult:
      "Masked profile, lifecycle timeline, and external IDs are visible",
  },
  "P2Z-UAT-03": {
    viewport: "1440x900",
    persona: "HR operator",
    expectedResult: "Transfer steps and impact remain clear",
  },
  "P2Z-UAT-04": {
    viewport: "1440x900",
    persona: "HR operator then Approver",
    expectedResult: "Approval evidence and actions are clear",
  },
  "P2Z-UAT-05": {
    viewport: "1440x900",
    persona: "HR Ops/support",
    expectedResult: "Job and DLQ evidence is understandable",
  },
  "P2Z-UAT-06": {
    viewport: "1440x900",
    persona: "HR Ops/support",
    expectedResult: "Exact audit lookup is understandable",
  },
  "P2Z-UAT-07": {
    viewport: "390x844",
    persona: "Any bounded persona",
    expectedResult: "Drawer and primary actions remain usable",
  },
  "P2Z-UAT-08": {
    viewport: "1440x900",
    persona: "No persona",
    expectedResult: "Workflow content remains fail-closed",
  },
};

const boundedPersonas = new Set(["HR operator", "Approver", "HR Ops/support"]);

const p2zVisualUatDecisionSurfaces = [
  "Automated visual UAT candidate",
  "Formal human visual UAT verdict",
  "Issue #406 close eligibility",
  "Production-like readiness",
  "Go-live approval",
] as const;

export const p2zVisualUatChecklistItems = [
  "Navigation, page heading, and workspace use the same visual hierarchy.",
  "Japanese task labels are primary and technical identifiers remain readable.",
  "Status, priority, deadline, provider, and scope are distinguishable without relying on color alone.",
  "Forms and impact previews remain aligned at desktop width.",
  "Master/detail selection is visually clear.",
  "Destructive and primary actions are visually separated.",
  "Text does not clip or overlap.",
  "Loading, empty, error, blocked, success, and disabled states are understandable.",
  "Keyboard focus is visible.",
  "Mobile controls remain inside the viewport.",
] as const;

export type P2zVisualUatOverallVerdict =
  | "Pending human execution"
  | "Accepted"
  | "Conditional"
  | "Blocked";

type P2zVisualUatScenarioVerdict =
  | "Pending"
  | "Accepted"
  | "Conditional"
  | "Blocked";

type P2zVisualUatFindingStatus =
  | "Pending"
  | "none observed"
  | "blocker"
  | "must-fix"
  | "post-UAT";

type ExecutionRow = {
  id: string;
  humanTester: string;
  executionDate: string;
  viewport: string;
  persona: string;
  expectedResult: string;
  actualResult: string;
  evidence: string;
  verdict: string;
};

type FindingRow = {
  id: string;
  status: string;
  linkedIssue: string;
  owner: string;
  scopeBoundary: string;
  disposition: string;
};

type ChecklistEntry = { checked: boolean; label: string | undefined };

const overallVerdicts = new Set<P2zVisualUatOverallVerdict>([
  "Pending human execution",
  "Accepted",
  "Conditional",
  "Blocked",
]);

const completedScenarioVerdicts = new Set<P2zVisualUatScenarioVerdict>([
  "Accepted",
  "Conditional",
  "Blocked",
]);

const completedFindingStatuses = new Set<P2zVisualUatFindingStatus>([
  "none observed",
  "blocker",
  "must-fix",
  "post-UAT",
]);

const closeEligibilityByVerdict = new Map<P2zVisualUatOverallVerdict, string>([
  ["Pending human execution", "Blocked pending the formal human verdict"],
  ["Accepted", "Eligible after evidence linkage"],
  ["Conditional", "Blocked pending named conditions"],
  ["Blocked", "Blocked by the formal human verdict"],
]);

const fixedDecisionSurfaceVerdicts = new Map([
  ["Automated visual UAT candidate", "Go"],
  ["Production-like readiness", "Blocked"],
  ["Go-live approval", "Blocked"],
]);

function markdownCells(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function section(
  markdown: string,
  startHeading: string,
  endHeading: string,
  issues: string[],
): string {
  const start = markdown.indexOf(startHeading);
  const end = markdown.indexOf(endHeading);
  if (start < 0 || end <= start) {
    issues.push(`must keep ${startHeading} before ${endHeading}`);
    return "";
  }
  return markdown.slice(start, end);
}

function parseExecutionRows(record: string): ExecutionRow[] {
  return record
    .split("\n")
    .filter((line) => /^\| P2Z-UAT-\d{2} \|/u.test(line))
    .map((line) => {
      const cells = markdownCells(line);
      return {
        id: cells[0] ?? "",
        humanTester: cells[1] ?? "",
        executionDate: cells[2] ?? "",
        viewport: cells[3] ?? "",
        persona: cells[4] ?? "",
        expectedResult: cells[5] ?? "",
        actualResult: cells[6] ?? "",
        evidence: cells[7] ?? "",
        verdict: cells[8] ?? "",
      };
    });
}

function parseFindingRows(record: string): FindingRow[] {
  return record
    .split("\n")
    .filter((line) => /^\| P2Z-UAT-\d{2} \|/u.test(line))
    .map((line) => {
      const cells = markdownCells(line);
      return {
        id: cells[0] ?? "",
        status: cells[1] ?? "",
        linkedIssue: cells[2] ?? "",
        owner: cells[3] ?? "",
        scopeBoundary: cells[4] ?? "",
        disposition: cells[5] ?? "",
      };
    });
}

function parseChecklist(checklist: string): ChecklistEntry[] {
  return Array.from(
    checklist.replace(/\n {6}/gu, " ").matchAll(/^- \[([ xX])\] (.+)$/gmu),
    (match) => ({
      checked: /^x$/iu.test(match[1] ?? ""),
      label: match[2],
    }),
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function isSubstantive(value: string): boolean {
  return !/^(?:|Pending(?: assignment| actual persona| human execution)?|not applicable|n\/a|none|tbd|unknown)$/iu.test(
    value,
  );
}

function validateCompletedExecutionRow(
  row: ExecutionRow,
  testedCommit: string,
  evidenceTargets: Set<string>,
  issues: string[],
): void {
  const scenario =
    p2zVisualUatScenarioContracts[row.id as P2zVisualUatScenarioId];
  if (!scenario) {
    issues.push(`${row.id} must identify a supported UAT scenario`);
    return;
  }
  if (row.viewport !== scenario.viewport) {
    issues.push(`${row.id} must use viewport ${scenario.viewport}`);
  }
  if (!isSubstantive(row.humanTester)) {
    issues.push(`${row.id} must identify the human tester`);
  }
  if (!isIsoDate(row.executionDate)) {
    issues.push(`${row.id} must record a valid ISO execution date`);
  }
  if (scenario.persona === "Any bounded persona") {
    if (!boundedPersonas.has(row.persona)) {
      issues.push(`${row.id} must record a concrete bounded persona`);
    }
  } else if (row.persona !== scenario.persona) {
    issues.push(`${row.id} must use persona ${scenario.persona}`);
  }
  if (row.expectedResult !== scenario.expectedResult) {
    issues.push(`${row.id} must retain its documented expected result`);
  }
  if (!isSubstantive(row.actualResult)) {
    issues.push(`${row.id} must record the actual result`);
  }
  if (
    !completedScenarioVerdicts.has(row.verdict as P2zVisualUatScenarioVerdict)
  ) {
    issues.push(`${row.id} must use a completed scenario verdict`);
  }

  const links = Array.from(
    row.evidence.matchAll(/\]\(([^)]+)\)/gu),
    (match) => match[1] ?? "",
  );
  const repositoryArtifact = new RegExp(
    `^evidence/p2z-webui/runs/${testedCommit}/${row.id}\\.(?:png|jpe?g|webp|json|zip|txt|md)$`,
    "u",
  );
  const artifact = links.find(
    (target) =>
      repositoryArtifact.test(target) ||
      /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]+$/u.test(
        target,
      ),
  );
  if (!artifact) {
    issues.push(`${row.id} must link evidence for this run and scenario`);
  } else if (evidenceTargets.has(artifact)) {
    issues.push(
      `${row.id} must not reuse another scenario's evidence artifact`,
    );
  } else {
    evidenceTargets.add(artifact);
  }
}

function validateCompletedFindingRow(row: FindingRow, issues: string[]): void {
  if (!completedFindingStatuses.has(row.status as P2zVisualUatFindingStatus)) {
    issues.push(`${row.id} must use a completed finding status`);
    return;
  }
  const metadata = [
    row.linkedIssue,
    row.owner,
    row.scopeBoundary,
    row.disposition,
  ];
  if (row.status === "none observed") {
    if (metadata.some((value) => value !== "not applicable")) {
      issues.push(`${row.id} clean finding metadata must be not applicable`);
    }
    return;
  }
  if (!/(?:#\d+|\/issues\/\d+)/u.test(row.linkedIssue)) {
    issues.push(`${row.id} recorded finding must link a GitHub Issue`);
  }
  for (const [name, value] of [
    ["owner", row.owner],
    ["scope boundary", row.scopeBoundary],
    ["disposition", row.disposition],
  ] as const) {
    if (!isSubstantive(value)) {
      issues.push(`${row.id} recorded finding must include ${name}`);
    }
  }
}

export function collectP2zVisualUatRecordIssues(markdown: string): string[] {
  const issues: string[] = [];
  const verdictSection = section(
    markdown,
    "## Verdict Boundary",
    "## Backend Integration Boundary",
    issues,
  );
  const executionSection = section(
    markdown,
    "## Human Execution Record",
    "## Scenario Finding Record",
    issues,
  );
  const findingSection = section(
    markdown,
    "## Scenario Finding Record",
    "## Visual Review Checklist",
    issues,
  );
  const checklistSection = section(
    markdown,
    "## Visual Review Checklist",
    "## Evidence Matrix",
    issues,
  );

  const overallVerdict = executionSection.match(
    /Overall human verdict: \*\*(Pending human execution|Accepted|Conditional|Blocked)\*\*/u,
  )?.[1] as P2zVisualUatOverallVerdict | undefined;
  if (!overallVerdict || !overallVerdicts.has(overallVerdict)) {
    issues.push("must record a supported overall human verdict");
  }
  const testedCommit = executionSection.match(
    /Tested commit: \*\*(Pending human execution|[0-9a-f]{40})\*\*/u,
  )?.[1];
  if (!testedCommit) issues.push("must record the tested commit");

  const verdictBoundaryRows = verdictSection
    .split("\n")
    .filter((line) => /^\| .+ \| .+ \|$/u.test(line))
    .map((line) => markdownCells(line))
    .filter(
      ([surface]) =>
        surface !== "Decision surface" && !/^:?-+:?$/u.test(surface ?? ""),
    );
  if (
    JSON.stringify(verdictBoundaryRows.map(([surface]) => surface)) !==
    JSON.stringify(p2zVisualUatDecisionSurfaces)
  ) {
    issues.push("must keep the exact ordered verdict boundary surfaces");
  }
  const verdictBoundary = new Map(
    verdictBoundaryRows.map(([surface, verdict]) => [surface, verdict]),
  );
  if (overallVerdict) {
    if (
      verdictBoundary.get("Formal human visual UAT verdict") !== overallVerdict
    ) {
      issues.push("formal verdict boundary must match the overall verdict");
    }
    if (
      verdictBoundary.get("Issue #406 close eligibility") !==
      closeEligibilityByVerdict.get(overallVerdict)
    ) {
      issues.push(
        "Issue #406 close eligibility must match the overall verdict",
      );
    }
    for (const [surface, verdict] of fixedDecisionSurfaceVerdicts) {
      if (verdictBoundary.get(surface) !== verdict) {
        issues.push(`${surface} must remain ${verdict}`);
      }
    }
  }

  const executionRows = parseExecutionRows(executionSection);
  if (
    !executionSection
      .replace(/\s+/gu, " ")
      .includes(
        "| ID | Human tester | Execution date | Viewport | Persona | Expected result | Actual result | Evidence | Scenario verdict |",
      )
  ) {
    issues.push("must keep the human execution record schema");
  }
  const executionIds = executionRows.map((row) => row.id);
  if (
    JSON.stringify(executionIds) !== JSON.stringify(p2zVisualUatScenarioIds)
  ) {
    issues.push("must provide exactly one ordered execution row per scenario");
  }
  const findingRows = parseFindingRows(findingSection);
  if (
    !findingSection
      .replace(/\s+/gu, " ")
      .includes(
        "| ID | Finding status | Linked GitHub Issue | Owner | Scope boundary | Disposition |",
      )
  ) {
    issues.push("must keep the scenario finding record schema");
  }
  const findingIds = [...new Set(findingRows.map((row) => row.id))].sort();
  if (
    JSON.stringify(findingIds) !==
    JSON.stringify([...p2zVisualUatScenarioIds].sort())
  ) {
    issues.push("must provide at least one finding row per scenario");
  }

  const checklist = parseChecklist(checklistSection);
  if (
    JSON.stringify(checklist.map((entry) => entry.label)) !==
    JSON.stringify(p2zVisualUatChecklistItems)
  ) {
    issues.push("must keep every required visual checklist item");
  }

  if (!overallVerdict || !testedCommit) return issues;
  if (overallVerdict === "Pending human execution") {
    if (
      testedCommit !== "Pending human execution" &&
      !/^[0-9a-f]{40}$/u.test(testedCommit)
    ) {
      issues.push(
        "pending UAT must use a pending or 40-character tested commit",
      );
    }
    if (executionRows.some((row) => row.verdict !== "Pending")) {
      issues.push("pending UAT must keep every scenario verdict pending");
    }
    if (
      findingRows.some(
        (row) =>
          row.status !== "Pending" ||
          [row.linkedIssue, row.owner, row.scopeBoundary, row.disposition].some(
            (value) => value !== "Pending",
          ),
      )
    ) {
      issues.push("pending UAT must keep every finding row pending");
    }
    if (checklist.some((entry) => entry.checked)) {
      issues.push("pending UAT must keep the checklist incomplete");
    }
    return issues;
  }
  if (!/^[0-9a-f]{40}$/u.test(testedCommit)) {
    issues.push("completed UAT must bind to a 40-character tested commit");
    return issues;
  }

  const evidenceTargets = new Set<string>();
  let blockedIndex = -1;
  for (const [index, row] of executionRows.entries()) {
    if (blockedIndex >= 0) {
      if (row.verdict !== "Pending") {
        issues.push(`${row.id} must remain pending after the first blocker`);
      }
      continue;
    }
    if (row.verdict === "Pending") {
      issues.push(`${row.id} cannot be pending before a blocker`);
      continue;
    }
    validateCompletedExecutionRow(row, testedCommit, evidenceTargets, issues);
    if (row.verdict === "Blocked") blockedIndex = index;
  }

  if (overallVerdict === "Accepted") {
    for (const row of executionRows) {
      if (row.verdict !== "Accepted") {
        issues.push(
          "Accepted overall verdict requires every scenario to be Accepted",
        );
        break;
      }
    }
  } else if (overallVerdict === "Conditional") {
    if (!executionRows.some((row) => row.verdict === "Conditional")) {
      issues.push(
        "Conditional overall verdict requires a Conditional scenario",
      );
    }
    if (executionRows.some((row) => row.verdict === "Blocked")) {
      issues.push(
        "Conditional overall verdict cannot contain a Blocked scenario",
      );
    }
  } else if (overallVerdict === "Blocked" && blockedIndex < 0) {
    issues.push("Blocked overall verdict requires a Blocked scenario");
  } else if (overallVerdict !== "Blocked" && blockedIndex >= 0) {
    issues.push("a Blocked scenario requires an overall Blocked verdict");
  }

  const unexecutedIds = new Set(
    blockedIndex < 0
      ? []
      : executionRows.slice(blockedIndex + 1).map((row) => row.id),
  );
  const findingsByScenario = new Map<string, FindingRow[]>();
  for (const row of findingRows) {
    const rows = findingsByScenario.get(row.id) ?? [];
    rows.push(row);
    findingsByScenario.set(row.id, rows);
    if (unexecutedIds.has(row.id)) {
      if (
        row.status !== "Pending" ||
        [row.linkedIssue, row.owner, row.scopeBoundary, row.disposition].some(
          (value) => value !== "Pending",
        )
      ) {
        issues.push(`${row.id} finding must remain pending after the blocker`);
      }
      continue;
    }
    validateCompletedFindingRow(row, issues);
  }

  for (const [scenarioId, rows] of findingsByScenario) {
    const statuses = new Set(rows.map((row) => row.status));
    if (statuses.has("none observed") && statuses.size > 1) {
      issues.push(
        `${scenarioId} cannot mix none observed with recorded findings`,
      );
    }
  }

  const completedFindings = findingRows.filter(
    (row) => !unexecutedIds.has(row.id),
  );
  if (overallVerdict === "Accepted") {
    if (
      completedFindings.some((row) =>
        ["blocker", "must-fix"].includes(row.status),
      )
    ) {
      issues.push("Accepted overall verdict cannot retain blocking findings");
    }
  }
  if (overallVerdict === "Conditional") {
    const conditionalIds = new Set(
      executionRows
        .filter((row) => row.verdict === "Conditional")
        .map((row) => row.id),
    );
    if (
      !completedFindings.some(
        (row) => conditionalIds.has(row.id) && row.status !== "none observed",
      )
    ) {
      issues.push(
        "Conditional overall verdict requires a named non-clean finding",
      );
    }
    if (completedFindings.some((row) => row.status === "blocker")) {
      issues.push(
        "Conditional overall verdict cannot retain a blocker finding",
      );
    }
  }
  if (overallVerdict === "Blocked") {
    const blockedScenarioId = executionRows[blockedIndex]?.id;
    if (
      !completedFindings.some(
        (row) => row.id === blockedScenarioId && row.status === "blocker",
      )
    ) {
      issues.push(
        "Blocked overall verdict must bind the blocked scenario to a blocker finding",
      );
    }
  }

  if (
    (overallVerdict === "Accepted" || overallVerdict === "Conditional") &&
    checklist.some((entry) => !entry.checked)
  ) {
    issues.push(
      `${overallVerdict} overall verdict requires a completed checklist`,
    );
  }

  return issues;
}

export function validateP2zVisualUatRecord(markdown: string): void {
  const issues = collectP2zVisualUatRecordIssues(markdown);
  if (issues.length > 0) {
    throw new Error(`Invalid P2Z visual UAT record:\n- ${issues.join("\n- ")}`);
  }
}
