import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, type Page, test, type TestInfo } from "@playwright/test";

import {
  p2zVisualEvidenceProjectNames,
  p2zVisualEvidenceScreenNames,
  p2zVisualEvidenceScreens,
  type P2zVisualEvidenceProject,
  type P2zVisualEvidenceScreen,
} from "../../src/p2z-webui-visual-evidence-contract.js";
import {
  createP2zVisualEvidenceCaptureProvenance,
  p2zVisualEvidenceCaptureProvenanceFile,
} from "../../src/p2z-webui-visual-evidence-integrity.js";

const captureEvidence = process.env.CAPTURE_WEB_EVIDENCE === "1";
const evidenceDirectory = path.resolve(
  process.cwd(),
  "docs/evidence/p2z-webui",
);
const observedCaptureScreens = new Set<P2zVisualEvidenceScreen>();

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
  if ((page.viewportSize()?.width ?? 0) <= 768) {
    const closeButton = page.getByRole("button", {
      name: "ナビゲーションを閉じる",
    });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
    await expect(
      page.getByRole("button", { name: "ナビゲーションを開く" }),
    ).toBeVisible();
  }
}

async function navigate(page: Page, name: RegExp) {
  await openMobileNavigation(page);
  await page.getByRole("navigation").getByRole("button", { name }).click();
  if ((page.viewportSize()?.width ?? 0) <= 768) {
    await expect(
      page.getByRole("button", { name: "ナビゲーションを開く" }),
    ).toBeVisible();
    await page.waitForTimeout(220);
  }
}

async function assertNoHorizontalOverflow(page: Page) {
  const configuredViewportWidth = page.viewportSize()?.width;
  const report = await page.evaluate(() => {
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const tableAncestors = [];
    let tableAncestor = document.querySelector<HTMLElement>("table");
    while (tableAncestor) {
      const rect = tableAncestor.getBoundingClientRect();
      const styles = window.getComputedStyle(tableAncestor);
      tableAncestors.push({
        selector:
          tableAncestor.className && typeof tableAncestor.className === "string"
            ? `${tableAncestor.tagName.toLowerCase()}.${tableAncestor.className.trim().replaceAll(/\s+/gu, ".")}`
            : tableAncestor.tagName.toLowerCase(),
        width: Math.round(rect.width),
        clientWidth: tableAncestor.clientWidth,
        scrollWidth: tableAncestor.scrollWidth,
        minWidth: styles.minWidth,
        overflowX: styles.overflowX,
        contain: styles.contain,
      });
      tableAncestor = tableAncestor.parentElement;
    }
    const overflowElements = [
      ...document.querySelectorAll<HTMLElement>("body *"),
    ]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          selector:
            element.className && typeof element.className === "string"
              ? `${element.tagName.toLowerCase()}.${element.className.trim().replaceAll(/\s+/gu, ".")}`
              : element.tagName.toLowerCase(),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          scrollWidth: element.scrollWidth,
        };
      })
      .filter(
        ({ left, right, width }) =>
          left < -1 || right > viewportWidth + 1 || width > viewportWidth + 1,
      )
      .sort((left, right) => right.width - left.width)
      .slice(0, 8);

    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      layoutViewportWidth: window.innerWidth,
      visualViewportWidth: viewportWidth,
      overflowElements,
      tableAncestors,
    };
  });

  expect(configuredViewportWidth).toBeDefined();
  for (const measuredWidth of [
    report.bodyWidth,
    report.documentWidth,
    report.layoutViewportWidth,
    report.visualViewportWidth,
  ]) {
    expect(measuredWidth, JSON.stringify(report)).toBeLessThanOrEqual(
      (configuredViewportWidth ?? 0) + 1,
    );
  }
}

