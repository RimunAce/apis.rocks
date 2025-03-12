////////////////////////////////
// Load Dependencies         //
//////////////////////////////
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { swagger } from "@elysiajs/swagger";
import { envService } from "./utility/env/env.service";

declare global {
  interface Request {
    startTime?: number;
  }
}

////////////////////////////////
// Load middlewares           //
////////////////////////////////
import compressionMiddleware from "./utility/compression/compression.service";
import logger from "./utility/logger/logger.service";
import ddosProtectionService from "./utility/ddos/ddos.service";

////////////////////////////////
// Importing routes           //
////////////////////////////////
import catService from "./routes/misc/cat/cat.service";
import healthService from "./routes/health/health.service";
import rootService from "./routes/root/root.service";
import modelsService from "./routes/ai/models/models.service";
import chatCompletionsService from "./routes/ai/chat.completions/chat.completions.service";
import adminService from "./routes/admin/admin.service";
import scrapperService from "./routes/misc/scrapper/scrapper.service";
import { mp3Service } from "./routes/youtube/mp3.service";
import { infoService } from "./routes/youtube/info.service";

////////////////////////////////
// Setting Up/Starting Up     //
////////////////////////////////

const logRequest = (app: Elysia) => {
  return app
    .onRequest(({ request }) => {
      const startTime = performance.now();
      logger.info(
        `Incoming ${request.method} request to ${request.url} from IP ${
          request.headers.get("x-forwarded-for") ?? request.headers.get("host")
        }`
      );
      request.startTime = startTime;
    })
    .onAfterHandle(({ request, set }) => {
      const duration = Math.round(performance.now() - (request.startTime ?? 0));
      logger.info(
        `Completed ${request.method} ${request.url} in ${duration}ms from IP ${
          request.headers.get("x-forwarded-for") ?? request.headers.get("host")
        } Code: ${set.status}`
      );
    });
};

const app = new Elysia({
  nativeStaticResponse: true,
  precompile: envService.get("NODE_ENV") === "production",
})
  .use(
    cors({
      origin: "*",
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  )
  .use(ddosProtectionService.middleware)
  .use(
    swagger({
      path: "/docs",
      documentation: {
        info: {
          title: "Apis.Rocks API",
          version: "1.2.0",
          description:
            "API documentation for the Apis.Rocks application with authentication system",
          contact: {
            name: "API Support",
            email: "hi@respire.my",
          },
        },
        tags: [
          { name: "GENERAL", description: "Root endpoints" },
          { name: "HEALTH", description: "Health check endpoints" },
          { name: "YOUTUBE", description: "YouTube related endpoints" },
          { name: "MISCELLANEOUS", description: "Cat related endpoints" },
          { name: "AI", description: "AI models related endpoints" },
          {
            name: "ADMIN",
            description: "Admin endpoints for user and API key management",
          },
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "API Key",
              description: "Enter your API key with the format: sk-ar-xxxxx",
            },
            adminKey: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "Admin Key",
              description: "Admin API key for managing users and API keys",
            },
          },
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                user_access_key: { type: "string" },
                key_total: { type: "integer", minimum: 0 },
                credits: { type: "integer", minimum: 0 },
                status: {
                  type: "string",
                  enum: ["active", "revoked", "expired"],
                },
                tier: {
                  type: "string",
                  enum: [
                    "Free",
                    "Tier 1",
                    "Tier 2",
                    "Tier 3",
                    "Tier 4",
                    "Tier 5",
                    "Custom",
                  ],
                },
                rate_limit: { type: "integer", minimum: 0, maximum: 6000 },
                usage_count: { type: "integer", minimum: 0 },
                tokens_input: { type: "integer", minimum: 0 },
                tokens_output: { type: "integer", minimum: 0 },
                created_at: { type: "string", format: "date-time" },
                updated_at: { type: "string", format: "date-time" },
              },
            },
            ApiKey: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                api_key: { type: "string" },
                key_name: { type: "string" },
                key_credits_usage: { type: "integer", minimum: 0 },
                status: {
                  type: "string",
                  enum: ["active", "revoked", "expired"],
                },
                last_used: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                expires_at: {
                  type: "string",
                  format: "date-time",
                  nullable: true,
                },
                owner_id: { type: "string", format: "uuid" },
                created_at: { type: "string", format: "date-time" },
                updated_at: { type: "string", format: "date-time" },
              },
            },
            UsageRecord: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                user_id: { type: "string", format: "uuid" },
                api_key_id: { type: "string", format: "uuid" },
                timestamp: { type: "string", format: "date-time" },
                request_type: { type: "string" },
                model: { type: "string" },
                tokens_input: { type: "integer", minimum: 0 },
                tokens_output: { type: "integer", minimum: 0 },
                credits_used: { type: "integer", minimum: 0 },
              },
            },
          },
        },
      },
    })
  )
  .onError(({ error, set }: { error: unknown; set: any }) => {
    if (!set.status || set.status === 200) {
      set.status = 500;
    }

    let errorMessage =
      "Internal Server Error. Please contact the Administrator for support. (Seriously)";

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error != null) {
      try {
        errorMessage = JSON.stringify(error, null, 2);
      } catch {
        const errorObj =
          typeof error === "object"
            ? Object.getOwnPropertyNames(error).reduce(
                (acc, key) => ({
                  ...acc,
                  [key]: (error as any)[key],
                }),
                {}
              )
            : error;
        errorMessage =
          JSON.stringify(errorObj) ||
          `Unknown error: ${Object.prototype.toString.call(error)}`;
      }
    }

    logger.error(`Error: ${errorMessage}`);

    return {
      error: errorMessage,
    };
  })
  .use(compressionMiddleware) // Compression.
  .use(logRequest) // Request logging middleware
  .use(rootService) // Root: "/"
  .use(catService) // Misc: "/cat"
  .use(mp3Service) // YouTube: "/youtube/mp3"
  .use(infoService) // YouTube: "/youtube/info"
  .use(scrapperService) // Scrapper: "/scrapper"
  .use(healthService) // Health: "/health"
  .use(modelsService) // Models: "/v1/models"
  .use(chatCompletionsService) // Chat Completions: "/v1/chat/completions"
  .use(adminService) // Admin: "/admin"
  .listen({
    port: envService.get("PORT"),
    idleTimeout: 65,
    maxRequestBodySize: 1024 * 1024 * 10, // Max request body size
    development: envService.get("NODE_ENV") === "development",
    reusePort: true, // Better for load balancing across multiple processes
  });

logger.info(
  `🎉 Apis.Rocks running in ${envService.get(
    "NODE_ENV"
  )} mode on port ${envService.get("PORT")}`
);

export type App = typeof app;
