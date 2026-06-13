import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url);

async function readRepoFile(path: string): Promise<string> {
  return readFile(new URL(path, repoRoot), "utf8");
}

test("CHILD-P2Y-01 WebUI foundation is wired to a documented local command and guarded persona boundary", async () => {
  const packageJson = JSON.parse(await readRepoFile("package.json")) as {
    scripts?: Record<string, string>;
    engines?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["dev:web"], "vite --host 127.0.0.1");
  assert.equal(
    packageJson.scripts?.["build:web"],
    "tsc -p tsconfig.web.json --noEmit && vite build",
  );
  assert.equal(packageJson.scripts?.["test:web"], "vitest run");
  assert.match(packageJson.scripts?.["verify:pre-pr"] ?? "", /test:web/);
  assert.equal(packageJson.engines?.node, ">=22.12.0");
  assert.ok(packageJson.dependencies?.react);
  assert.ok(packageJson.dependencies?.["react-dom"]);
  assert.ok(packageJson.devDependencies?.vite);
  assert.ok(packageJson.devDependencies?.vitest);

  const readme = await readRepoFile("README.md");
  assert.match(readme, /npm run dev:web/);
  assert.match(readme, /bounded\/non-production persona switcher/);

  const appSource = await readRepoFile("web/src/App.tsx");
  assert.match(appSource, /role="navigation"/);
  assert.match(appSource, /aria-busy="true"/);
  assert.match(appSource, /ErrorBoundary/);
  assert.match(appSource, /EmptyState/);

  const personaSource = await readRepoFile("web/src/persona.ts");
  assert.match(personaSource, /non-production/i);
  assert.match(personaSource, /fail/i);
  assert.match(personaSource, /closed/i);
  assert.doesNotMatch(personaSource, /okta|idp|production auth/i);

  const apiSource = await readRepoFile("web/src/api-client.ts");
  assert.match(apiSource, /ApiContract/);
  assert.match(apiSource, /fetchOpenApiContract/);
  assert.doesNotMatch(apiSource, /rawPayload|csv export|go-live/i);

  await readRepoFile("web/src/App.test.tsx");
  await readRepoFile("web/src/route-smoke.test.tsx");
  await readRepoFile("web/src/accessibility-smoke.test.tsx");
});
