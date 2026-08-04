import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";

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
    route: string | "Any bounded route";
    expectedResult: string;
    pendingEvidence: string;
    findingRouteActors?: ReadonlyMap<string, ReadonlySet<string>>;
  }
> = {
  "P2Z-UAT-01": {
    viewport: "1440x900",
    persona: "HR operator",
    route: "/queue",
    expectedResult:
      "KPI, seven-day work queue, integration health, and recent drafts are visible",
    pendingEvidence:
      "[reference](evidence/p2z-webui/desktop-chromium-dashboard.png); run capture pending",
  },
  "P2Z-UAT-02": {
    viewport: "1440x900",
    persona: "HR operator",
    route: "/employee",
    expectedResult:
      "Masked profile, lifecycle timeline, and external IDs are visible",
    pendingEvidence:
      "[reference](evidence/p2z-webui/desktop-chromium-employee-detail.png); run capture pending",
  },
  "P2Z-UAT-03": {
    viewport: "1440x900",
    persona: "HR operator",
    route: "/transfer",
    expectedResult:
      "Step 3/5, input, impact preview, validation, and request detail are visible",
    pendingEvidence:
      "[reference](evidence/p2z-webui/desktop-chromium-transfer.png); run capture pending",
  },
  "P2Z-UAT-04": {
    viewport: "1440x900",
    persona: "HR operator then Approver",
    route: "/transfer -> /approvals",
    expectedResult:
      "Selected transfer evidence and separated reject/return/approve/cancel actions are visible",
    pendingEvidence:
      "[reference](evidence/p2z-webui/desktop-chromium-approval-inbox.png); run capture pending",
    findingRouteActors: new Map([
      ["/transfer", new Set(["HR operator"])],
      ["/approvals", new Set(["Approver"])],
    ]),
  },
  "P2Z-UAT-05": {
    viewport: "1440x900",
    persona: "HR Ops/support",
    route: "/ops",
    expectedResult:
      "Runtime KPI, recent runs, failed items, job detail, and DLQ decision are visible",
    pendingEvidence:
      "[reference](evidence/p2z-webui/desktop-chromium-job-monitor.png); run capture pending",
  },
  "P2Z-UAT-06": {
    viewport: "1440x900",
    persona: "HR Ops/support",
    route: "/audit",
    expectedResult:
      "One exact correlation lookup and evidence timeline are visible",
    pendingEvidence: "Run-specific Audit capture pending",
  },
  "P2Z-UAT-07": {
    viewport: "390x844",
    persona: "Any bounded persona",
    route: "Any bounded route",
    expectedResult:
      "Drawer opens explicitly, closes after route selection, and no primary action is lost",
    pendingEvidence:
      "[mobile references](evidence/p2z-webui/README.md); run capture pending",
  },
  "P2Z-UAT-08": {
    viewport: "1440x900",
    persona: "No persona",
    route: "/queue",
    expectedResult: "Workflows remain hidden and the bounded reason is visible",
    pendingEvidence: "Run-specific fail-closed entry capture pending",
  },
};

const boundedPersonaLabels = new Set([
  "HR operator",
  "Approver",
  "HR Ops/support",
  "Bounded admin",
]);

const boundedRoutesByPersona = new Map<string, ReadonlySet<string>>([
  [
    "HR operator",
    new Set([
      "/queue",
      "/employees",
      "/employee",
      "/lifecycle",
      "/onboarding",
      "/transfer",
      "/termination",
      "/csv",
    ]),
  ],
  ["Approver", new Set(["/queue", "/approvals", "/audit"])],
  [
    "HR Ops/support",
    new Set([
      "/queue",
      "/employees",
      "/employee",
      "/lifecycle",
      "/csv",
      "/ops",
      "/audit",
      "/support",
    ]),
  ],
  ["Bounded admin", new Set(["/queue", "/admin"])],
]);

const boundedTenantEnvironment = "repo_owned_synthetic_webui_non_production";

