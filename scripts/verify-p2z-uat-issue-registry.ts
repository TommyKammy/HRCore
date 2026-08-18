import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  p2zVisualUatFindingIssueRegistryPath,
  type P2zVisualUatFindingIssueRegistry,
  validateP2zVisualUatFindingIssueRegistry,
  validateP2zVisualUatFindingIssueRegistryAgainstGraphql,
} from "../src/test-helpers/p2z-webui-visual-uat-issue-registry.js";
import { p2zVisualUatTestedCommitFromRecord } from "../src/test-helpers/p2z-webui-visual-uat-record.js";

const rootDirectory = process.cwd();
const packagePath = path.join(
  rootDirectory,
  "docs/p2z-webui-visual-uat-package.md",
);
const packageMarkdown = await readFile(packagePath, "utf8");
const testedCommit = p2zVisualUatTestedCommitFromRecord(packageMarkdown);

if (testedCommit === undefined) {
  if (
    /^Tested commit: \*\*Pending human execution\*\*$/mu.test(packageMarkdown)
  ) {
    console.log(
      "P2Z visual UAT finding Issue registry verification skipped: human execution is pending.",
    );
  } else {
    throw new Error(
      "The rendered UAT Human Execution Record must contain exactly one supported Tested commit",
    );
  }
} else {
  const repositoryPath = p2zVisualUatFindingIssueRegistryPath(testedCommit);
  const absolutePath = path.join(rootDirectory, ...repositoryPath.split("/"));
  let registryText: string | undefined;
  try {
    registryText = await readFile(absolutePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  if (registryText === undefined) {
    console.log(
      "P2Z visual UAT finding Issue registry verification skipped: no registry is required by this record.",
    );
  } else {
    const registry: unknown = JSON.parse(registryText);
    const shapeErrors = validateP2zVisualUatFindingIssueRegistry(
      registry,
      testedCommit,
      [],
    );
    if (shapeErrors.length > 0) {
      throw new Error(
        `Cannot authenticate P2Z visual UAT finding Issue registry:\n- ${shapeErrors.join("\n- ")}`,
      );
    }

    const typedRegistry = registry as P2zVisualUatFindingIssueRegistry;
    if (typedRegistry.issues.length > 0) {
      const issueSelections = typedRegistry.issues
        .map(
          (issue, index) =>
            `issue${index}: issue(number: ${issue.number}) { __typename number id url }`,
        )
        .join("\n");
      const query = `query VerifyP2zVisualUatFindingIssues {
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
      const authenticationErrors =
        validateP2zVisualUatFindingIssueRegistryAgainstGraphql(
          typedRegistry,
          response,
        );
      if (authenticationErrors.length > 0) {
        throw new Error(
          `Cannot authenticate P2Z visual UAT finding Issue registry:\n- ${authenticationErrors.join("\n- ")}`,
        );
      }
    }
    console.log(
      `Authenticated ${typedRegistry.issues.length} P2Z visual UAT finding Issue snapshot${
        typedRegistry.issues.length === 1 ? "" : "s"
      } against GitHub.`,
    );
  }
}
