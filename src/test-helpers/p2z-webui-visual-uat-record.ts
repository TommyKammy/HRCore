import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";

import {
  parseP2zVisualUatFindingIssueReference,
  p2zVisualUatFindingIssueRegistryPath,
  validateP2zVisualUatFindingIssueRegistry,
} from "./p2z-webui-visual-uat-issue-registry.js";
import { p2zVisualEvidenceProjects } from "../p2z-webui-visual-evidence-contract.js";

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
    subjectBinding?: string;
    requiresCorrelationId?: boolean;
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
    subjectBinding: "EMP-000128",
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
    requiresCorrelationId: true,
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
  subjectBinding: string;
  correlationId: string;
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

const findingStatusByChecklistDisposition = new Map<
  string,
  Exclude<P2zVisualUatFindingStatus, "Pending" | "none observed">
>([
  ["blocked", "blocker"],
  ["defect", "must-fix"],
  ["workaround", "must-fix"],
  ["post-UAT backlog", "post-UAT"],
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

const verdictBoundaryHeader = ["Decision surface", "Current verdict"] as const;

const executionRecordHeader = [
  "ID",
  "Human tester",
  "Execution date",
  "Viewport",
  "Persona",
  "Route",
  "Subject binding",
  "Correlation ID",
  "Expected result",
  "Actual result",
  "Evidence",
  "Scenario verdict",
] as const;

const findingRecordHeader = [
  "ID",
  "Finding status",
  "Linked GitHub Issue",
  "Owner",
  "Scope boundary",
  "Actor",
  "Tenant/environment",
  "Subject binding",
  "Route and viewport",
  "Correlation ID",
  "Evidence version",
  "Screenshot or trace",
  "Cleanup status",
  "Disposition",
] as const;

const visualChecklistHeader = ["Review item", "Status", "Disposition"] as const;

function markdownCells(line: string): string[] {
  const cells: string[] = [];
  let cellStart = 0;
  let precedingBackslashes = 0;
  let endsWithDelimiter = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\\") {
      precedingBackslashes += 1;
      continue;
    }
    if (character === "|" && precedingBackslashes % 2 === 0) {
      cells.push(line.slice(cellStart, index));
      cellStart = index + 1;
      endsWithDelimiter = index === line.length - 1;
    }
    precedingBackslashes = 0;
  }
  cells.push(line.slice(cellStart));
  if (line.startsWith("|")) cells.shift();
  if (endsWithDelimiter) cells.pop();
  return cells.map((cell) => cell.replace(/\\\|/gu, "|").trim());
}

function parseCanonicalMarkdownTable(
  markdownSection: string,
  expectedHeader: readonly string[],
): string[][] | undefined {
  const lines = markdownSection.split("\n");
  const headerIndexes = lines.flatMap((line, index) =>
    line.startsWith("|") &&
    line.endsWith("|") &&
    JSON.stringify(markdownCells(line)) === JSON.stringify(expectedHeader)
      ? [index]
      : [],
  );
  if (headerIndexes.length !== 1) return undefined;
  const headerIndex = headerIndexes[0]!;
  const isTableShapedLine = (line: string): boolean =>
    line.includes("|") && markdownCells(line).length === expectedHeader.length;
  const linesBeforeHeader = lines.slice(0, headerIndex);
  if (
    linesBeforeHeader.some(
      (line) => line.startsWith("|") || isTableShapedLine(line),
    )
  ) {
    return undefined;
  }

  const delimiterLine = lines[headerIndex + 1] ?? "";
  const delimiter = markdownCells(delimiterLine);
  if (
    !delimiterLine.startsWith("|") ||
    !delimiterLine.endsWith("|") ||
    delimiter.length !== expectedHeader.length ||
    !delimiter.every((cell) => /^:?-{3,}:?$/u.test(cell))
  ) {
    return undefined;
  }

  const dataRows: string[][] = [];
  let nextLineIndex = headerIndex + 2;
  while (lines[nextLineIndex]?.startsWith("|")) {
    const row = lines[nextLineIndex] ?? "";
    if (!row.endsWith("|")) return undefined;
    const cells = markdownCells(row);
    if (cells.length !== expectedHeader.length) return undefined;
    dataRows.push(cells);
    nextLineIndex += 1;
  }
  const linesAfterTable = lines.slice(nextLineIndex);
  if (
    linesAfterTable.some(
      (line) => line.startsWith("|") || isTableShapedLine(line),
    )
  ) {
    return undefined;
  }
  return dataRows;
}

const htmlRawClosingTagElements = new Set([
  "pre",
  "script",
  "style",
  "textarea",
]);

const htmlBlockTagElements = new Set([
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul",
]);

const formalSectionLabels = new Set([
  "Verdict Boundary",
  "Backend Integration Boundary",
  "Human Execution Record",
  "Scenario Finding Record",
  "Visual Review Checklist",
  "Evidence Matrix",
]);

