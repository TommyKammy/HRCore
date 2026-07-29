export const p2zVisualEvidenceContractVersion = "p2z-webui-visual-alignment-v1";
export const p2zVisualEvidenceCaptureCommand = "npm run capture:web:evidence";

export const p2zVisualEvidenceProjects = {
  "desktop-chromium": {
    device: "Desktop Chrome",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  },
  "tablet-chromium": {
    device: "Desktop Chrome",
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 1,
  },
  "mobile-chromium": {
    device: "iPhone 13",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
  },
} as const;

export type P2zVisualEvidenceProject = keyof typeof p2zVisualEvidenceProjects;

export const p2zVisualEvidenceProjectNames = Object.keys(
  p2zVisualEvidenceProjects,
) as P2zVisualEvidenceProject[];

export const p2zVisualEvidenceScreens = {
  dashboard: "dashboard",
  employeeList: "employee-list",
  employeeDetail: "employee-detail",
  lifecycleList: "lifecycle-list",
  transfer: "transfer",
  approvalInbox: "approval-inbox",
  jobMonitor: "job-monitor",
} as const;

export type P2zVisualEvidenceScreen =
  (typeof p2zVisualEvidenceScreens)[keyof typeof p2zVisualEvidenceScreens];

export const p2zVisualEvidenceScreenNames = Object.values(
  p2zVisualEvidenceScreens,
);

export const p2zExpectedVisualEvidenceFiles =
  p2zVisualEvidenceProjectNames.flatMap((project) =>
    p2zVisualEvidenceScreenNames.map((screen) => `${project}-${screen}.png`),
  );

export function validateP2zVisualEvidenceInventory(
  actualFiles: readonly string[],
): string[] {
  const errors: string[] = [];
  const expected = new Set(p2zExpectedVisualEvidenceFiles);
  const actual = new Set(actualFiles);

  for (const file of actualFiles) {
    if (actualFiles.indexOf(file) !== actualFiles.lastIndexOf(file)) {
      errors.push(`duplicate evidence file: ${file}`);
    }
  }
  for (const file of expected) {
    if (!actual.has(file)) {
      errors.push(`missing expected evidence file: ${file}`);
    }
  }
  for (const file of actual) {
    if (!expected.has(file)) {
      errors.push(`unexpected evidence file: ${file}`);
    }
  }

  return [...new Set(errors)].sort();
}
