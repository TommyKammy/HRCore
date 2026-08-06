import assert from "node:assert/strict";
import test from "node:test";

import {
  createP2zVisualUatFindingIssueRegistry,
  parseP2zVisualUatFindingIssueReference,
  p2zVisualUatFindingIssueRegistryPath,
  p2zVisualUatFindingIssueSnapshotFromGraphql,
  p2zVisualUatFindingIssueUrl,
  type P2zVisualUatFindingIssueRegistry,
  validateP2zVisualUatFindingIssueRegistry,
  validateP2zVisualUatFindingIssueRegistryAgainstGraphql,
} from "./test-helpers/p2z-webui-visual-uat-issue-registry.js";

const testedCommit = "a".repeat(40);

function validRegistry(): P2zVisualUatFindingIssueRegistry {
  return {
    schemaVersion: 1,
    repository: "TommyKammy/HRCore",
    testedCommit,
    verifiedAt: "2026-08-05T00:00:00.000Z",
    issues: [
      {
        number: 41,
        nodeId: "I_fixture_41",
        url: p2zVisualUatFindingIssueUrl(41),
      },
      {
        number: 406,
        nodeId: "I_fixture_406",
        url: p2zVisualUatFindingIssueUrl(406),
      },
    ],
  };
}

test("P2Z finding Issue registry derives a run-scoped path", () => {
  assert.equal(
    p2zVisualUatFindingIssueRegistryPath(testedCommit),
    `docs/evidence/p2z-webui/runs/${testedCommit}/finding-issues.json`,
  );
  for (const invalidCommit of [
    "a".repeat(39),
    "A".repeat(40),
    `../${"a".repeat(40)}`,
  ]) {
    assert.throws(
      () => p2zVisualUatFindingIssueRegistryPath(invalidCommit),
      /40-character tested commit/u,
    );
  }
});

test("P2Z finding Issue references normalize only supported HRCore forms", () => {
  for (const [reference, expected] of [
    ["#1", 1],
    ["#406", 406],
    ["https://github.com/TommyKammy/HRCore/issues/406", 406],
    ["HTTPS://GITHUB.COM/TOMMYKAMMY/HRCORE/ISSUES/406", 406],
  ] as const) {
    assert.equal(parseP2zVisualUatFindingIssueReference(reference), expected);
  }

  for (const reference of [
    "#0",
    "#0406",
    `#${Number.MAX_SAFE_INTEGER + 1}`,
    " #406",
    "#406 ",
    "https://github.com/TommyKammy/HRCore/pull/406",
    "https://github.com/another/HRCore/issues/406",
    "https://github.com/TommyKammy/HRCore/issues/406/",
    "https://github.com/TommyKammy/HRCore/issues/406?x=1",
  ]) {
    assert.equal(parseP2zVisualUatFindingIssueReference(reference), undefined);
  }
});

test("P2Z finding Issue registry accepts a strict valid snapshot", () => {
  assert.deepEqual(
    validateP2zVisualUatFindingIssueRegistry(
      validRegistry(),
      testedCommit,
      new Set([406]),
    ),
    [],
  );
});

test("P2Z finding Issue registry creation sorts and validates snapshots", () => {
  const source = validRegistry();
  assert.deepEqual(
    createP2zVisualUatFindingIssueRegistry(
      testedCommit,
      source.verifiedAt,
      [...source.issues].reverse(),
    ),
    source,
  );
  assert.throws(
    () =>
      createP2zVisualUatFindingIssueRegistry(testedCommit, source.verifiedAt, [
        source.issues[0]!,
        source.issues[0]!,
      ]),
    /must not repeat Issue #41/u,
  );
});

