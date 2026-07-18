import { mkdir } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, test, type TestInfo } from "@playwright/test";

const captureEvidence = process.env.CAPTURE_WEB_EVIDENCE === "1";
const evidenceDirectory = path.resolve(
  process.cwd(),
  "docs/evidence/p2z-webui",
);

async function openMobileNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 0) > 768) {
    return;
  }

  const openButton = page.getByRole("button", {
    name: "ナビゲーションを開く",
  });
  if (await openButton.isVisible()) {
    await openButton.click();
  }
}

async function selectPersona(page: Page, persona: string) {
  await openMobileNavigation(page);
  await page.getByLabel("Persona").selectOption(persona);
}

async function navigate(page: Page, name: RegExp) {
  await openMobileNavigation(page);
  await page.getByRole("button", { name }).click();
  if ((page.viewportSize()?.width ?? 0) <= 768) {
    await expect(
      page.getByRole("button", { name: "ナビゲーションを開く" }),
    ).toBeVisible();
    await page.waitForTimeout(220);
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const configuredViewportWidth = page.viewportSize()?.width;
  const report = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    layoutViewportWidth: window.innerWidth,
    visualViewportWidth: window.visualViewport?.width ?? window.innerWidth,
  }));

  expect(configuredViewportWidth).toBeDefined();
  for (const measuredWidth of Object.values(report)) {
    expect(measuredWidth, JSON.stringify(report)).toBeLessThanOrEqual(
      (configuredViewportWidth ?? 0) + 1,
    );
  }
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  if (!captureEvidence) {
    return;
  }

  await page.waitForTimeout(220);
  await mkdir(evidenceDirectory, { recursive: true });
  const screenshot = await page.screenshot({
    path: path.join(evidenceDirectory, `${testInfo.project.name}-${name}.png`),
    fullPage: true,
  });
  const viewportWidth = page.viewportSize()?.width;
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  const geometryReport = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    outOfViewportElements: Array.from(
      document.body.querySelectorAll<HTMLElement>("*"),
    )
      .map((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          className: String(element.className),
          left: Math.floor(bounds.left),
          right: Math.ceil(bounds.right),
          tagName: element.tagName.toLowerCase(),
          width: Math.ceil(bounds.width),
        };
      })
      .filter(
        (element) =>
          element.left < -1 ||
          element.right > window.innerWidth + 1 ||
          element.width > window.innerWidth + 1,
      )
      .slice(0, 10),
  }));

  expect(viewportWidth).toBeDefined();
  expect(screenshot.readUInt32BE(16), JSON.stringify(geometryReport)).toBe(
    Math.round((viewportWidth ?? 0) * devicePixelRatio),
  );
}

test("matches the bounded practical-use visual contract", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Fail-closed persona guard" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);

  await selectPersona(page, "hr-operator");
  await navigate(page, /Work queue/);
  await expect(page.getByText("API contract connected")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "本日の業務サマリー" }),
  ).toBeVisible();
  await expect(page.getByText("今日と7日以内")).toBeVisible();
  await expect(page.getByRole("heading", { name: "連携状況" })).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, "dashboard");

  await navigate(page, /Employees/);
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "外部ID / 連携状態" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, "employee-detail");

  await navigate(page, /Transfer/);
  await expect(
    page.getByRole("heading", { name: "Transfer", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("手続き進捗")).toBeVisible();
  await expect(page.getByText("Transfer impact preview")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, "transfer");

  await page.getByRole("button", { name: "Create transfer request" }).click();
  await selectPersona(page, "approver");
  await navigate(page, /Approvals/);
  await expect(
    page.getByRole("heading", { name: "承認待ち一覧" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Transfer approvals" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, "approval-inbox");

  await selectPersona(page, "hr-ops-support");
  await navigate(page, /Ops\/DLQ/);
  await expect(page.getByText("Recent runs")).toBeVisible();
  await expect(page.getByText("Failed items")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "DLQ decision" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, "job-monitor");
});