function canonicalRenderedMarkdownLine(line: string): string {
  const tableLine = line.match(/^ {0,3}(\|.*)$/u)?.[1];
  if (tableLine) return tableLine;

  const heading = line.match(/^ {0,3}(#{1,6})(?:[\t ]+(.*)|[\t ]*)$/u);
  if (!heading) return line;
  const marker = heading[1] ?? "";
  const label = (heading[2] ?? "").replace(/[\t ]+#+[\t ]*$/u, "").trim();
  return label ? `${marker} ${label}` : marker;
}

function hiddenMarkdownReferenceDefinitionLineCount(
  lines: readonly string[],
  startIndex: number,
): number {
  const definition = lines[startIndex]?.match(
    /^ {0,3}\[(?!\^)(?:\\.|[^\]\\])+\]:[\t ]*(.*)$/u,
  );
  if (!definition) return 0;

  const destinationAndTitle =
    /^(?:<[^<>\n]*>|[^\s]+)(?:[\t ]+(?:"[^"\n]*"|'[^'\n]*'|\([^\n)]*\)))?$/u;
  let consumedLines = 1;
  const inlineDestination = definition[1]?.trim() ?? "";
  if (inlineDestination) {
    if (!destinationAndTitle.test(inlineDestination)) return 0;
  } else {
    const continuedDestination =
      lines[startIndex + 1]?.match(/^ {0,3}(\S.*)$/u)?.[1];
    if (
      !continuedDestination ||
      !destinationAndTitle.test(continuedDestination.trim())
    ) {
      return 0;
    }
    consumedLines += 1;
  }

  const possibleTitle = lines[startIndex + consumedLines]?.match(
    /^ {0,3}("[^"\n]*"|'[^'\n]*'|\([^\n)]*\))[\t ]*$/u,
  );
  return consumedLines + (possibleTitle ? 1 : 0);
}

function stripMarkdownHtmlComments(markdown: string): string {
  let cursor = 0;
  let rendered = "";
  while (cursor < markdown.length) {
    const opener = markdown.indexOf("<!--", cursor);
    if (opener < 0) {
      rendered += markdown.slice(cursor);
      break;
    }

    let precedingBackslashes = 0;
    for (
      let index = opener - 1;
      index >= 0 && markdown[index] === "\\";
      index -= 1
    ) {
      precedingBackslashes += 1;
    }
    if (precedingBackslashes % 2 === 1) {
      rendered += markdown.slice(cursor, opener + 4);
      cursor = opener + 4;
      continue;
    }

    rendered += markdown.slice(cursor, opener);
    const closingMarker = markdown.indexOf("-->", opener + 4);
    const commentEnd = closingMarker < 0 ? markdown.length : closingMarker + 3;
    rendered += markdown.slice(opener, commentEnd).replace(/[^\n]/gu, " ");
    cursor = commentEnd;
  }
  return rendered;
}

function renderedMarkdown(markdown: string): string {
  const withoutComments = stripMarkdownHtmlComments(
    markdown.replace(/\r\n?/gu, "\n"),
  );
  let fence: { marker: string; length: number } | undefined;
  let htmlBlockClosingToken: string | undefined;
  let htmlBlockEndsAtBlankLine = false;
  let paragraphOpen = false;
  const lines = withoutComments
    .split("\n")
    .map((line) => line.replace(/^ {0,3}(?:>[\t ]?)+/u, ""))
    .map((line) =>
      line.replace(
        /^ {0,3}(?:(?:[-+*]|\d{1,9}[.)])[\t ]+)+(?:\[[ xX]\][\t ]+)?/u,
        "",
      ),
    );
  const renderedLines: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (fence) {
      if (
        marker?.[0] === fence.marker &&
        marker.length >= fence.length &&
        /^ {0,3}(?:`{3,}|~{3,})\s*$/u.test(line)
      ) {
        fence = undefined;
      }
      renderedLines.push("");
      paragraphOpen = false;
      continue;
    }
    if (htmlBlockClosingToken) {
      if (line.toLowerCase().includes(htmlBlockClosingToken)) {
        htmlBlockClosingToken = undefined;
      }
      renderedLines.push("");
      paragraphOpen = false;
      continue;
    }
    if (htmlBlockEndsAtBlankLine) {
      if (line.trim() === "") {
        htmlBlockEndsAtBlankLine = false;
      }
      renderedLines.push("");
      paragraphOpen = false;
      continue;
    }
    if (marker) {
      fence = { marker: marker[0] ?? "", length: marker.length };
      renderedLines.push("");
      paragraphOpen = false;
      continue;
    }
    const rawHtmlBlockClosingToken = /^ {0,3}<\?/u.test(line)
      ? "?>"
      : /^ {0,3}<!\[CDATA\[/u.test(line)
        ? "]]>"
        : /^ {0,3}<![A-Z]/u.test(line)
          ? ">"
          : undefined;
    if (rawHtmlBlockClosingToken) {
      if (!line.includes(rawHtmlBlockClosingToken)) {
        htmlBlockClosingToken = rawHtmlBlockClosingToken;
      }
      renderedLines.push("");
      paragraphOpen = false;
      continue;
    }
    const markdownAutolink =
      /^ {0,3}<(?:[a-z][a-z0-9+.-]{1,31}:[^ <>]*|[^ <>@]+@[^ <>@]+)>/iu.test(
        line,
      );
    const htmlOpening = markdownAutolink
      ? null
      : line.match(/^ {0,3}<([a-z][a-z0-9-]*)\b[^>]*>/iu);
    if (htmlOpening) {
      const tag = htmlOpening[1]?.toLowerCase() ?? "";
      const standaloneGenericTag =
        /^ {0,3}<[a-z][a-z0-9-]*\b[^>]*>[\t ]*$/iu.test(line);
      if (htmlRawClosingTagElements.has(tag)) {
        if (!line.toLowerCase().includes(`</${tag}>`)) {
          htmlBlockClosingToken = `</${tag}>`;
        }
      } else if (
        htmlBlockTagElements.has(tag) ||
        (!paragraphOpen && standaloneGenericTag)
      ) {
        htmlBlockEndsAtBlankLine = true;
      } else {
        renderedLines.push(canonicalRenderedMarkdownLine(line));
        paragraphOpen = true;
        continue;
      }
      renderedLines.push("");
      paragraphOpen = false;
      continue;
    }
    const htmlClosing = line.match(/^ {0,3}<\/([a-z][a-z0-9-]*)[\t ]*>/iu);
    if (htmlClosing) {
      const tag = htmlClosing[1]?.toLowerCase() ?? "";
      const standaloneGenericTag =
        /^ {0,3}<\/[a-z][a-z0-9-]*[\t ]*>[\t ]*$/iu.test(line);
      if (
        htmlBlockTagElements.has(tag) ||
        (!paragraphOpen && standaloneGenericTag)
      ) {
        htmlBlockEndsAtBlankLine = true;
        renderedLines.push("");
        paragraphOpen = false;
        continue;
      }
    }
    const referenceDefinitionLines = hiddenMarkdownReferenceDefinitionLineCount(
      lines,
      index,
    );
    if (referenceDefinitionLines > 0) {
      renderedLines.push(...Array<string>(referenceDefinitionLines).fill(""));
      index += referenceDefinitionLines - 1;
      paragraphOpen = false;
      continue;
    }
    const setextUnderline = lines[index + 1]?.match(/^ {0,3}-+[\t ]*$/u);
    const setextLabel = line.trim();
    if (
      setextUnderline &&
      !/^(?: {4}|\t)/u.test(line) &&
      formalSectionLabels.has(setextLabel)
    ) {
      renderedLines.push(`## ${setextLabel}`, "");
      index += 1;
      paragraphOpen = false;
      continue;
    }
    const indentedCode = /^(?: {4}|\t)/u.test(line);
    const renderedLine = indentedCode
      ? ""
      : canonicalRenderedMarkdownLine(line);
    renderedLines.push(renderedLine);
    paragraphOpen =
      !indentedCode &&
      line.trim() !== "" &&
      !/^ {0,3}#{1,6}(?:[\t ]|$)/u.test(line) &&
      !/^ {0,3}\|/u.test(line);
  }
  return renderedLines.join("\n");
}

function section(
  markdown: string,
  startHeading: string,
  endHeading: string,
  issues: string[],
): string {
  const lines = markdown.split("\n");
  const starts = lines.flatMap((line, index) =>
    line === startHeading ? [index] : [],
  );
  const ends = lines.flatMap((line, index) =>
    line === endHeading ? [index] : [],
  );
  const start = starts[0] ?? -1;
  const end = ends[0] ?? -1;
  if (starts.length !== 1 || ends.length !== 1 || end <= start) {
    issues.push(
      `must keep exactly one ${startHeading} before exactly one ${endHeading}`,
    );
    return "";
  }
  const interveningSection = lines
    .slice(start + 1, end)
    .some((line) => /^#{1,2}(?:[\t ]|$)/u.test(line));
  if (interveningSection) {
    issues.push(
      `must keep ${startHeading} content before ${endHeading} without an intervening section`,
    );
    return "";
  }
  return lines.slice(start, end).join("\n");
}

function singletonDeclaration(
  record: string,
  pattern: RegExp,
  issue: string,
  issues: string[],
): string | undefined {
  const matches = Array.from(record.matchAll(pattern));
  if (matches.length !== 1) {
    issues.push(issue);
    return undefined;
  }
  return matches[0]?.[1];
}

export function p2zVisualUatTestedCommitFromRecord(
  markdown: string,
): string | undefined {
  const issues: string[] = [];
  const executionSection = section(
    renderedMarkdown(markdown),
    "## Human Execution Record",
    "## Scenario Finding Record",
    issues,
  );
  const testedCommit = singletonDeclaration(
    executionSection,
    /^Tested commit: \*\*(Pending human execution|[0-9a-f]{40})\*\*$/gmu,
    "must record exactly one tested commit",
    issues,
  );
  return issues.length === 0 && /^[0-9a-f]{40}$/u.test(testedCommit ?? "")
    ? testedCommit
    : undefined;
}

function parseExecutionRows(rows: readonly string[][]): ExecutionRow[] {
  return rows.map((cells) => ({
    id: cells[0] ?? "",
    humanTester: cells[1] ?? "",
    executionDate: cells[2] ?? "",
    viewport: cells[3] ?? "",
    persona: cells[4] ?? "",
    route: cells[5] ?? "",
    subjectBinding: cells[6] ?? "",
    correlationId: cells[7] ?? "",
    expectedResult: cells[8] ?? "",
    actualResult: cells[9] ?? "",
    evidence: cells[10] ?? "",
    verdict: cells[11] ?? "",
  }));
}

function parseFindingRows(rows: readonly string[][]): FindingRow[] {
  return rows.map((cells) => ({
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
  }));
}

function parseChecklist(rows: readonly string[][]): ChecklistEntry[] {
  return rows.map(([label, status, disposition]) => ({
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

function utcIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isPastOrPresentIsoDate(
  value: string,
  validationTime = new Date(),
): boolean {
  return isIsoDate(value) && value <= utcIsoDate(validationTime);
}

function isSubstantive(value: string): boolean {
  return !/^(?:|Pending(?: assignment| actual persona| human execution)?|not applicable|n\/a|none|tbd|unknown)$/iu.test(
    value,
  );
}

function renderedText(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]+\)/gu, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<[^>]*>/gu, " ")
    .replace(/[`*_~>#|\\-]/gu, " ")
    .replace(/&(?:[a-z]+|#\d+|#x[0-9a-f]+);/giu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isVisibleSubstantive(value: string): boolean {
  const visibleText = renderedText(value);
  return isSubstantive(visibleText) && /[\p{L}\p{N}]/u.test(visibleText);
}

function isVisibleConcreteSubject(value: string): boolean {
  const visibleText = renderedText(value);
  const withoutBoundaryPunctuation = visibleText
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, "")
    .trim();
  return (
    isVisibleSubstantive(value) && isSubstantive(withoutBoundaryPunctuation)
  );
}

function isMeaningfulObservation(value: string): boolean {
  const visibleText = renderedText(value);
  const renderedCharacters = visibleText.match(/[\p{L}\p{N}]/gu) ?? [];
  const substantiveWords = Array.from(
    new Intl.Segmenter("und", { granularity: "word" }).segment(visibleText),
  ).filter((segment) => segment.isWordLike);
  return (
    isSubstantive(visibleText) &&
    /\p{L}/u.test(visibleText) &&
    renderedCharacters.length >= 8 &&
    substantiveWords.length >= 2
  );
}

function isMeaningfulIdentity(value: string): boolean {
  const visibleText = renderedText(value);
  const renderedCharacters = visibleText.match(/[\p{L}\p{N}]/gu) ?? [];
  return (
    isSubstantive(visibleText) &&
    /\p{L}/u.test(visibleText) &&
    renderedCharacters.length >= 2
  );
}

function hasStructuredTraceEvents(value: unknown): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const events = (value as Record<string, unknown>).events;
  if (!Array.isArray(events) || events.length === 0) return false;
  return events.every((event) => {
    if (event === null || typeof event !== "object" || Array.isArray(event)) {
      return false;
    }
    const eventRecord = event as Record<string, unknown>;
    return [eventRecord.type, eventRecord.eventType].some(
      (discriminator) =>
        typeof discriminator === "string" &&
        isVisibleSubstantive(discriminator),
    );
  });
}

type TrackedRepositoryFileResult = { contents: Buffer } | { issue: string };

function readTrackedRegularRepositoryFile(
  rootDirectory: string,
  repositoryPath: string,
): TrackedRepositoryFileResult {
  const absolutePath = path.join(rootDirectory, ...repositoryPath.split("/"));
  try {
    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return { issue: "must be a tracked regular file" };
    }
  } catch {
    return { issue: "must be an existing tracked regular file" };
  }
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", "--", repositoryPath], {
      cwd: rootDirectory,
      stdio: "ignore",
    });
  } catch {
    return { issue: "must be an existing tracked regular file" };
  }
  try {
    return { contents: readFileSync(absolutePath) };
  } catch {
    return { issue: "must be a readable tracked regular file" };
  }
}

const pngSignature = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const maximumPngDimension = 16_384;
const maximumPngPixels = 16_777_216;

function pngPixelDigest(contents: Buffer): string | undefined {
  try {
    const image = PNG.sync.read(contents);
    return createHash("sha256")
      .update(`${image.width}x${image.height}\0`)
      .update(image.data)
      .digest("hex");
  } catch {
    return undefined;
  }
}

function boundedPngHeaderDimensions(
  contents: Buffer,
): { width: number; height: number } | undefined {
  if (
    contents.length < 24 ||
    !contents.subarray(0, pngSignature.length).equals(pngSignature) ||
    contents.readUInt32BE(8) !== 13 ||
    contents.toString("ascii", 12, 16) !== "IHDR"
  ) {
    return undefined;
  }
  const width = contents.readUInt32BE(16);
  const height = contents.readUInt32BE(20);
  if (
    width < 1 ||
    height < 1 ||
    width > maximumPngDimension ||
    height > maximumPngDimension ||
    width * height > maximumPngPixels
  ) {
    return undefined;
  }
  return { width, height };
}

function duplicatesAutomatedReferencePng(
  rootDirectory: string,
  contents: Buffer,
): boolean {
  const candidateDigest = pngPixelDigest(contents);
  if (!candidateDigest) return false;

  let trackedPaths: string[];
  try {
    trackedPaths = execFileSync(
      "git",
      ["ls-files", "-z", "--", "docs/evidence/p2z-webui"],
      { cwd: rootDirectory, encoding: "utf8" },
    )
      .split("\0")
      .filter((repositoryPath) =>
        /^docs\/evidence\/p2z-webui\/[^/]+\.png$/u.test(repositoryPath),
      );
  } catch {
    return false;
  }

  return trackedPaths.some((repositoryPath) => {
    const reference = readTrackedRegularRepositoryFile(
      rootDirectory,
      repositoryPath,
    );
    return (
      !("issue" in reference) &&
      pngPixelDigest(reference.contents) === candidateDigest
    );
  });
}

function hasMeaningfulPngContent(image: {
  width: number;
  height: number;
  data: Buffer;
}): boolean {
  const histogram = new Uint32Array(4096);
  let dominantPixels = 0;
  const pixelCount = image.width * image.height;
  for (let offset = 0; offset < image.data.length; offset += 4) {
    const alpha = (image.data[offset + 3] ?? 0) / 255;
    const red = Math.round(
      (image.data[offset] ?? 0) * alpha + 255 * (1 - alpha),
    );
    const green = Math.round(
      (image.data[offset + 1] ?? 0) * alpha + 255 * (1 - alpha),
    );
    const blue = Math.round(
      (image.data[offset + 2] ?? 0) * alpha + 255 * (1 - alpha),
    );
    const bucket = (red >> 4) * 256 + (green >> 4) * 16 + (blue >> 4);
    const count = (histogram[bucket] ?? 0) + 1;
    histogram[bucket] = count;
    dominantPixels = Math.max(dominantPixels, count);
  }
  const minimumVisiblePixels = Math.max(256, Math.ceil(pixelCount * 0.001));
  return pixelCount - dominantPixels >= minimumVisiblePixels;
}

function trackedRepositoryArtifactIssue(
  rootDirectory: string,
  target: string,
  expectedViewport?: string,
): string | undefined {
  const repositoryPath = path.posix.join("docs", target);
  const trackedFile = readTrackedRegularRepositoryFile(
    rootDirectory,
    repositoryPath,
  );
  if ("issue" in trackedFile) return trackedFile.issue;
  const { contents } = trackedFile;
  const extension = path.posix.extname(target).toLowerCase();
  try {
    if (extension === ".png") {
      const dimensions = boundedPngHeaderDimensions(contents);
      if (!dimensions) {
        return `must stay within safe decode bounds (${maximumPngDimension}px per side and ${maximumPngPixels} total pixels)`;
      }
      if (duplicatesAutomatedReferencePng(rootDirectory, contents)) {
        return "must not duplicate an automated reference screenshot";
      }
      const captureContract = [
        p2zVisualEvidenceProjects["desktop-chromium"],
        p2zVisualEvidenceProjects["mobile-chromium"],
      ].find(
        ({ viewport }) =>
          `${viewport.width}x${viewport.height}` === expectedViewport,
      );
      if (
        captureContract &&
        (dimensions.width !==
          captureContract.viewport.width * captureContract.deviceScaleFactor ||
          dimensions.height <
            captureContract.viewport.height * captureContract.deviceScaleFactor)
      ) {
        const expectedPixelWidth =
          captureContract.viewport.width * captureContract.deviceScaleFactor;
        const minimumPixelHeight =
          captureContract.viewport.height * captureContract.deviceScaleFactor;
        return `must match the recorded ${expectedViewport} capture geometry (${expectedPixelWidth}px wide and at least ${minimumPixelHeight}px high)`;
      }
      const image = PNG.sync.read(contents);
      if (!hasMeaningfulPngContent(image)) {
        return "must contain meaningful visual content";
      }
    } else if (extension === ".json") {
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(contents),
      );
      if (!hasStructuredTraceEvents(value)) {
        throw new Error("trace must contain structured events");
      }
    } else if (extension === ".txt" || extension === ".md") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(contents);
      const visibleText = extension === ".md" ? renderedMarkdown(text) : text;
      if (!isMeaningfulObservation(visibleText)) {
        throw new Error("empty trace");
      }
    } else {
      return "must use a validated png, json, txt, or md artifact";
    }
  } catch {
    return `must contain valid ${extension.slice(1)} content`;
  }
  return undefined;
}

function trackedRepositoryArtifactDigest(
  rootDirectory: string,
  target: string,
): string | undefined {
  const trackedFile = readTrackedRegularRepositoryFile(
    rootDirectory,
    path.posix.join("docs", target),
  );
  if ("issue" in trackedFile) return undefined;
  const hash = createHash("sha256");
  if (path.posix.extname(target).toLowerCase() === ".png") {
    return pngPixelDigest(trackedFile.contents);
  } else {
    hash.update(trackedFile.contents);
  }
  return hash.digest("hex");
}

function evidenceReuseKind(
  evidenceTargets: Set<string>,
  rootDirectory: string,
  target: string,
): "path" | "content" | undefined {
  if (evidenceTargets.has(target)) return "path";
  const digest = trackedRepositoryArtifactDigest(rootDirectory, target);
  const digestKey = digest ? `sha256:${digest}` : undefined;
  if (digestKey && evidenceTargets.has(digestKey)) return "content";
  evidenceTargets.add(target);
  if (digestKey) evidenceTargets.add(digestKey);
  return undefined;
}

function renderedMarkdownLinkTargets(value: string): string[] {
  const withoutCodeSpans = value.replace(/(`+)([\s\S]*?)\1/gu, "");
  return Array.from(
    withoutCodeSpans.matchAll(
      /\]\([\t ]*(?:<((?:\\.|[^<>\n\\])*)>|((?:\\.|[^\s()\\])+))(?:[\t ]+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?[\t ]*\)/gu,
    ),
    (match) => (match[1] ?? match[2] ?? "").replace(/\\(.)/gu, "$1"),
  );
}

function repositoryCommitIssue(
  rootDirectory: string,
  commit: string,
): string | undefined {
  try {
    execFileSync("git", ["cat-file", "-e", `${commit}^{commit}`], {
      cwd: rootDirectory,
      stdio: "ignore",
    });
  } catch {
    return "must resolve to a repository commit";
  }
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", commit, "HEAD"], {
      cwd: rootDirectory,
      stdio: "ignore",
    });
  } catch {
    return "must be an ancestor of repository HEAD";
  }
  return undefined;
}

function repositoryCommitDate(
  rootDirectory: string,
  commit: string,
): string | undefined {
  try {
    const timestamp = execFileSync(
      "git",
      ["show", "-s", "--format=%cI", commit],
      {
        cwd: rootDirectory,
        encoding: "utf8",
      },
    ).trim();
    const date = new Date(timestamp);
    return Number.isNaN(date.valueOf()) ? undefined : utcIsoDate(date);
  } catch {
    return undefined;
  }
}

function repositoryPostTestProductChanges(
  rootDirectory: string,
  testedCommit: string,
): string[] | undefined {
  try {
    const changedPaths = execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        "--no-renames",
        "-z",
        `${testedCommit}..HEAD`,
        "--",
      ],
      { cwd: rootDirectory, encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    const runEvidencePrefix = `docs/evidence/p2z-webui/runs/${testedCommit}/`;
    return changedPaths.filter(
      (repositoryPath) =>
        repositoryPath !== "docs/p2z-webui-visual-uat-package.md" &&
        !repositoryPath.startsWith(runEvidencePrefix),
    );
  } catch {
    return undefined;
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
  const subjectBinding = scenario.subjectBinding ?? "not applicable";
  if (row.subjectBinding !== subjectBinding) {
    issues.push(`${row.id} must retain subject binding ${subjectBinding}`);
  }
  const pendingCorrelationId = scenario.requiresCorrelationId
    ? "Pending exact correlation ID"
    : "not applicable";
  if (row.correlationId !== pendingCorrelationId) {
    issues.push(`${row.id} must retain correlation ID ${pendingCorrelationId}`);
  }
  if (row.expectedResult !== scenario.expectedResult) {
    issues.push(`${row.id} must retain its documented expected result`);
  }
}

function validateCompletedExecutionRow(
  row: ExecutionRow,
  testedCommit: string,
  testedCommitDate: string | undefined,
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
  if (!isMeaningfulIdentity(row.humanTester)) {
    issues.push(`${row.id} must identify the human tester`);
  }
  if (!isPastOrPresentIsoDate(row.executionDate)) {
    issues.push(`${row.id} must record a valid non-future ISO execution date`);
  } else if (testedCommitDate && row.executionDate < testedCommitDate) {
    issues.push(`${row.id} execution date must not predate the tested commit`);
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
  const subjectBinding = scenario.subjectBinding ?? "not applicable";
  if (row.subjectBinding !== subjectBinding) {
    issues.push(`${row.id} must use subject binding ${subjectBinding}`);
  }
  if (scenario.requiresCorrelationId) {
    if (!isMeaningfulIdentity(row.correlationId)) {
      issues.push(`${row.id} must record an exact correlation ID`);
    }
  } else if (row.correlationId !== "not applicable") {
    issues.push(`${row.id} must use correlation ID not applicable`);
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

  const links = renderedMarkdownLinkTargets(row.evidence);
  const repositoryArtifact = new RegExp(
    `^evidence/p2z-webui/runs/${testedCommit}/${row.id}\\.(?:png|json|txt|md)$`,
    "u",
  );
  const repositoryTarget = links.find((target) =>
    repositoryArtifact.test(target),
  );
  if (!repositoryTarget) {
    issues.push(
      `${row.id} must link repository evidence for this run and scenario`,
    );
  } else {
    const artifactIssue = trackedRepositoryArtifactIssue(
      rootDirectory,
      repositoryTarget,
      row.viewport,
    );
    if (artifactIssue) {
      issues.push(`${row.id} repository evidence ${artifactIssue}`);
    } else if (
      evidenceReuseKind(evidenceTargets, rootDirectory, repositoryTarget)
    ) {
      issues.push(
        `${row.id} must not reuse another scenario's evidence artifact`,
      );
    }
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
  const scenario =
    p2zVisualUatScenarioContracts[row.id as P2zVisualUatScenarioId];
  if (row.status === "none observed") {
    if (metadata.some((value) => value !== "not applicable")) {
      issues.push(`${row.id} clean finding metadata must be not applicable`);
    }
    return;
  }
  if (parseP2zVisualUatFindingIssueReference(row.linkedIssue) === undefined) {
    issues.push(`${row.id} recorded finding must link a GitHub Issue`);
  }
  if (!isMeaningfulIdentity(row.owner)) {
    issues.push(
      `${row.id} recorded finding must include owner as a visible identity`,
    );
  }
  for (const [name, value] of [
    ["scope boundary", row.scopeBoundary],
    ["actor", row.actor],
    ["route and viewport", row.routeViewport],
    ["evidence version", row.evidenceVersion],
  ] as const) {
    if (!isVisibleSubstantive(value)) {
      issues.push(
        `${row.id} recorded finding must include ${name} as visible text`,
      );
    }
  }
  if (row.tenantEnvironment !== boundedTenantEnvironment) {
    issues.push(`${row.id} recorded finding must use the bounded environment`);
  }
  if (!boundedPersonaLabels.has(row.actor) && row.actor !== "No persona") {
    issues.push(`${row.id} recorded finding must use a bounded actor`);
  }
  const routeViewport = row.routeViewport.match(
    /^\/\S+ @ (1440x900|390x844)$/u,
  );
  if (!routeViewport) {
    issues.push(`${row.id} recorded finding must bind route and viewport`);
  }
  if (row.id === "P2Z-UAT-06" && !isVisibleSubstantive(row.correlationId)) {
    issues.push(
      `${row.id} recorded finding must bind the Audit correlation ID as visible text`,
    );
  } else if (
    row.correlationId !== "not applicable" &&
    !isVisibleSubstantive(row.correlationId)
  ) {
    issues.push(
      `${row.id} recorded finding must include correlation ID or not applicable as visible text`,
    );
  }
  const repositoryEvidence = new RegExp(
    `^evidence/p2z-webui/runs/${testedCommit}/${row.id}-finding-[a-z0-9-]+\\.(?:png|json|txt|md)$`,
    "u",
  );
  const repositoryTarget = renderedMarkdownLinkTargets(row.evidence).find(
    (target) => repositoryEvidence.test(target),
  );
  if (!repositoryTarget) {
    issues.push(
      `${row.id} recorded finding must link its repository-backed screenshot or trace`,
    );
  } else {
    const artifactIssue = trackedRepositoryArtifactIssue(
      rootDirectory,
      repositoryTarget,
      scenario?.viewport,
    );
    if (artifactIssue) {
      issues.push(`${row.id} recorded finding evidence ${artifactIssue}`);
    } else if (
      evidenceReuseKind(evidenceTargets, rootDirectory, repositoryTarget)
    ) {
      issues.push(`${row.id} findings must not reuse an evidence artifact`);
    }
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

  if (execution.subjectBinding === "not applicable") {
    if (
      finding.subjectBinding !== "not applicable" &&
      !isVisibleConcreteSubject(finding.subjectBinding)
    ) {
      issues.push(
        `${finding.id} recorded finding must include subject binding as visible text or use not applicable`,
      );
    }
  } else if (finding.subjectBinding !== execution.subjectBinding) {
    issues.push(`${finding.id} finding subject must match its execution row`);
  }

  if (
    scenario.requiresCorrelationId &&
    finding.correlationId !== execution.correlationId
  ) {
    issues.push(
      `${finding.id} finding correlation ID must match its execution row`,
    );
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

function validateFindingIssueRegistry(
  rootDirectory: string,
  testedCommit: string,
  findings: readonly FindingRow[],
  issues: string[],
): void {
  const requiredIssueNumbers = new Set<number>();
  for (const finding of findings) {
    if (
      !completedFindingStatuses.has(finding.status as P2zVisualUatFindingStatus)
    ) {
      continue;
    }
    const issueNumber = parseP2zVisualUatFindingIssueReference(
      finding.linkedIssue,
    );
    if (issueNumber !== undefined) requiredIssueNumbers.add(issueNumber);
  }
  if (requiredIssueNumbers.size === 0) return;

  const repositoryPath = p2zVisualUatFindingIssueRegistryPath(testedCommit);
  const trackedFile = readTrackedRegularRepositoryFile(
    rootDirectory,
    repositoryPath,
  );
  if ("issue" in trackedFile) {
    issues.push(`finding Issue registry ${trackedFile.issue}`);
    return;
  }

  let registry: unknown;
  try {
    registry = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(trackedFile.contents),
    );
  } catch {
    issues.push("finding Issue registry must contain valid JSON");
    return;
  }
  issues.push(
    ...validateP2zVisualUatFindingIssueRegistry(
      registry,
      testedCommit,
      requiredIssueNumbers,
    ),
  );
}

export function collectP2zVisualUatRecordIssues(
  markdown: string,
  rootDirectory = process.cwd(),
): string[] {
  const issues: string[] = [];
  const renderedRecord = renderedMarkdown(markdown);
  const verdictSection = section(
    renderedRecord,
    "## Verdict Boundary",
    "## Backend Integration Boundary",
    issues,
  );
  const executionSection = section(
    renderedRecord,
    "## Human Execution Record",
    "## Scenario Finding Record",
    issues,
  );
  const findingSection = section(
    renderedRecord,
    "## Scenario Finding Record",
    "## Visual Review Checklist",
    issues,
  );
  const checklistSection = section(
    renderedRecord,
    "## Visual Review Checklist",
    "## Evidence Matrix",
    issues,
  );

  const overallVerdict = singletonDeclaration(
    executionSection,
    /^Overall human verdict: \*\*(Pending human execution|Accepted|Conditional|Blocked)\*\*$/gmu,
    "must record exactly one supported overall human verdict",
    issues,
  ) as P2zVisualUatOverallVerdict | undefined;
  const testedCommit = singletonDeclaration(
    executionSection,
    /^Tested commit: \*\*(Pending human execution|[0-9a-f]{40})\*\*$/gmu,
    "must record exactly one tested commit",
    issues,
  );
  const namedHumanTester = singletonDeclaration(
    executionSection,
    /^Named human tester: \*\*(.+?)\*\*$/gmu,
    "must record exactly one named human tester",
    issues,
  );
  const verdictRecorder = singletonDeclaration(
    executionSection,
    /^Overall verdict recorded by: \*\*(.+?)\*\*$/gmu,
    "must record exactly one verdict recorder",
    issues,
  );
  const executionEnvironment = singletonDeclaration(
    executionSection,
    /^Execution environment\/dataset: \*\*(.+?)\*\*$/gmu,
    "must record exactly one execution environment",
    issues,
  );
  if (executionEnvironment !== boundedTenantEnvironment) {
    issues.push(
      "must bind the formal run to the bounded execution environment",
    );
  }

  const verdictBoundaryTable = parseCanonicalMarkdownTable(
    verdictSection,
    verdictBoundaryHeader,
  );
  const verdictBoundaryRows = verdictBoundaryTable ?? [];
  if (!verdictBoundaryTable) {
    issues.push("must keep the verdict boundary table schema");
  }
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

  const executionTable = parseCanonicalMarkdownTable(
    executionSection,
    executionRecordHeader,
  );
  const executionRows = parseExecutionRows(executionTable ?? []);
  if (!executionTable) {
    issues.push("must keep the human execution record schema");
  }
  const executionIds = executionRows.map((row) => row.id);
  if (
    JSON.stringify(executionIds) !== JSON.stringify(p2zVisualUatScenarioIds)
  ) {
    issues.push("must provide exactly one ordered execution row per scenario");
  }
  const findingTable = parseCanonicalMarkdownTable(
    findingSection,
    findingRecordHeader,
  );
  const findingRows = parseFindingRows(findingTable ?? []);
  if (!findingTable) {
    issues.push("must keep the scenario finding record schema");
  }
  const findingsByScenario = new Map<string, FindingRow[]>();
  for (const row of findingRows) {
    const rows = findingsByScenario.get(row.id) ?? [];
    rows.push(row);
    findingsByScenario.set(row.id, rows);
  }
  const findingIds = [...findingsByScenario.keys()].sort();
  if (
    JSON.stringify(findingIds) !==
    JSON.stringify([...p2zVisualUatScenarioIds].sort())
  ) {
    issues.push("must provide at least one finding row per scenario");
  }
  for (const [scenarioId, rows] of findingsByScenario) {
    const statuses = new Set(rows.map((row) => row.status));
    const markerRows = rows.filter((row) =>
      ["Pending", "none observed"].includes(row.status),
    );
    if (markerRows.length > 0 && rows.length !== 1) {
      issues.push(
        `${scenarioId} must use exactly one pending or none observed marker, or only recorded findings`,
      );
    }
    if (statuses.has("none observed") && statuses.size > 1) {
      issues.push(
        `${scenarioId} cannot mix none observed with recorded findings`,
      );
    }
  }

  const checklistTable = parseCanonicalMarkdownTable(
    checklistSection,
    visualChecklistHeader,
  );
  const checklist = parseChecklist(checklistTable ?? []);
  if (!checklistTable) {
    issues.push("must keep the visual checklist record schema");
  }
  if (
    JSON.stringify(checklist.map((entry) => entry.label)) !==
    JSON.stringify(p2zVisualUatChecklistItems)
  ) {
    issues.push("must keep exactly the ordered visual checklist inventory");
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
    if (/^[0-9a-f]{40}$/u.test(testedCommit)) {
      const commitIssue = repositoryCommitIssue(rootDirectory, testedCommit);
      if (commitIssue) issues.push(`tested commit ${commitIssue}`);
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
      !isMeaningfulIdentity(namedHumanTester)
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
  const commitIssue = repositoryCommitIssue(rootDirectory, testedCommit);
  if (commitIssue) issues.push(`tested commit ${commitIssue}`);
  const testedCommitDate = commitIssue
    ? undefined
    : repositoryCommitDate(rootDirectory, testedCommit);
  if (!commitIssue && !testedCommitDate) {
    issues.push("tested commit must expose a valid repository commit date");
  }
  const postTestProductChanges = commitIssue
    ? undefined
    : repositoryPostTestProductChanges(rootDirectory, testedCommit);
  if (!commitIssue && postTestProductChanges === undefined) {
    issues.push("tested commit must support a post-test product drift check");
  } else if (postTestProductChanges && postTestProductChanges.length > 0) {
    issues.push(
      `tested commit must remain product-current; post-test changes are limited to its UAT record and run evidence (${postTestProductChanges.join(", ")})`,
    );
  }
  if (!isMeaningfulIdentity(namedHumanTester)) {
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
      testedCommitDate,
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
  for (const row of findingRows) {
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

  const completedFindings = findingRows.filter(
    (row) => !unexecutedIds.has(row.id),
  );
  validateFindingIssueRegistry(
    rootDirectory,
    testedCommit,
    completedFindings,
    issues,
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
  if (overallVerdict === "Conditional") {
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
  for (const finding of completedFindings) {
    if (
      finding.status !== "blocker" &&
      finding.status !== "must-fix" &&
      finding.status !== "post-UAT"
    ) {
      continue;
    }
    const allowedDispositions = findingDispositionsByStatus.get(finding.status);
    if (
      allowedDispositions?.has(finding.disposition) &&
      !checklistDispositionValues.has(finding.disposition)
    ) {
      issues.push(
        `${finding.status} findings require a matching checklist disposition: ${finding.status} finding disposition ${finding.disposition} requires a matching checklist disposition`,
      );
    }
  }
  for (const disposition of checklistDispositionValues) {
    const requiredFindingStatus =
      findingStatusByChecklistDisposition.get(disposition);
    if (
      requiredFindingStatus &&
      !completedFindings.some(
        (finding) =>
          finding.status === requiredFindingStatus &&
          finding.disposition === disposition,
      )
    ) {
      issues.push(
        `${disposition} checklist disposition requires a matching ${requiredFindingStatus} finding`,
      );
    }
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