const githubAttachmentPattern =
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const githubIssuePattern =
  /^(?:#[1-9]\d*|https:\/\/github\.com\/TommyKammy\/HRCore\/issues\/[1-9]\d*)$/iu;

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
  route: string;
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

type ChecklistEntry = {
  label: string | undefined;
  status: string;
  disposition: string;
};

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

const checklistDispositions = new Set([
  "completed",
  "blocked",
  "workaround",
  "defect",
  "post-UAT backlog",
]);

const findingDispositionsByStatus = new Map<
  Exclude<P2zVisualUatFindingStatus, "Pending" | "none observed">,
  ReadonlySet<string>
>([
  ["blocker", new Set(["blocked"])],
  ["must-fix", new Set(["defect", "workaround"])],
  ["post-UAT", new Set(["post-UAT backlog"])],
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
    .split(/(?<!\\)\|/u)
    .slice(1, -1)
    .map((cell) => cell.replace(/\\\|/gu, "|").trim());
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
        route: cells[5] ?? "",
        expectedResult: cells[6] ?? "",
        actualResult: cells[7] ?? "",
        evidence: cells[8] ?? "",
        verdict: cells[9] ?? "",
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
        actor: cells[5] ?? "",
        tenantEnvironment: cells[6] ?? "",
        subjectBinding: cells[7] ?? "",
        routeViewport: cells[8] ?? "",
        correlationId: cells[9] ?? "",
        evidenceVersion: cells[10] ?? "",
        evidence: cells[11] ?? "",
        cleanupStatus: cells[12] ?? "",
        disposition: cells[13] ?? "",
      };
    });
}

