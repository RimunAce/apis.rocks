import { Elysia } from "elysia";
import logger from "../logger/logger.service";
import redisService from "../redis/redis.service";
import { envService } from "../env/env.service";

const DDOS_ERROR_MESSAGE = {
  error: "Too Many Requests",
  message: "Your IP has been temporarily blocked due to suspicious activity",
  status: 429,
};

const DDOS_THRESHOLD_REQUESTS = envService.get("DDOS_THRESHOLD_REQUESTS");
const DDOS_TIME_WINDOW_SECONDS = envService.get("DDOS_TIME_WINDOW_SECONDS");
const DDOS_BAN_DURATION_SECONDS = envService.get("DDOS_BAN_DURATION_SECONDS");
const DDOS_PROTECTION_ENABLED =
  envService.get("DDOS_PROTECTION_ENABLED") === true;

// Routes that are excluded from DDoS protection
const EXCLUDED_ROUTES: string[] = envService
  .get("DDOS_EXCLUDED_ROUTES")
  .filter((route) => route !== "");

class DDoSProtectionService {
  constructor() {
    logger.info("DDoS protection service initialized", {
      enabled: DDOS_PROTECTION_ENABLED,
      threshold: DDOS_THRESHOLD_REQUESTS,
      timeWindow: DDOS_TIME_WINDOW_SECONDS,
      banDuration: DDOS_BAN_DURATION_SECONDS,
      excludedRoutes:
        EXCLUDED_ROUTES.length > 0
          ? EXCLUDED_ROUTES
          : "None - all routes are protected",
    });
  }

  middleware = (app: Elysia) => {
    return app.derive(async ({ request, set }) => {
      if (!DDOS_PROTECTION_ENABLED) {
        logger.info("DDoS protection is disabled");
        return { isDDoS: false };
      }

      const url = new URL(request.url);
      const pathname = url.pathname;

      logger.info(`Checking DDoS protection for path: ${pathname}`);

      // Check if the route should be excluded from protection
      if (this.isExcludedRoute(pathname)) {
        logger.info(`Path ${pathname} is excluded from DDoS protection`);
        return { isDDoS: false };
      }

      if (!redisService.isRedisAvailable()) {
        logger.warn("Redis not available, DDoS protection disabled");
        return { isDDoS: false };
      }

      const clientIP = this.getClientIP(request);
      if (!clientIP) {
        logger.warn("Could not determine client IP, skipping DDoS check");
        return { isDDoS: false };
      }

      logger.info(
        `Checking DDoS protection for IP: ${clientIP}, path: ${pathname}`
      );

      const isMarkedAsDDoS = await this.isIPMarkedAsDDoS(clientIP);
      if (isMarkedAsDDoS) {
        logger.warn(`Blocked DDoS attacker: ${clientIP}`);
        set.status = 429;
        set.headers = {
          "Retry-After": DDOS_BAN_DURATION_SECONDS.toString(),
          "X-RateLimit-Reset": (
            Math.floor(Date.now() / 1000) + DDOS_BAN_DURATION_SECONDS
          ).toString(),
        } as Record<string, string>;
        return DDOS_ERROR_MESSAGE;
      }

      const requestCount = await this.trackIPRequest(clientIP);
      logger.info(
        `Request count for IP ${clientIP}: ${requestCount}/${DDOS_THRESHOLD_REQUESTS}`
      );

      if (requestCount > DDOS_THRESHOLD_REQUESTS) {
        logger.warn(
          `Potential DDoS attack detected from IP: ${clientIP}, request count: ${requestCount}`
        );
        await this.markIPAsDDoS(clientIP);
        set.status = 429;
        set.headers = {
          "Retry-After": DDOS_BAN_DURATION_SECONDS.toString(),
          "X-RateLimit-Reset": (
            Math.floor(Date.now() / 1000) + DDOS_BAN_DURATION_SECONDS
          ).toString(),
        } as Record<string, string>;
        return DDOS_ERROR_MESSAGE;
      }

      return { isDDoS: false };
    });
  };

  private isExcludedRoute(pathname: string): boolean {
    // Special case for root route - always protect it
    if (pathname === "/" || pathname === "") {
      logger.info("Root route is always protected from DDoS attacks");
      return false;
    }

    // Debug logging
    logger.info(
      `Checking if path ${pathname} is excluded from DDoS protection`
    );
    logger.info(`Excluded routes: ${JSON.stringify(EXCLUDED_ROUTES)}`);

    // Check if the route should be excluded
    const isExcluded = EXCLUDED_ROUTES.some((route) => {
      if (route === "") return false; // Skip empty routes

      const excluded = pathname.startsWith(route);
      if (excluded) {
        logger.info(`Path ${pathname} matches excluded route ${route}`);
      }
      return excluded;
    });

    return isExcluded;
  }

  private getClientIP(request: Request): string | null {
    const cfConnectingIP = request.headers.get("cf-connecting-ip");
    if (cfConnectingIP) return cfConnectingIP;

    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      const ips = forwardedFor.split(",");
      return ips[0].trim();
    }

    const host = request.headers.get("host");
    return host;
  }

  private async trackIPRequest(ip: string): Promise<number> {
    if (!redisService.isRedisAvailable()) return 0;

    try {
      const redis = redisService.getRedisClient();
      if (!redis) return 0;

      const now = Math.floor(Date.now() / 1000);
      const windowKey = Math.floor(now / DDOS_TIME_WINDOW_SECONDS);
      const ipKey = `ddos:${ip}:${windowKey}`;

      const count = await redis.incr(ipKey);

      if (count === 1) {
        await redis.expire(ipKey, DDOS_TIME_WINDOW_SECONDS * 2);
      }

      return count;
    } catch (error) {
      logger.error("Error tracking IP request count", { error, ip });
      return 0;
    }
  }

  private async markIPAsDDoS(ip: string): Promise<void> {
    if (!redisService.isRedisAvailable()) return;

    try {
      const redis = redisService.getRedisClient();
      if (!redis) return;

      const banKey = `ddos:banned:${ip}`;
      await redis.set(banKey, "1", { ex: DDOS_BAN_DURATION_SECONDS });

      logger.warn(
        `Marked IP as DDoS attacker: ${ip}, banned for ${DDOS_BAN_DURATION_SECONDS} seconds`
      );
    } catch (error) {
      logger.error("Error marking IP as DDoS attacker", { error, ip });
    }
  }

  private async isIPMarkedAsDDoS(ip: string): Promise<boolean> {
    if (!redisService.isRedisAvailable()) return false;

    try {
      const redis = redisService.getRedisClient();
      if (!redis) return false;

      const banKey = `ddos:banned:${ip}`;
      const isBanned = await redis.exists(banKey);
      return isBanned === 1;
    } catch (error) {
      logger.error("Error checking if IP is marked as DDoS attacker", {
        error,
        ip,
      });
      return false;
    }
  }
}

const ddosProtectionService = new DDoSProtectionService();
export default ddosProtectionService;