async function assertRowActionsWithinViewport(page: Page) {
  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBeDefined();
  await expect
    .poll(
      () =>
        page.evaluate((expectedViewportWidth) => {
          const actions = Array.from(
            document.querySelectorAll<HTMLElement>(
              ".collection-results .row-action",
            ),
          );
          return (
            actions.length > 0 &&
            actions.every((action) => {
              const bounds = action.getBoundingClientRect();
              return (
                bounds.width > 0 &&
                bounds.height > 0 &&
                bounds.left >= 0 &&
                bounds.right <= expectedViewportWidth
              );
            })
          );
        }, viewportWidth ?? 0),
      { message: "row actions must be visible within the viewport" },
    )
    .toBe(true);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  name: P2zVisualEvidenceScreen,
) {
  observedCaptureScreens.add(name);

  if (!captureEvidence) {
    return;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
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

async function mockBoundedCollectionApis(page: Page) {
  await page.route("**/employees**", async (route) => {
    const url = new URL(route.request().url());
    const employeeDetailId = url.pathname.match(/^\/employees\/([^/]+)$/u)?.[1];
    if (employeeDetailId) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          item: {
            personId: "person-001",
            employeeId: decodeURIComponent(employeeDetailId),
            displayName: "Synthetic Employee 001",
            employmentStatus: "active",
            organizationCode: "ORG-SYNTHETIC",
            positionCode: "POS-001",
            hireDate: "2026-01-01",
            terminationDate: null,
          },
          asOf: url.searchParams.get("asOf") ?? "2026-07-26",
          authorization: {
            dataScope: "bounded",
            maskedFields: ["terminationDate"],
            readiness: "bounded_synthetic_only_not_production_ready",
          },
          correlationId: "employee-detail-correlation",
        }),
      });
      return;
    }
    if (url.searchParams.get("organizationCode") === "DENIED") {
      await route.fulfill({ status: 403, body: "" });
      return;
    }
    if (url.searchParams.get("q") === "SERVICE") {
      await route.fulfill({ status: 503, body: "" });
      return;
    }
    const cursor = url.searchParams.get("cursor");
    if (cursor && cursor !== "e2e-opaque-next-page") {
      await route.fulfill({ status: 400, body: "" });
      return;
    }
    const secondPage = cursor === "e2e-opaque-next-page";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            personId: secondPage ? "person-002" : "person-001",
            employeeId: secondPage ? "EMP-002" : "EMP-001",
            displayName: secondPage
              ? "Synthetic Employee 002"
              : "Synthetic Employee 001",
            employmentStatus: "active",
            organizationCode: "ORG-SYNTHETIC",
            positionCode: secondPage ? "POS-002" : "POS-001",
            hireDate: "2026-01-01",
            terminationDate: null,
          },
        ],
        pageInfo: {
          limit: 25,
          hasNextPage: !secondPage,
          nextCursor: secondPage ? null : "e2e-opaque-next-page",
        },
        appliedFilters: { asOf: "2026-07-26" },
        authorization: {
          dataScope: "bounded",
          maskedFields: ["terminationDate"],
          readiness: "bounded_synthetic_only_not_production_ready",
        },
        correlationId: secondPage
          ? "employee-list-page-2"
          : "employee-list-page-1",
      }),
    });
  });

  await page.route("**/lifecycle/transaction-requests**", async (route) => {
    const url = new URL(route.request().url());
    const requests = [
      {
        transactionRequestId: "request-onboarding-001",
        requestType: "onboarding",
        status: "submitted",
        subjectPersonId: "person-001",
        subjectEmployeeId: "EMP-001",
        subjectDisplayName: "Synthetic Onboarding Subject",
        organizationCode: "ORG-LIFECYCLE-SYNTHETIC",
        decidedBy: null,
        requestedAt: "2026-07-01T00:00:00.000Z",
        effectiveDate: "2026-08-01",
      },
      {
        transactionRequestId: "request-transfer-001",
        requestType: "transfer",
        status: "approved",
        subjectPersonId: "person-002",
        subjectEmployeeId: "EMP-002",
        subjectDisplayName: "Synthetic Transfer Subject",
        organizationCode: "ORG-LIFECYCLE-SYNTHETIC",
        decidedBy: "bounded-approver",
        requestedAt: "2026-07-02T00:00:00.000Z",
        effectiveDate: "2026-08-02",
      },
      {
        transactionRequestId: "request-termination-001",
        requestType: "termination",
        status: "completed",
        subjectPersonId: "person-003",
        subjectEmployeeId: "EMP-003",
        subjectDisplayName: "Synthetic Termination Subject",
        organizationCode: "ORG-LIFECYCLE-SYNTHETIC",
        decidedBy: "bounded-approver",
        requestedAt: "2026-07-03T00:00:00.000Z",
        effectiveDate: "2026-08-03",
      },
    ];
    const requestDetailId = url.pathname.match(
      /^\/lifecycle\/transaction-requests\/([^/]+)$/u,
    )?.[1];
    if (requestDetailId) {
      const item = requests.find(
        (request) =>
          request.transactionRequestId === decodeURIComponent(requestDetailId),
      );
      await route.fulfill({
        status: item ? 200 : 404,
        contentType: "application/json",
        body: JSON.stringify(
          item
            ? {
                item,
                authorization: {
                  dataScope: "bounded",
                  maskedFields: ["decidedBy"],
                  readiness: "bounded_synthetic_only_not_production_ready",
                },
                correlationId: "lifecycle-detail-correlation",
              }
            : {},
        ),
      });
      return;
    }
    const requestType = url.searchParams.get("requestType");
    const filteredRequests = requestType
      ? requests.filter((request) => request.requestType === requestType)
      : requests;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: filteredRequests,
        pageInfo: {
          limit: 25,
          hasNextPage: false,
          nextCursor: null,
        },
        appliedFilters: {},
        authorization: {
          dataScope: "bounded",
          maskedFields: ["decidedBy"],
          readiness: "bounded_synthetic_only_not_production_ready",
        },
        correlationId: "lifecycle-list-page-1",
      }),
    });
  });
}

