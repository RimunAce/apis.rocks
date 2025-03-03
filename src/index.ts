////////////////////////////////
// Load Dependencies         //
//////////////////////////////
import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { envService } from "./utility/env/env.service";

////////////////////////////////
// Load middlewares           //
////////////////////////////////
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

const logRequest = (app: Elysia) => {
  return app.onRequest(({ request }) => {
    const startTime = performance.now();
    logger.info(
      `Incoming ${request.method} request to ${request.url} from IP ${
        request.headers.get("x-forwarded-for") || request.headers.get("host")
      }`
    );
    return () => {
      const duration = Math.round(performance.now() - startTime);
      logger.info(
        `Completed ${request.method} ${request.url} in ${duration}ms from IP ${
          request.headers.get("x-forwarded-for") || request.headers.get("host")
        }`
      );
    };
  });
};

const app = new Elysia()
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "Apis.Rocks",
          version: "1.0.0",
          description: "API documentation for the Apis.Rocks application",
        },
        tags: [
          { name: "root", description: "Root endpoints" },
          { name: "health", description: "Health check endpoints" },
          { name: "cat", description: "Cat related endpoints" },
          { name: "models", description: "AI models related endpoints" },
        ],
      },
    })
  )
  .use(logRequest) // Request logging middleware
  .use(compressionMiddleware) // Compression Middleware - Gzip
  .use(rootService) // Root: "/"
  .use(catService) // Misc: "/cat"
  .use(healthService) // Health: "/health"
  .use(modelsService) // Models: "/models"
  .listen(envService.get("PORT"));

logger.info(
  `🦊 Elysia running in ${envService.get(
    "NODE_ENV"
  )} mode on port ${envService.get("PORT")}`
);

export type App = typeof app;