test("P2Z finding Issue registry rejects root provenance drift", () => {
  const cases: Array<{
    name: string;
    value: unknown;
    commit?: string;
    expected: RegExp;
  }> = [
    {
      name: "non-object registry",
      value: null,
      expected: /must be a JSON object/u,
    },
    {
      name: "extra root property",
      value: { ...validRegistry(), extra: true },
      expected: /must contain exactly/u,
    },
    {
      name: "schema drift",
      value: { ...validRegistry(), schemaVersion: 2 },
      expected: /schemaVersion must be 1/u,
    },
    {
      name: "repository drift",
      value: { ...validRegistry(), repository: "another/HRCore" },
      expected: /repository must be TommyKammy\/HRCore/u,
    },
    {
      name: "malformed registry commit",
      value: { ...validRegistry(), testedCommit: "a".repeat(39) },
      expected: /testedCommit must be a 40-character commit/u,
    },
    {
      name: "run commit mismatch",
      value: validRegistry(),
      commit: "b".repeat(40),
      expected: /must match the formal UAT run/u,
    },
    {
      name: "malformed verification time",
      value: { ...validRegistry(), verifiedAt: "2026-08-05" },
      expected: /verifiedAt must be a canonical ISO timestamp/u,
    },
    {
      name: "future verification time",
      value: {
        ...validRegistry(),
        verifiedAt: "2999-01-01T00:00:00.000Z",
      },
      expected: /verifiedAt must not be in the future/u,
    },
    {
      name: "malformed issues collection",
      value: { ...validRegistry(), issues: {} },
      expected: /issues must be an array/u,
    },
  ];

  for (const scenario of cases) {
    assert.match(
      validateP2zVisualUatFindingIssueRegistry(
        scenario.value,
        scenario.commit ?? testedCommit,
        [],
      ).join("\n"),
      scenario.expected,
      scenario.name,
    );
  }
});

test("P2Z finding Issue registry rejects malformed, duplicate, and unordered snapshots", () => {
  const base = validRegistry();
  const first = base.issues[0]!;
  const second = base.issues[1]!;
  const cases: Array<{ name: string; issues: unknown[]; expected: RegExp }> = [
    {
      name: "non-object entry",
      issues: [null],
      expected: /issues\[0\] must be a JSON object/u,
    },
    {
      name: "extra entry property",
      issues: [{ ...first, extra: true }],
      expected: /must contain exactly number, nodeId, and url/u,
    },
    {
      name: "unsafe number",
      issues: [
        {
          ...first,
          number: Number.MAX_SAFE_INTEGER + 1,
        },
      ],
      expected: /number must be a positive safe integer/u,
    },
    {
      name: "blank node ID",
      issues: [{ ...first, nodeId: " " }],
      expected: /nodeId must be a GitHub Issue node ID/u,
    },
    {
      name: "pull request node ID",
      issues: [{ ...first, nodeId: "PR_fixture_41" }],
      expected: /nodeId must be a GitHub Issue node ID/u,
    },
    {
      name: "non-canonical URL",
      issues: [
        { ...first, url: "https://github.com/TommyKammy/HRCore/pull/41" },
      ],
      expected: /url must be the canonical HRCore Issue URL/u,
    },
    {
      name: "duplicate number",
      issues: [first, { ...first, nodeId: "I_other_41" }],
      expected: /must not repeat Issue #41/u,
    },
    {
      name: "duplicate node ID",
      issues: [first, { ...second, nodeId: first.nodeId }],
      expected: /must not repeat nodeId I_fixture_41/u,
    },
    {
      name: "descending number",
      issues: [second, first],
      expected: /must be sorted by ascending Issue number/u,
    },
  ];

  for (const scenario of cases) {
    assert.match(
      validateP2zVisualUatFindingIssueRegistry(
        { ...base, issues: scenario.issues },
        testedCommit,
        [],
      ).join("\n"),
      scenario.expected,
      scenario.name,
    );
  }
});

test("P2Z finding Issue registry requires every referenced Issue", () => {
  assert.match(
    validateP2zVisualUatFindingIssueRegistry(
      validRegistry(),
      testedCommit,
      [41, 999_999_999],
    ).join("\n"),
    /must include required Issue #999999999/u,
  );
  assert.match(
    validateP2zVisualUatFindingIssueRegistry(validRegistry(), testedCommit, [
      Number.NaN,
    ]).join("\n"),
    /required finding Issue number must be a positive safe integer/u,
  );
});

