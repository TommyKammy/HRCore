import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createP2zVisualUatFindingIssueRegistry,
  parseP2zVisualUatFindingIssueReference,
  p2zVisualUatFindingIssueRegistryPath,
  p2zVisualUatFindingIssueSnapshotFromGraphql,
} from "../src/test-helpers/p2z-webui-visual-uat-issue-registry.js";
import { p2zVisualUatTestedCommitFromRecord } from "../src/test-helpers/p2z-webui-visual-uat-record.js";

function issueNumbersFromArguments(arguments_: readonly string[]): number[] {
  const issueNumbers: number[] = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] !== "--issue" || index + 1 >= arguments_.length) {
      throw new Error(
        "Usage: npm run update:p2z:uat-issue-registry -- --issue <number> [--issue <number> ...]",
      );
    }
    const reference = arguments_[index + 1] ?? "";
    const issueNumber = parseP2zVisualUatFindingIssueReference(
      /^\d+$/u.test(reference) ? `#${reference}` : reference,
    );
    if (issueNumber === undefined) {
      throw new Error(`Invalid HRCore Issue reference: ${reference}`);
    }
    issueNumbers.push(issueNumber);
    index += 1;
  }
  const uniqueIssueNumbers = [...new Set(issueNumbers)].sort(
    (left, right) => left - right,
  );
  if (uniqueIssueNumbers.length === 0) {
    throw new Error("At least one --issue <number> argument is required");
  }
  return uniqueIssueNumbers;
}

const rootDirectory = process.cwd();
const packagePath = path.join(
  rootDirectory,
  "docs/p2z-webui-visual-uat-package.md",
);
const testedCommit = p2zVisualUatTestedCommitFromRecord(
  await readFile(packagePath, "utf8"),
);
if (testedCommit === undefined) {
  throw new Error(
    "The rendered UAT Human Execution Record must contain exactly one 40-character Tested commit before updating its Issue registry",
  );
}
const issueNumbers = issueNumbersFromArguments(process.argv.slice(2));
const issueSelections = issueNumbers
  .map(
    (issueNumber, index) =>
      `issue${index}: issue(number: ${issueNumber}) { __typename number id url }`,
  )
  .join("\n");
const query = `query P2zVisualUatFindingIssues {
  repository(owner: "TommyKammy", name: "HRCore") {
    ${issueSelections}
  }
}`;
const response: unknown = JSON.parse(
  execFileSync("gh", ["api", "graphql", "-f", `query=${query}`], {
    cwd: rootDirectory,
    encoding: "utf8",
  }),
);
const repository =
  response !== null && typeof response === "object" && "data" in response
    ? (response as { data?: { repository?: unknown } }).data?.repository
    : undefined;
if (repository === null || typeof repository !== "object") {
  throw new Error("GitHub did not return the TommyKammy/HRCore repository");
}
const snapshots = issueNumbers.map((issueNumber, index) =>
  p2zVisualUatFindingIssueSnapshotFromGraphql(issueNumber, {
    data: {
      repository: {
        issue: (repository as Record<string, unknown>)[`issue${index}`],
      },
    },
  }),
);
const registry = createP2zVisualUatFindingIssueRegistry(
  testedCommit,
  new Date().toISOString(),
  snapshots,
);
const registryPath = p2zVisualUatFindingIssueRegistryPath(testedCommit);
const absoluteRegistryPath = path.join(
  rootDirectory,
  ...registryPath.split("/"),
);
await mkdir(path.dirname(absoluteRegistryPath), { recursive: true });
const temporaryPath = `${absoluteRegistryPath}.${process.pid}.tmp`;
try {
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
  await rename(temporaryPath, absoluteRegistryPath);
} finally {
  await rm(temporaryPath, { force: true });
}

console.log(
  `Updated ${registryPath} with ${snapshots.length} verified GitHub Issue${snapshots.length === 1 ? "" : "s"}.`,
);
