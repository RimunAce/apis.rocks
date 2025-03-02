import { Elysia, t } from "elysia";
import { env } from "process";
import compressionMiddleware from "./utility/compression/compression.service";
import logger from "./utility/logger/logger.service";

////////////////////////////////
// Importing routes           //
////////////////////////////////
import catService from "./routes/misc/cat/cat.service";
import healthService from "./routes/health/health.service";
import rootService from "./routes/root/root.service";
import modelsService from "./routes/ai/models/models.service";

////////////////////////////////
// Setting Up/Starting Up     //
////////////////////////////////
const app = new Elysia()
  .use(compressionMiddleware)
  .use(rootService) // Root: "/"
  .use(catService) // Misc: "/cat"
  .use(healthService) // Health: "/health"
  .use(modelsService) // Models: "/models"
  .listen(env.PORT || 3000);

logger.info(`🦊 Elysia running in ${env.NODE_ENV} mode on port ${env.PORT}`);

export type App = typeof app;
