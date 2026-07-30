import { spawnSync } from "node:child_process";
import path from "node:path";

import { invalidateP2zVisualEvidenceCaptureProvenance } from "../src/p2z-webui-visual-evidence-integrity.js";

await invalidateP2zVisualEvidenceCaptureProvenance();

const playwrightCli = path.resolve(
  process.cwd(),
  "node_modules/@playwright/test/cli.js",
);
const capture = spawnSync(
  process.execPath,
  [
    playwrightCli,
    "test",
    "--project=desktop-chromium",
    "--project=tablet-chromium",
    "--project=mobile-chromium",
  ],
  {
    env: { ...process.env, CAPTURE_WEB_EVIDENCE: "1" },
    stdio: "inherit",
  },
);

if (capture.error) {
  throw capture.error;
}
if (capture.status !== 0) {
  process.exitCode = capture.status ?? 1;
}