function parseChecklist(checklist: string): ChecklistEntry[] {
  return checklist
    .split("\n")
    .filter((line) => /^\| .+ \| .+ \| .+ \|$/u.test(line))
    .map((line) => markdownCells(line))
    .filter(([label]) =>
      p2zVisualUatChecklistItems.includes(
        label as (typeof p2zVisualUatChecklistItems)[number],
      ),
    )
    .map(([label, status, disposition]) => ({
      label,
      status: status ?? "",
      disposition: disposition ?? "",
    }));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function isPastOrPresentIsoDate(value: string): boolean {
  return isIsoDate(value) && value <= new Date().toISOString().slice(0, 10);
}

function isSubstantive(value: string): boolean {
  return !/^(?:|Pending(?: assignment| actual persona| human execution)?|not applicable|n\/a|none|tbd|unknown)$/iu.test(
    value,
  );
}

function isMeaningfulObservation(value: string): boolean {
  const renderedText = value
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[`*_~>#|\\-]/gu, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const renderedCharacters = renderedText.match(/[\p{L}\p{N}]/gu) ?? [];
  return (
    isSubstantive(renderedText) &&
    /\p{L}/u.test(renderedText) &&
    renderedCharacters.length >= 8
  );
}

function hasStructuredTraceContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasStructuredTraceContent);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasStructuredTraceContent);
  }
  if (typeof value === "string") return value.trim().length > 0;
  return typeof value === "number" || typeof value === "boolean";
}

function trackedRepositoryArtifactIssue(
  rootDirectory: string,
  target: string,
): string | undefined {
  const repositoryPath = path.posix.join("docs", target);
  const absolutePath = path.join(rootDirectory, ...repositoryPath.split("/"));
  try {
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return "must be a tracked regular file";
    }
  } catch {
    return "must be an existing tracked regular file";
  }
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", repositoryPath], {
      cwd: rootDirectory,
      stdio: "ignore",
    });
  } catch {
    return "must be an existing tracked regular file";
  }

  let contents: Buffer;
  try {
    contents = readFileSync(absolutePath);
  } catch {
    return "must be a readable tracked regular file";
  }
  const extension = path.posix.extname(target).toLowerCase();
  try {
    if (extension === ".png") {
      const image = PNG.sync.read(contents);
      if (image.width < 1 || image.height < 1) throw new Error("empty image");
    } else if (extension === ".json") {
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(contents),
      );
      if (
        value === null ||
        typeof value !== "object" ||
        !hasStructuredTraceContent(value)
      ) {
        throw new Error("trace must contain structured events");
      }
    } else if (extension === ".txt" || extension === ".md") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
      if (!isSubstantive(text)) throw new Error("empty trace");
    } else {
      return "must use a validated png, json, txt, or md artifact";
    }
  } catch {
    return `must contain valid ${extension.slice(1)} content`;
  }
  return undefined;
}

function isRepositoryCommit(rootDirectory: string, commit: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: rootDirectory,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function validatePendingExecutionRow(
  row: ExecutionRow,
  issues: string[],
  context: string,
): void {
  const scenario =
    p2zVisualUatScenarioContracts[row.id as P2zVisualUatScenarioId];
  if (!scenario) {
    issues.push(`${row.id} must identify a supported UAT scenario`);
    return;
  }
  if (row.verdict !== "Pending") {
    issues.push(`${row.id} must remain pending ${context}`);
  }
  if (row.humanTester !== "Pending assignment") {
    issues.push(`${row.id} human tester must remain pending ${context}`);
  }
  if (row.executionDate !== "Pending") {
    issues.push(`${row.id} execution date must remain pending ${context}`);
  }
  if (row.actualResult !== "Pending human execution") {
    issues.push(`${row.id} actual result must remain pending ${context}`);
  }
  if (row.evidence !== scenario.pendingEvidence) {
    issues.push(`${row.id} run evidence must remain pending ${context}`);
  }
  if (row.viewport !== scenario.viewport) {
    issues.push(`${row.id} must retain viewport ${scenario.viewport}`);
  }
  const pendingPersona =
    scenario.persona === "Any bounded persona"
      ? "Pending actual persona"
      : scenario.persona;
  if (row.persona !== pendingPersona) {
    issues.push(`${row.id} must retain pending persona ${pendingPersona}`);
  }
  const pendingRoute =
    scenario.route === "Any bounded route"
      ? "Pending actual route"
      : scenario.route;
  if (row.route !== pendingRoute) {
    issues.push(`${row.id} must retain pending route ${pendingRoute}`);
  }
  if (row.expectedResult !== scenario.expectedResult) {
    issues.push(`${row.id} must retain its documented expected result`);
  }
}

function validateCompletedExecutionRow(
  row: ExecutionRow,
  testedCommit: string,
  evidenceTargets: Set<string>,
  issues: string[],
  rootDirectory: string,
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
  if (!isPastOrPresentIsoDate(row.executionDate)) {
    issues.push(`${row.id} must record a valid non-future ISO execution date`);
  }
  if (scenario.persona === "Any bounded persona") {
    if (!boundedPersonaLabels.has(row.persona)) {
      issues.push(`${row.id} must record a concrete bounded persona`);
    }
  } else if (row.persona !== scenario.persona) {
    issues.push(`${row.id} must use persona ${scenario.persona}`);
  }
  if (scenario.route === "Any bounded route") {
    if (!boundedRoutesByPersona.get(row.persona)?.has(row.route)) {
      issues.push(`${row.id} must record a route allowed for its persona`);
    }
  } else if (row.route !== scenario.route) {
    issues.push(`${row.id} must use route ${scenario.route}`);
  }
  if (row.expectedResult !== scenario.expectedResult) {
    issues.push(`${row.id} must retain its documented expected result`);
  }
  if (!isMeaningfulObservation(row.actualResult)) {
    issues.push(`${row.id} must record a meaningful actual observation`);
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
    `^evidence/p2z-webui/runs/${testedCommit}/${row.id}\\.(?:png|json|txt|md)$`,
    "u",
  );
  const repositoryTarget = links.find((target) =>
    repositoryArtifact.test(target),
  );
  const externalTarget = links.find((target) =>
    githubAttachmentPattern.test(target),
  );
  const artifact = repositoryTarget ?? externalTarget;
  if (!artifact) {
    issues.push(`${row.id} must link evidence for this run and scenario`);
  } else if (repositoryTarget) {
    const artifactIssue = trackedRepositoryArtifactIssue(
      rootDirectory,
      repositoryTarget,
    );
    if (artifactIssue) {
      issues.push(`${row.id} repository evidence ${artifactIssue}`);
    } else if (evidenceTargets.has(repositoryTarget)) {
      issues.push(
        `${row.id} must not reuse another scenario's evidence artifact`,
      );
    } else {
      evidenceTargets.add(repositoryTarget);
    }
  } else if (evidenceTargets.has(artifact)) {
    issues.push(
      `${row.id} must not reuse another scenario's evidence artifact`,
    );
  } else {
    evidenceTargets.add(artifact);
  }
}

