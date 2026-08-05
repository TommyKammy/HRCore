export const p2zVisualUatFindingIssueRepository = "TommyKammy/HRCore";

export const p2zVisualUatFindingIssueRegistrySchemaVersion = 1;

export type P2zVisualUatFindingIssueSnapshot = {
  readonly number: number;
  readonly nodeId: string;
  readonly url: string;
};

export type P2zVisualUatFindingIssueRegistry = {
  readonly schemaVersion: typeof p2zVisualUatFindingIssueRegistrySchemaVersion;
  readonly repository: typeof p2zVisualUatFindingIssueRepository;
  readonly testedCommit: string;
  readonly verifiedAt: string;
  readonly issues: readonly P2zVisualUatFindingIssueSnapshot[];
};

const testedCommitPattern = /^[0-9a-f]{40}$/u;

const registryRootKeys = [
  "issues",
  "repository",
  "schemaVersion",
  "testedCommit",
  "verifiedAt",
] as const;

const issueSnapshotKeys = ["nodeId", "number", "url"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function isIssueNumber(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isCanonicalIsoTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return false;
  }
  const timestamp = new Date(value);
  return (
    !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value
  );
}

function isGithubIssueNodeId(value: unknown): value is string {
  return typeof value === "string" && /^I_[A-Za-z0-9_-]+$/u.test(value);
}

export function p2zVisualUatFindingIssueUrl(issueNumber: number): string {
  if (!isIssueNumber(issueNumber)) {
    throw new Error("GitHub Issue number must be a positive safe integer");
  }
  return `https://github.com/${p2zVisualUatFindingIssueRepository}/issues/${issueNumber}`;
}

export function p2zVisualUatFindingIssueRegistryPath(
  testedCommit: string,
): string {
  if (!testedCommitPattern.test(testedCommit)) {
    throw new Error(
      "P2Z visual UAT finding Issue registry requires a 40-character tested commit",
    );
  }
  return `docs/evidence/p2z-webui/runs/${testedCommit}/finding-issues.json`;
}