test("matches the bounded practical-use visual contract", async ({
  page,
}, testInfo) => {
  observedCaptureScreens.clear();
  await mockBoundedCollectionApis(page);
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
  await capture(page, testInfo, p2zVisualEvidenceScreens.dashboard);

  await navigate(page, /Employees/);
  await expect(page.getByRole("heading", { name: "Employees" })).toBeVisible();
  await expect(page.getByText("Synthetic Employee 001")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await assertRowActionsWithinViewport(page);
  await capture(page, testInfo, p2zVisualEvidenceScreens.employeeList);

  await page.getByRole("textbox", { name: "組織コード" }).fill("DENIED");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(
    page.getByText("この一覧を表示する権限が確認できません"),
  ).toBeVisible();
  await page.getByRole("button", { name: "条件をリセット" }).click();
  await expect(page.getByText("Synthetic Employee 001")).toBeVisible();

  await page.getByRole("textbox", { name: "氏名・従業員ID" }).fill("SERVICE");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByText("一覧APIの応答を確認できません")).toBeVisible();
  await page.getByRole("button", { name: "条件をリセット" }).click();
  await expect(page.getByText("Synthetic Employee 001")).toBeVisible();

  await page.evaluate(() => {
    window.history.pushState(null, "", "/?view=employees&cursor=tampered");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByText("検索条件またはページ情報が無効です"),
  ).toBeVisible();
  await page.getByRole("button", { name: "条件をリセット" }).click();
  await expect(page.getByText("Synthetic Employee 001")).toBeVisible();

  await page.getByRole("textbox", { name: "氏名・従業員ID" }).fill("Synthetic");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL(/q=Synthetic/u);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Fail-closed persona guard" }),
  ).toBeVisible();
  await selectPersona(page, "hr-operator");
  await expect(
    page.getByRole("textbox", { name: "氏名・従業員ID" }),
  ).toHaveValue("Synthetic");
  await expect(page.getByText("Synthetic Employee 001")).toBeVisible();
  await page.getByRole("button", { name: "次のページへ" }).click();
  await expect(page.getByText("Synthetic Employee 002")).toBeVisible();
  await expect(page).toHaveURL(/cursor=e2e-opaque-next-page/u);
  await page.getByRole("button", { name: "前のページへ" }).click();
  await expect(page.getByText("Synthetic Employee 001")).toBeVisible();

  await page
    .getByRole("button", { name: "Synthetic Employee 001の詳細を開く" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Employee detail" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "一覧レコード情報" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "外部ID / 連携状態" }),
  ).toHaveCount(0);

  await page
    .getByRole("textbox", { name: "Bounded record ID" })
    .fill("EMP-000128");
  await page.getByRole("button", { name: "参照", exact: true }).click();
  await page.reload();
  await selectPersona(page, "hr-operator");
  await expect(page.getByRole("heading", { name: "基本情報" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "履歴タイムライン" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "外部ID / 連携状態" }),
  ).toBeVisible();
  await expect(page.getByText("taro.yamada@***")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "異動手続きを開く" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, p2zVisualEvidenceScreens.employeeDetail);

  await navigate(page, /Procedures/);
  await expect(page.getByRole("heading", { name: "Procedures" })).toBeVisible();
  for (const [subject, requestId, heading] of [
    ["Synthetic Onboarding Subject", "request-onboarding-001", "Onboarding"],
    ["Synthetic Transfer Subject", "request-transfer-001", "Transfer"],
    ["Synthetic Termination Subject", "request-termination-001", "Termination"],
  ] as const) {
    await page.getByRole("button", { name: `${subject}の` }).click();
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible();
    await expect(page.getByText(requestId)).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: "Procedures" }),
    ).toBeVisible();
  }
  await page
    .getByRole("listbox", { name: "手続き種別" })
    .selectOption("onboarding");
  await page.getByRole("listbox", { name: "状態" }).selectOption("submitted");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page).toHaveURL(/requestType=onboarding/u);
  await assertNoHorizontalOverflow(page);
  await assertRowActionsWithinViewport(page);
  await capture(page, testInfo, p2zVisualEvidenceScreens.lifecycleList);

  await navigate(page, /Transfer/);
  await expect(
    page.getByRole("heading", { name: "Transfer", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("手続き進捗")).toBeVisible();
  await expect(page.getByText("Transfer impact preview")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, p2zVisualEvidenceScreens.transfer);

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
  await capture(page, testInfo, p2zVisualEvidenceScreens.approvalInbox);

  await selectPersona(page, "hr-ops-support");
  await navigate(page, /Ops\/DLQ/);
  await expect(page.getByText("Recent runs")).toBeVisible();
  await expect(page.getByText("Failed items")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "DLQ decision" }),
  ).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await capture(page, testInfo, p2zVisualEvidenceScreens.jobMonitor);
  expect([...observedCaptureScreens].sort()).toEqual(
    [...p2zVisualEvidenceScreenNames].sort(),
  );

  if (captureEvidence) {
    expect(p2zVisualEvidenceProjectNames).toContain(testInfo.project.name);
    const project = testInfo.project.name as P2zVisualEvidenceProject;
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const provenance = await createP2zVisualEvidenceCaptureProvenance(project, {
      viewport: viewport ?? { width: 0, height: 0 },
      deviceScaleFactor: await page.evaluate(() => window.devicePixelRatio),
    });
    await writeFile(
      path.join(
        evidenceDirectory,
        p2zVisualEvidenceCaptureProvenanceFile(project),
      ),
      `${JSON.stringify(provenance, null, 2)}\n`,
      "utf8",
    );
  }
});