function validateCompletedFindingRow(
  row: FindingRow,
  testedCommit: string,
  evidenceTargets: Set<string>,
  issues: string[],
  rootDirectory: string,
): void {
  if (!completedFindingStatuses.has(row.status as P2zVisualUatFindingStatus)) {
    issues.push(`${row.id} must use a completed finding status`);
    return;
  }
  const metadata = findingMetadata(row);
  if (row.status === "none observed") {
    if (metadata.some((value) => value !== "not applicable")) {
      issues.push(`${row.id} clean finding metadata must be not applicable`);
    }
    return;
  }
  if (!githubIssuePattern.test(row.linkedIssue)) {
    issues.push(`${row.id} recorded finding must link a GitHub Issue`);
  }
  for (const [name, value] of [
    ["owner", row.owner],
    ["scope boundary", row.scopeBoundary],
    ["actor", row.actor],
    ["subject binding", row.subjectBinding],
    ["route and viewport", row.routeViewport],
    ["evidence version", row.evidenceVersion],
  ] as const) {
    if (!isSubstantive(value)) {
      issues.push(`${row.id} recorded finding must include ${name}`);
    }
  }
  if (row.tenantEnvironment !== boundedTenantEnvironment) {
    issues.push(`${row.id} recorded finding must use the bounded environment`);
  }
  if (!boundedPersonaLabels.has(row.actor) && row.actor !== "No persona") {
    issues.push(`${row.id} recorded finding must use a bounded actor`);
  }
  if (!/^\/\S+ @ (?:1440x900|390x844)$/u.test(row.routeViewport)) {
    issues.push(`${row.id} recorded finding must bind route and viewport`);
  }
  if (row.id === "P2Z-UAT-06" && !isSubstantive(row.correlationId)) {
    issues.push(
      `${row.id} recorded finding must bind the Audit correlation ID`,
    );
  } else if (
    row.correlationId !== "not applicable" &&
    !isSubstantive(row.correlationId)
  ) {
    issues.push(
      `${row.id} recorded finding must include correlation ID or not applicable`,
    );
  }
  const evidenceTarget = row.evidence.match(/\]\(([^)]+)\)/u)?.[1];
  const repositoryEvidence = new RegExp(
    `^evidence/p2z-webui/runs/${testedCommit}/${row.id}-finding-[a-z0-9-]+\\.(?:png|json|txt|md)$`,
    "u",
  );
  if (
    !evidenceTarget ||
    (!repositoryEvidence.test(evidenceTarget) &&
      !githubAttachmentPattern.test(evidenceTarget))
  ) {
    issues.push(`${row.id} recorded finding must link its screenshot or trace`);
  } else if (repositoryEvidence.test(evidenceTarget)) {
    const artifactIssue = trackedRepositoryArtifactIssue(
      rootDirectory,
      evidenceTarget,
    );
    if (artifactIssue) {
      issues.push(`${row.id} recorded finding evidence ${artifactIssue}`);
    } else if (evidenceTargets.has(evidenceTarget)) {
      issues.push(`${row.id} findings must not reuse an evidence artifact`);
    } else {
      evidenceTargets.add(evidenceTarget);
    }
  } else if (evidenceTargets.has(evidenceTarget)) {
    issues.push(`${row.id} findings must not reuse an evidence artifact`);
  } else {
    evidenceTargets.add(evidenceTarget);
  }
  if (!new Set(["completed", "not required"]).has(row.cleanupStatus)) {
    issues.push(`${row.id} recorded finding must include cleanup status`);
  }
  if (!checklistDispositions.has(row.disposition)) {
    issues.push(`${row.id} recorded finding must use a supported disposition`);
  } else {
    const allowedDispositions = findingDispositionsByStatus.get(
      row.status as Exclude<
        P2zVisualUatFindingStatus,
        "Pending" | "none observed"
      >,
    );
    if (allowedDispositions && !allowedDispositions.has(row.disposition)) {
      issues.push(
        `${row.id} ${row.status} finding must use its matching disposition`,
      );
    }
  }
}

function findingMetadata(row: FindingRow): string[] {
  return [
    row.linkedIssue,
    row.owner,
    row.scopeBoundary,
    row.actor,
    row.tenantEnvironment,
    row.subjectBinding,
    row.routeViewport,
    row.correlationId,
    row.evidenceVersion,
    row.evidence,
    row.cleanupStatus,
    row.disposition,
  ];
}

function validateFindingScenarioBinding(
  finding: FindingRow,
  execution: ExecutionRow | undefined,
  issues: string[],
): void {
  if (!execution || finding.status === "none observed") return;
  const scenario =
    p2zVisualUatScenarioContracts[finding.id as P2zVisualUatScenarioId];
  if (!scenario) return;
  const routeViewport = finding.routeViewport.match(/^(\/\S+) @ (\d+x\d+)$/u);
  const route = routeViewport?.[1];
  const viewport = routeViewport?.[2];
  if (viewport && viewport !== execution.viewport) {
    issues.push(`${finding.id} finding viewport must match its execution row`);
  }

  if (!scenario.findingRouteActors && finding.actor !== execution.persona) {
    issues.push(`${finding.id} finding actor must match its execution row`);
  }

  if (scenario.findingRouteActors) {
    const allowedActors = route
      ? scenario.findingRouteActors.get(route)
      : undefined;
    if (!allowedActors?.has(finding.actor)) {
      issues.push(
        `${finding.id} finding route and actor must match a scenario leg`,
      );
    }
  } else if (scenario.route === "Any bounded route") {
    if (route !== execution.route) {
      issues.push(`${finding.id} finding route must match its execution row`);
    }
  } else if (route && route !== scenario.route) {
    issues.push(`${finding.id} finding route must match its scenario`);
  }
}