export function parseP2zVisualUatFindingIssueReference(
  value: string,
): number | undefined {
  const match = value.match(
    /^(?:#([1-9]\d*)|https:\/\/github\.com\/TommyKammy\/HRCore\/issues\/([1-9]\d*))$/iu,
  );
  const capturedNumber = match?.[1] ?? match?.[2];
  if (capturedNumber === undefined) return undefined;
  const issueNumber = Number(capturedNumber);
  return isIssueNumber(issueNumber) ? issueNumber : undefined;
}

export function validateP2zVisualUatFindingIssueRegistry(
  value: unknown,
  testedCommit: string,
  requiredNumbers: Iterable<number>,
): string[] {
  const errors: string[] = [];
  const requiredIssueNumbers = new Set<number>();

  for (const issueNumber of requiredNumbers) {
    if (!isIssueNumber(issueNumber)) {
      errors.push(
        `required finding Issue number must be a positive safe integer: ${String(issueNumber)}`,
      );
    } else {
      requiredIssueNumbers.add(issueNumber);
    }
  }

  if (!testedCommitPattern.test(testedCommit)) {
    errors.push(
      "finding Issue registry validation requires a 40-character tested commit",
    );
  }

  if (!isRecord(value)) {
    return [...errors, "finding Issue registry must be a JSON object"];
  }

  if (!hasExactKeys(value, registryRootKeys)) {
    errors.push(
      "finding Issue registry must contain exactly schemaVersion, repository, testedCommit, verifiedAt, and issues",
    );
  }
  if (value.schemaVersion !== p2zVisualUatFindingIssueRegistrySchemaVersion) {
    errors.push(
      `finding Issue registry schemaVersion must be ${p2zVisualUatFindingIssueRegistrySchemaVersion}`,
    );
  }
  if (value.repository !== p2zVisualUatFindingIssueRepository) {
    errors.push(
      `finding Issue registry repository must be ${p2zVisualUatFindingIssueRepository}`,
    );
  }
  if (
    typeof value.testedCommit !== "string" ||
    !testedCommitPattern.test(value.testedCommit)
  ) {
    errors.push(
      "finding Issue registry testedCommit must be a 40-character commit",
    );
  } else if (value.testedCommit !== testedCommit) {
    errors.push(
      "finding Issue registry testedCommit must match the formal UAT run",
    );
  }
  if (!isCanonicalIsoTimestamp(value.verifiedAt)) {
    errors.push(
      "finding Issue registry verifiedAt must be a canonical ISO timestamp",
    );
  }
  if (!Array.isArray(value.issues)) {
    errors.push("finding Issue registry issues must be an array");
    return errors;
  }

  const seenNumbers = new Set<number>();
  const seenNodeIds = new Set<string>();
  let previousNumber: number | undefined;

  for (const [index, candidate] of value.issues.entries()) {
    const label = `finding Issue registry issues[${index}]`;
    if (!isRecord(candidate)) {
      errors.push(`${label} must be a JSON object`);
      continue;
    }
    if (!hasExactKeys(candidate, issueSnapshotKeys)) {
      errors.push(`${label} must contain exactly number, nodeId, and url`);
    }

    const issueNumber = candidate.number;
    if (!isIssueNumber(issueNumber)) {
      errors.push(`${label}.number must be a positive safe integer`);
    } else {
      if (seenNumbers.has(issueNumber)) {
        errors.push(
          `finding Issue registry must not repeat Issue #${issueNumber}`,
        );
      }
      seenNumbers.add(issueNumber);
      if (previousNumber !== undefined && issueNumber <= previousNumber) {
        errors.push(
          "finding Issue registry issues must be sorted by ascending Issue number",
        );
      }
      previousNumber = issueNumber;

      let expectedUrl: string;
      try {
        expectedUrl = p2zVisualUatFindingIssueUrl(issueNumber);
      } catch {
        expectedUrl = "";
      }
      if (candidate.url !== expectedUrl) {
        errors.push(`${label}.url must be the canonical HRCore Issue URL`);
      }
    }

    const nodeId = candidate.nodeId;
    if (!isGithubIssueNodeId(nodeId)) {
      errors.push(`${label}.nodeId must be a GitHub Issue node ID`);
    } else if (seenNodeIds.has(nodeId)) {
      errors.push(`finding Issue registry must not repeat nodeId ${nodeId}`);
    } else {
      seenNodeIds.add(nodeId);
    }
  }

  for (const issueNumber of [...requiredIssueNumbers].sort(
    (left, right) => left - right,
  )) {
    if (!seenNumbers.has(issueNumber)) {
      errors.push(
        `finding Issue registry must include required Issue #${issueNumber}`,
      );
    }
  }

  return errors;
}

export function createP2zVisualUatFindingIssueRegistry(
  testedCommit: string,
  verifiedAt: string,
  snapshots: readonly P2zVisualUatFindingIssueSnapshot[],
): P2zVisualUatFindingIssueRegistry {
  const registry: P2zVisualUatFindingIssueRegistry = {
    schemaVersion: p2zVisualUatFindingIssueRegistrySchemaVersion,
    repository: p2zVisualUatFindingIssueRepository,
    testedCommit,
    verifiedAt,
    issues: snapshots
      .map((snapshot) => ({ ...snapshot }))
      .sort((left, right) => left.number - right.number),
  };
  const errors = validateP2zVisualUatFindingIssueRegistry(
    registry,
    testedCommit,
    snapshots.map((snapshot) => snapshot.number),
  );
  if (errors.length > 0) {
    throw new Error(
      `Cannot create P2Z visual UAT finding Issue registry:\n- ${errors.join("\n- ")}`,
    );
  }
  return registry;
}

export function p2zVisualUatFindingIssueSnapshotFromGraphql(
  expectedNumber: number,
  value: unknown,
): P2zVisualUatFindingIssueSnapshot {
  if (!isIssueNumber(expectedNumber)) {
    throw new Error(
      "Expected GitHub Issue number must be a positive safe integer",
    );
  }
  if (!isRecord(value) || !isRecord(value.data)) {
    throw new Error("GitHub GraphQL Issue lookup must include data");
  }
  const repository = value.data.repository;
  if (!isRecord(repository)) {
    throw new Error(
      `GitHub repository ${p2zVisualUatFindingIssueRepository} was not found`,
    );
  }
  const issue = repository.issue;
  if (issue === null || issue === undefined) {
    throw new Error(
      `GitHub Issue #${expectedNumber} does not exist in ${p2zVisualUatFindingIssueRepository}`,
    );
  }
  if (!isRecord(issue) || issue.__typename !== "Issue") {
    throw new Error(
      `GitHub resource #${expectedNumber} must resolve to an Issue`,
    );
  }
  if (issue.number !== expectedNumber) {
    throw new Error(
      `GitHub Issue lookup returned an unexpected number for #${expectedNumber}`,
    );
  }
  if (!isGithubIssueNodeId(issue.id)) {
    throw new Error(
      `GitHub Issue #${expectedNumber} must include an Issue node ID`,
    );
  }
  const expectedUrl = p2zVisualUatFindingIssueUrl(expectedNumber);
  if (issue.url !== expectedUrl) {
    throw new Error(
      `GitHub Issue #${expectedNumber} must use its canonical HRCore URL`,
    );
  }
  return {
    number: expectedNumber,
    nodeId: issue.id,
    url: expectedUrl,
  };
}
