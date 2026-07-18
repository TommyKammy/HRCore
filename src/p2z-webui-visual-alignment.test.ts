import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import test from "node:test";
import path from "node:path";

import { readRepoFile } from "./test-helpers/database.js";

const contractPath = "docs/p2z-webui-visual-alignment-contract.md";
const uatPath = "docs/p2z-webui-visual-uat-package.md";
const evidencePath = "docs/evidence/p2z-webui";

test("P2Z visual alignment contract is implemented and reproducible", async () => {
  const [
    contract,
    uat,
    evidenceReadme,
    app,
    styles,
    persona,
    e2e,
    packageJson,
    ci,
    readme,
  ] = await Promise.all([
    readRepoFile(contractPath),
    readRepoFile(uatPath),
    readRepoFile(`${evidencePath}/README.md`),
    readRepoFile("web/src/App.tsx"),
    readRepoFile("web/src/styles.css"),
    readRepoFile("web/src/persona.ts"),
    readRepoFile("web/e2e/visual-alignment.spec.ts"),
    readRepoFile("package.json"),
    readRepoFile(".github/workflows/ci.yml"),
    readRepoFile("README.md"),
  ]);

  for (const screen of [
    "Dashboard",
    "Employee detail",
    "Lifecycle procedure",
    "Approval inbox",
    "Job monitor",
  ] as const) {
    assert.match(
      contract,
      new RegExp(`\\|\\s*${screen}\\s*\\|`, "u"),
      `${contractPath} must define the ${screen} screen contract`,
    );
  }

  for (const boundary of [
    "repository-owned synthetic/non-production",
    "Production authorization/RLS remains blocked",
    "Live IdP/Okta/provider mutation remains blocked",
    "Broad employee search",
    "production-like readiness",
    "go-live approval",
  ] as const) {
    assert.ok(contract.includes(boundary), `missing P2Z boundary: ${boundary}`);
  }

  for (const scenario of [
    "P2Z-UAT-01",
    "P2Z-UAT-02",
    "P2Z-UAT-03",
    "P2Z-UAT-04",
    "P2Z-UAT-05",
    "P2Z-UAT-06",
    "P2Z-UAT-07",
    "P2Z-UAT-08",
  ] as const) {
    assert.ok(uat.includes(scenario), `${uatPath} must include ${scenario}`);
  }

  for (const sourceSignal of [
    "DashboardView",
    "EmployeeDetailView",
    "ProcedureFrame",
    "ApprovalsWorkflow",
    "OpsDlqWorkflow",
    "Direct correlation lookup",
  ] as const) {
    assert.ok(
      app.includes(sourceSignal),
      `missing P2Z UI signal: ${sourceSignal}`,
    );
  }

  for (const styleSignal of [
    ".environment-banner",
    ".summary-grid",
    ".approval-layout",
    ".job-monitor",
    ".procedure-toolbar",
    "@media (max-width: 768px)",
    "@media (max-width: 520px)",
    "@media (prefers-reduced-motion: reduce)",
  ] as const) {
    assert.ok(
      styles.includes(styleSignal),
      `missing P2Z responsive/style signal: ${styleSignal}`,
    );
  }

  assert.match(
    persona,
    /allowedRoutes:[\s\S]*"employee"[\s\S]*"onboarding"/u,
    "HR operator must have the bounded employee-detail route",
  );
  assert.ok(
    e2e.includes("assertNoHorizontalOverflow"),
    "P2Z E2E must guard horizontal overflow",
  );
  assert.ok(
    e2e.includes("ナビゲーションを開く"),
    "P2Z E2E must exercise the structural mobile drawer",
  );
  assert.match(
    packageJson,
    /"test:web:e2e":\s*"playwright test"/u,
    "package scripts must expose the P2Z browser smoke",
  );
  assert.match(
    ci,
    /playwright install --with-deps chromium/u,
    "CI must install Chromium before canonical verification",
  );
  assert.match(
    readme,
    /P2Z WebUI Visual Alignment Contract/u,
    "README must link the P2Z visual contract",
  );
  assert.match(
    evidenceReadme,
    /npm run capture:web:evidence/u,
    "visual evidence README must document deterministic regeneration",
  );

  const screenshots = [
    "desktop-chromium-dashboard.png",
    "desktop-chromium-employee-detail.png",
    "desktop-chromium-transfer.png",
    "desktop-chromium-approval-inbox.png",
    "desktop-chromium-job-monitor.png",
    "tablet-chromium-dashboard.png",
    "tablet-chromium-employee-detail.png",
    "tablet-chromium-transfer.png",
    "tablet-chromium-approval-inbox.png",
    "tablet-chromium-job-monitor.png",
    "mobile-chromium-dashboard.png",
    "mobile-chromium-employee-detail.png",
    "mobile-chromium-transfer.png",
    "mobile-chromium-approval-inbox.png",
    "mobile-chromium-job-monitor.png",
  ] as const;

  for (const screenshot of screenshots) {
    const screenshotStat = await stat(
      path.resolve(process.cwd(), evidencePath, screenshot),
    );
    assert.ok(
      screenshotStat.size > 10_000,
      `${screenshot} must contain rendered visual evidence`,
    );
  }
});

test("P2Z visual acceptance does not promote stronger readiness", async () => {
  const normalized = `${await readRepoFile(contractPath)}\n${await readRepoFile(
    uatPath,
  )}`.replace(/\s+/gu, " ");

  for (const forbidden of [
    /production-like readiness:\s*(?:Go|Ready|Accepted)/iu,
    /go-live approval:\s*(?:Go|Ready|Accepted)/iu,
    /real employee data(?:\s+is)?\s+(?:approved|enabled|ready)/iu,
    /live provider operation(?:\s+is)?\s+(?:approved|enabled|ready)/iu,
  ] as const) {
    assert.doesNotMatch(normalized, forbidden);
  }
});