export function collectP2zVisualUatRecordIssues(
  markdown: string,
  rootDirectory = process.cwd(),
): string[] {
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
  const namedHumanTester = executionSection.match(
    /Named human tester: \*\*(.+?)\*\*/u,
  )?.[1];
  if (!namedHumanTester) issues.push("must record the named human tester");
  const verdictRecorder = executionSection.match(
    /Overall verdict recorded by: \*\*(.+?)\*\*/u,
  )?.[1];
  if (!verdictRecorder) issues.push("must record who assigned the verdict");
  const executionEnvironment = executionSection.match(
    /Execution environment\/dataset: \*\*(.+?)\*\*/u,
  )?.[1];
  if (executionEnvironment !== boundedTenantEnvironment) {
    issues.push(
      "must bind the formal run to the bounded execution environment",
    );
  }

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
        "| ID | Human tester | Execution date | Viewport | Persona | Route | Expected result | Actual result | Evidence | Scenario verdict |",
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
        "| ID | Finding status | Linked GitHub Issue | Owner | Scope boundary | Actor | Tenant/environment | Subject binding | Route and viewport | Correlation ID | Evidence version | Screenshot or trace | Cleanup status | Disposition |",
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
    !checklistSection
      .replace(/\s+/gu, " ")
      .includes("| Review item | Status | Disposition |")
  ) {
    issues.push("must keep the visual checklist record schema");
  }
  if (
    JSON.stringify(checklist.map((entry) => entry.label)) !==
    JSON.stringify(p2zVisualUatChecklistItems)
  ) {
    issues.push("must keep every required visual checklist item");
  }

  if (
    !overallVerdict ||
    !testedCommit ||
    !namedHumanTester ||
    !verdictRecorder
  ) {
    return issues;
  }
  if (overallVerdict === "Pending human execution") {
    if (
      testedCommit !== "Pending human execution" &&
      !/^[0-9a-f]{40}$/u.test(testedCommit)
    ) {
      issues.push(
        "pending UAT must use a pending or 40-character tested commit",
      );
    }
    if (
      /^[0-9a-f]{40}$/u.test(testedCommit) &&
      !isRepositoryCommit(rootDirectory, testedCommit)
    ) {
      issues.push("tested commit must resolve to a repository commit");
    }
    for (const row of executionRows) {
      validatePendingExecutionRow(
        row,
        issues,
        "under a pending overall verdict",
      );
    }
    if (
      findingRows.some(
        (row) =>
          row.status !== "Pending" ||
          findingMetadata(row).some((value) => value !== "Pending"),
      )
    ) {
      issues.push("pending UAT must keep every finding row pending");
    }
    if (
      checklist.some(
        (entry) =>
          entry.status !== "Pending" || entry.disposition !== "Pending",
      )
    ) {
      issues.push("pending UAT must keep the checklist incomplete");
    }
    if (
      namedHumanTester !== "Pending assignment" &&
      !isSubstantive(namedHumanTester)
    ) {
      issues.push("pending UAT must identify a valid assigned human tester");
    }
    if (verdictRecorder !== "Pending assignment") {
      issues.push("pending UAT must keep the verdict recorder pending");
    }
    return issues;
  }
  if (!/^[0-9a-f]{40}$/u.test(testedCommit)) {
    issues.push("completed UAT must bind to a 40-character tested commit");
    return issues;
  }
  if (!isRepositoryCommit(rootDirectory, testedCommit)) {
    issues.push("tested commit must resolve to a repository commit");
  }
  if (!isSubstantive(namedHumanTester)) {
    issues.push("completed UAT must identify the named human tester");
  }
  if (verdictRecorder !== namedHumanTester) {
    issues.push("the named human tester must record the overall verdict");
  }

  const evidenceTargets = new Set<string>();
  let blockedIndex = -1;
  for (const [index, row] of executionRows.entries()) {
    if (blockedIndex >= 0) {
      validatePendingExecutionRow(row, issues, "after the first blocker");
      continue;
    }
    if (row.verdict === "Pending") {
      issues.push(`${row.id} cannot be pending before a blocker`);
      continue;
    }
    validateCompletedExecutionRow(
      row,
      testedCommit,
      evidenceTargets,
      issues,
      rootDirectory,
    );
    if (row.humanTester !== namedHumanTester) {
      issues.push(`${row.id} must use the named human tester`);
    }
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
        findingMetadata(row).some((value) => value !== "Pending")
      ) {
        issues.push(`${row.id} finding must remain pending after the blocker`);
      }
      continue;
    }
    validateCompletedFindingRow(
      row,
      testedCommit,
      evidenceTargets,
      issues,
      rootDirectory,
    );
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
  const executionVerdictByScenario = new Map(
    executionRows.map((row) => [row.id, row.verdict]),
  );
  const executionByScenario = new Map(
    executionRows.map((row) => [row.id, row]),
  );
  for (const finding of completedFindings) {
    const scenarioVerdict = executionVerdictByScenario.get(finding.id);
    validateFindingScenarioBinding(
      finding,
      executionByScenario.get(finding.id),
      issues,
    );
    if (finding.status === "blocker" && scenarioVerdict !== "Blocked") {
      issues.push(`${finding.id} blocker finding requires a Blocked scenario`);
    }
    if (
      finding.status === "must-fix" &&
      scenarioVerdict !== "Conditional" &&
      scenarioVerdict !== "Blocked"
    ) {
      issues.push(
        `${finding.id} must-fix finding requires a Conditional or Blocked scenario`,
      );
    }
  }
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
    for (const conditionalId of conditionalIds) {
      if (
        !completedFindings.some(
          (row) => row.id === conditionalId && row.status === "must-fix",
        )
      ) {
        issues.push(
          `${conditionalId} Conditional scenario requires its own must-fix finding`,
        );
      }
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

  for (const entry of checklist) {
    if (entry.status === "Pending") {
      if (entry.disposition !== "Pending") {
        issues.push(
          "a pending checklist item must keep its disposition pending",
        );
      }
    } else if (
      entry.status !== "Completed" ||
      !checklistDispositions.has(entry.disposition)
    ) {
      issues.push(
        "a completed checklist item must use a supported disposition",
      );
    }
  }
  if (
    (overallVerdict === "Accepted" || overallVerdict === "Conditional") &&
    checklist.some((entry) => entry.status !== "Completed")
  ) {
    issues.push(
      `${overallVerdict} overall verdict requires a completed checklist`,
    );
  }
  const findingStatuses = new Set(completedFindings.map((row) => row.status));
  const checklistDispositionValues = new Set(
    checklist.map((entry) => entry.disposition),
  );
  if (
    overallVerdict === "Accepted" &&
    checklist.some((entry) =>
      new Set(["blocked", "defect", "workaround"]).has(entry.disposition),
    )
  ) {
    issues.push("Accepted overall verdict cannot retain adverse dispositions");
  }
  if (
    overallVerdict === "Conditional" &&
    checklistDispositionValues.has("blocked")
  ) {
    issues.push(
      "Conditional overall verdict cannot retain blocked disposition",
    );
  }
  if (
    findingStatuses.has("must-fix") &&
    !checklist.some((entry) =>
      new Set(["defect", "workaround"]).has(entry.disposition),
    )
  ) {
    issues.push(
      "must-fix findings require a defect or workaround checklist disposition",
    );
  }
  if (
    findingStatuses.has("post-UAT") &&
    !checklistDispositionValues.has("post-UAT backlog")
  ) {
    issues.push("post-UAT findings require a backlog checklist disposition");
  }
  if (
    checklistDispositionValues.has("post-UAT backlog") &&
    !findingStatuses.has("post-UAT")
  ) {
    issues.push("post-UAT backlog disposition requires a matching finding");
  }
  if (
    overallVerdict === "Blocked" &&
    !checklist.some((entry) => entry.disposition === "blocked")
  ) {
    issues.push(
      "Blocked overall verdict requires a blocked checklist disposition",
    );
  }

  return issues;
}

export function validateP2zVisualUatRecord(
  markdown: string,
  rootDirectory = process.cwd(),
): void {
  const issues = collectP2zVisualUatRecordIssues(markdown, rootDirectory);
  if (issues.length > 0) {
    throw new Error(`Invalid P2Z visual UAT record:\n- ${issues.join("\n- ")}`);
  }
}
