import { Elysia } from "elysia";
import logger from "../logger/logger.service";
import redisService from "../redis/redis.service";
import { envService } from "../env/env.service";

const config = {
  ERROR_MESSAGE: {
    error: "Too Many Requests",
    message: "Your IP has been temporarily blocked due to suspicious activity",
    status: 429,
  },
  THRESHOLD_REQUESTS: envService.get("DDOS_THRESHOLD_REQUESTS"),
  TIME_WINDOW: envService.get("DDOS_TIME_WINDOW_SECONDS"),
  BAN_DURATION: envService.get("DDOS_BAN_DURATION_SECONDS"),
  ENABLED: envService.get("DDOS_PROTECTION_ENABLED") === true,
  EXCLUDED_ROUTES: envService
    .get("DDOS_EXCLUDED_ROUTES")
    .filter((route) => route !== ""),
};

class IPTracker {
  async track(ip: string): Promise<number> {
    if (!redisService.isRedisAvailable()) return 0;
    const redis = redisService.getRedisClient();
    if (!redis) return 0;

    const now = Math.floor(Date.now() / 1000);
    const windowKey = Math.floor(now / config.TIME_WINDOW);
    const ipKey = `ddos:${ip}:${windowKey}`;

    const count = await redis.incr(ipKey);
    if (count === 1) await redis.expire(ipKey, config.TIME_WINDOW * 2);
    return count;
  }

  async ban(ip: string): Promise<void> {
    const redis = redisService.getRedisClient();
    if (!redis) return;
    await redis.set(`ddos:banned:${ip}`, "1", { ex: config.BAN_DURATION });
  }

  async isBanned(ip: string): Promise<boolean> {
    const redis = redisService.getRedisClient();
    if (!redis) return false;
    return (await redis.exists(`ddos:banned:${ip}`)) === 1;
  }
}

class RouteProtector {
  isExcluded(pathname: string): boolean {
    if (pathname === "/" || pathname === "") return false;
    return config.EXCLUDED_ROUTES.some(
      (route) => route !== "" && pathname.startsWith(route)
    );
  }

  getClientIP(request: Request): string | null {
    return (
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("host")
    );
  }
}

class DDoSProtectionService {
  readonly ipTracker = new IPTracker();
  private readonly routeProtector = new RouteProtector();

  constructor() {
    logger.info("DDoS protection service initialized", {
      enabled: config.ENABLED,
      threshold: config.THRESHOLD_REQUESTS,
      timeWindow: config.TIME_WINDOW,
      banDuration: config.BAN_DURATION,
      excludedRoutes:
        config.EXCLUDED_ROUTES.length > 0 ? config.EXCLUDED_ROUTES : "None",
    });
  }

  middleware = (app: Elysia) => {
    return app.derive(async ({ request, set }) => {
      if (!config.ENABLED) return { isDDoS: false };

      const pathname = new URL(request.url).pathname;
      if (this.routeProtector.isExcluded(pathname)) return { isDDoS: false };
      if (!redisService.isRedisAvailable()) return { isDDoS: false };

      const clientIP = this.routeProtector.getClientIP(request);
      if (!clientIP) return { isDDoS: false };

      if (await this.ipTracker.isBanned(clientIP)) {
        set.status = 429;
        set.headers = {
          "Content-Type": "application/json",
          "Retry-After": config.BAN_DURATION.toString(),
          "X-RateLimit-Reset": (
            Math.floor(Date.now() / 1000) + config.BAN_DURATION
          ).toString(),
        };
        return {
          error: "Too Many Requests",
          message:
            "Your IP has been temporarily blocked due to suspicious activity",
        };
      }

      const requestCount = await this.ipTracker.track(clientIP);
      if (requestCount > config.THRESHOLD_REQUESTS) {
        await this.ipTracker.ban(clientIP);
        set.status = 429;
        set.headers = {
          "Content-Type": "application/json",
          "Retry-After": config.BAN_DURATION.toString(),
          "X-RateLimit-Reset": (
            Math.floor(Date.now() / 1000) + config.BAN_DURATION
          ).toString(),
        };
        return {
          error: "Too Many Requests",
          message:
            "Your IP has been temporarily blocked due to suspicious activity",
        };
      }

      return { isDDoS: false };
    });
  };
}

export default new DDoSProtectionService();
