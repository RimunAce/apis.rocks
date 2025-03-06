import { Elysia, t } from "elysia";
import supabase from "../../utility/database/database.service";
import redisService from "../../utility/redis/redis.service";
import { envService } from "../../utility/env/env.service";
import os from "node:os";

interface HealthCheck {
  name: string;
  status: "healthy" | "unhealthy";
  message?: string;
  latency?: number;
}

const healthService = new Elysia().get(
  "/health",
  async () => {
    const startTime = performance.now();
    const checks: HealthCheck[] = [];
    let overallStatus: "healthy" | "degraded" | "unhealthy" = "healthy";

    try {
      const dbStartTime = performance.now();

      const { error } = await supabase.auth.getSession();

      if (error) {
        throw new Error(error.message);
      }

      const dbLatency = Math.round(performance.now() - dbStartTime);

      checks.push({
        name: "database",
        status: "healthy",
        latency: dbLatency,
      });
    } catch (error) {
      checks.push({
        name: "database",
        status: "unhealthy",
        message:
          error instanceof Error ? error.message : "Unknown database error",
      });
      overallStatus = "unhealthy";
    }

    try {
      const redisStartTime = performance.now();
      const isRedisAvailable = redisService.isRedisAvailable();
      const redisLatency = Math.round(performance.now() - redisStartTime);

      if (!isRedisAvailable) {
        checks.push({
          name: "redis",
          status: "unhealthy",
          message: "Redis connection not available",
          latency: redisLatency,
        });

        if (overallStatus === "healthy") {
          overallStatus = "degraded";
        }
      } else {
        checks.push({
          name: "redis",
          status: "healthy",
          latency: redisLatency,
        });
      }
    } catch (error) {
      checks.push({
        name: "redis",
        status: "unhealthy",
        message: error instanceof Error ? error.message : "Unknown Redis error",
      });

      if (overallStatus === "healthy") {
        overallStatus = "degraded";
      }
    }

    const systemInfo = {
      uptime: Math.floor(process.uptime()),
      memory: {
        total: Math.round(os.totalmem() / (1024 * 1024)),
        free: Math.round(os.freemem() / (1024 * 1024)),
        usage: Math.round((1 - os.freemem() / os.totalmem()) * 100),
      },
      cpu: {
        cores: os.cpus().length,
        model: os.cpus()[0]?.model || "Unknown",
      },
      node: process.version,
      environment: envService.get("NODE_ENV"),
    };

    const responseTime = Math.round(performance.now() - startTime);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime,
      checks,
      system: systemInfo,
    };
  },
  {
    detail: {
      summary: "Health Check",
      description: "Returns the health status of the API and its dependencies",
      tags: ["HEALTH"],
    },
    response: {
      200: t.Object({
        status: t.Union([
          t.Literal("healthy"),
          t.Literal("degraded"),
          t.Literal("unhealthy"),
        ]),
        timestamp: t.String(),
        responseTime: t.Number(),
        checks: t.Array(
          t.Object({
            name: t.String(),
            status: t.Union([t.Literal("healthy"), t.Literal("unhealthy")]),
            message: t.Optional(t.String()),
            latency: t.Optional(t.Number()),
          })
        ),
        system: t.Object({
          uptime: t.Number(),
          memory: t.Object({
            total: t.Number(),
            free: t.Number(),
            usage: t.Number(),
          }),
          cpu: t.Object({
            cores: t.Number(),
            model: t.String(),
          }),
          node: t.String(),
          environment: t.String(),
        }),
      }),
    },
  }
);

export default healthService;