test("P2Z finding Issue GraphQL lookup creates an immutable snapshot", () => {
  const lookup = {
    data: {
      repository: {
        issue: {
          __typename: "Issue",
          id: "I_kwDOSfC_1M8AAAABJtU0ew",
          number: 406,
          state: "CLOSED",
          url: p2zVisualUatFindingIssueUrl(406),
        },
      },
    },
  };
  assert.deepEqual(p2zVisualUatFindingIssueSnapshotFromGraphql(406, lookup), {
    number: 406,
    nodeId: "I_kwDOSfC_1M8AAAABJtU0ew",
    url: p2zVisualUatFindingIssueUrl(406),
  });
});

test("P2Z finding Issue registry authenticates every snapshot against GitHub", () => {
  const registry = validRegistry();
  const lookup = {
    data: {
      repository: {
        issue0: {
          __typename: "Issue",
          id: registry.issues[0]!.nodeId,
          number: registry.issues[0]!.number,
          url: registry.issues[0]!.url,
        },
        issue1: {
          __typename: "Issue",
          id: registry.issues[1]!.nodeId,
          number: registry.issues[1]!.number,
          url: registry.issues[1]!.url,
        },
      },
    },
  };
  assert.deepEqual(
    validateP2zVisualUatFindingIssueRegistryAgainstGraphql(registry, lookup),
    [],
  );

  const forged = {
    ...registry,
    issues: registry.issues.map((issue) =>
      issue.number === 406 ? { ...issue, nodeId: "I_fake_406" } : issue,
    ),
  };
  assert.match(
    validateP2zVisualUatFindingIssueRegistryAgainstGraphql(forged, lookup).join(
      "\n",
    ),
    /Issue #406 snapshot must match authenticated GitHub data/u,
  );
});

test("P2Z finding Issue GraphQL lookup rejects missing Issues and pull requests", () => {
  const cases: Array<{ name: string; value: unknown; expected: RegExp }> = [
    {
      name: "missing data",
      value: {},
      expected: /must include data/u,
    },
    {
      name: "missing repository",
      value: { data: { repository: null } },
      expected: /repository TommyKammy\/HRCore was not found/u,
    },
    {
      name: "missing Issue",
      value: { data: { repository: { issue: null } } },
      expected: /Issue #430 does not exist/u,
    },
    {
      name: "pull request",
      value: {
        data: {
          repository: {
            issue: {
              __typename: "PullRequest",
              id: "PR_fixture_430",
              number: 430,
              url: "https://github.com/TommyKammy/HRCore/pull/430",
            },
          },
        },
      },
      expected: /must resolve to an Issue/u,
    },
    {
      name: "mismatched number",
      value: {
        data: {
          repository: {
            issue: {
              __typename: "Issue",
              id: "I_fixture_431",
              number: 431,
              url: p2zVisualUatFindingIssueUrl(431),
            },
          },
        },
      },
      expected: /unexpected number/u,
    },
    {
      name: "blank node ID",
      value: {
        data: {
          repository: {
            issue: {
              __typename: "Issue",
              id: "",
              number: 430,
              url: p2zVisualUatFindingIssueUrl(430),
            },
          },
        },
      },
      expected: /must include an Issue node ID/u,
    },
    {
      name: "pull request node ID",
      value: {
        data: {
          repository: {
            issue: {
              __typename: "Issue",
              id: "PR_fixture_430",
              number: 430,
              url: p2zVisualUatFindingIssueUrl(430),
            },
          },
        },
      },
      expected: /must include an Issue node ID/u,
    },
    {
      name: "non-canonical URL",
      value: {
        data: {
          repository: {
            issue: {
              __typename: "Issue",
              id: "I_fixture_430",
              number: 430,
              url: "https://github.com/TommyKammy/HRCore/pull/430",
            },
          },
        },
      },
      expected: /must use its canonical HRCore URL/u,
    },
  ];

  for (const scenario of cases) {
    assert.throws(
      () => p2zVisualUatFindingIssueSnapshotFromGraphql(430, scenario.value),
      scenario.expected,
      scenario.name,
    );
  }
});
