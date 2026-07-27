import Fastify, { type FastifyInstance } from "fastify";

import { type MvpAOnboardingTraceabilityDatabase } from "./mvp-a-onboarding-traceability.js";
import { type OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { loadOpenApiContract } from "./openapi.js";
import { listSyntheticProvisioningRuns } from "./provisioning-runs.js";
import { registerMvpAOnboardingAuditRoutes } from "./routes/mvp-a-onboarding-audit.js";
import { registerMvpAOnboardingSupportReviewRoutes } from "./routes/mvp-a-onboarding-support-review.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import {
  registerP2ListAuditEvidenceRoutes,
  type P2ListAuditEvidenceRuntime,
} from "./routes/p2list-audit-evidence.js";
import {
  registerP2ListEmployeeRoutes,
  type P2ListEmployeeApiRuntime,
} from "./routes/p2list-employees.js";
import {
  registerP2ListExportRoutes,
  type P2ListExportApiRuntime,
} from "./routes/p2list-exports.js";
import {
  registerP2ListLifecycleRoutes,
  type P2ListLifecycleApiRuntime,
} from "./routes/p2list-lifecycle-requests.js";
import { registerTerminationRoutes } from "./routes/termination.js";
import { registerTransferRoutes } from "./routes/transfer.js";
import { registerWritebackRoutes } from "./routes/writeback.js";
import { type SyntheticWritebackDatabase } from "./writeback-ingest.js";

export interface BuildAppOptions {
  logger?: boolean;
  onboardingDb?: OnboardingTransactionRequestDatabase;
  auditTraceDb?: MvpAOnboardingTraceabilityDatabase;
  writebackDb?: SyntheticWritebackDatabase;
  p2ListEmployeeApi?: P2ListEmployeeApiRuntime;
  p2ListAuditEvidenceApi?: P2ListAuditEvidenceRuntime;
  p2ListExportApi?: P2ListExportApiRuntime;
  p2ListLifecycleApi?: P2ListLifecycleApiRuntime;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.get("/health", async () => {
    return { status: "ok" as const };
  });

  app.get("/openapi.json", async (_request, reply) => {
    const contract = await loadOpenApiContract();
    return reply.type("application/json").send(contract);
  });

  app.get("/provisioning-runs", async () => {
    return listSyntheticProvisioningRuns();
  });

  registerMvpAOnboardingAuditRoutes(app, options);
  registerMvpAOnboardingSupportReviewRoutes(app, options);
  registerP2ListAuditEvidenceRoutes(app, options);
  registerP2ListEmployeeRoutes(app, options);
  registerP2ListExportRoutes(app, options);
  registerP2ListLifecycleRoutes(app, options);
  registerOnboardingRoutes(app, options);
  registerTerminationRoutes(app, options);
  registerTransferRoutes(app, options);
  registerWritebackRoutes(app, options);

  return app;
}
