import { defineConfig, devices } from "@playwright/test";

import { p2zVisualEvidenceProjects } from "./src/p2z-webui-visual-evidence-contract.js";

const reuseExistingServer =
  !process.env.CI && process.env.CAPTURE_WEB_EVIDENCE !== "1";

export default defineConfig({
  testDir: "./web/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    colorScheme: "light",
    locale: "ja-JP",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev",
      url: "http://127.0.0.1:3000/health",
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: "npm run dev:web",
      url: "http://127.0.0.1:5173",
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: "reference-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 1000 },
      },
    },
    {
      name: "desktop-chromium",
      use: {
        ...devices[p2zVisualEvidenceProjects["desktop-chromium"].device],
        viewport: {
          ...p2zVisualEvidenceProjects["desktop-chromium"].viewport,
        },
        deviceScaleFactor:
          p2zVisualEvidenceProjects["desktop-chromium"].deviceScaleFactor,
      },
    },
    {
      name: "compact-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "tablet-chromium",
      use: {
        ...devices[p2zVisualEvidenceProjects["tablet-chromium"].device],
        viewport: {
          ...p2zVisualEvidenceProjects["tablet-chromium"].viewport,
        },
        deviceScaleFactor:
          p2zVisualEvidenceProjects["tablet-chromium"].deviceScaleFactor,
      },
    },
    {
      name: "mobile-chromium",
      use: {
        ...devices[p2zVisualEvidenceProjects["mobile-chromium"].device],
        browserName: "chromium",
        viewport: {
          ...p2zVisualEvidenceProjects["mobile-chromium"].viewport,
        },
        deviceScaleFactor:
          p2zVisualEvidenceProjects["mobile-chromium"].deviceScaleFactor,
      },
    },
  ],
});
