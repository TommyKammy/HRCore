import Fastify, { type FastifyInstance } from "fastify";

import { type MvpAOnboardingTraceabilityDatabase } from "./mvp-a-onboarding-traceability.js";
import { type OnboardingTransactionRequestDatabase } from "./onboarding-transaction-request.js";
import { loadOpenApiContract } from "./openapi.js";
import { listSyntheticProvisioningRuns } from "./provisioning-runs.js";
import { registerMvpAOnboardingAuditRoutes } from "./routes/mvp-a-onboarding-audit.js";
import { registerMvpAOnboardingSupportReviewRoutes } from "./routes/mvp-a-onboarding-support-review.js";
import { registerOnboardingRoutes } from "./routes/onboarding.js";
import { registerWritebackRoutes } from "./routes/writeback.js";
import { type SyntheticWritebackDatabase } from "./writeback-ingest.js";

export interface BuildAppOptions {
  logger?: boolean;
  onboardingDb?: OnboardingTransactionRequestDatabase;
  auditTraceDb?: MvpAOnboardingTraceabilityDatabase;
  writebackDb?: SyntheticWritebackDatabase;
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
  registerOnboardingRoutes(app, options);
  registerWritebackRoutes(app, options);

  return app;
}
