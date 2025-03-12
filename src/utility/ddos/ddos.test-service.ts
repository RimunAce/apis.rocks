/**
 * Test version of the DDoS protection service
 *
 * This file is a modified version of ddos.service.ts that uses mock dependencies for testing.
 */

import { Elysia } from "elysia";
import {
  mockLogger as logger,
  mockEnvService as envService,
  mockRedisService as redisService,
} from "./test-env";

const DDOS_ERROR_MESSAGE = {
  error: "Too Many Requests",
  message: "Your IP has been temporarily blocked due to suspicious activity",
  status: 429,
};

// DDoS detection thresholds
const DDOS_THRESHOLD_REQUESTS = Number(
  envService.get("DDOS_THRESHOLD_REQUESTS")
);
const DDOS_TIME_WINDOW_SECONDS = Number(
  envService.get("DDOS_TIME_WINDOW_SECONDS")
);
const DDOS_BAN_DURATION_SECONDS = Number(
  envService.get("DDOS_BAN_DURATION_SECONDS")
);
const DDOS_PROTECTION_ENABLED = Boolean(
  envService.get("DDOS_PROTECTION_ENABLED")
);

// Routes to exclude from DDoS protection
const EXCLUDED_ROUTES = envService.get("DDOS_PROTECTED_ROUTES");

class DDoSProtectionService {
  constructor() {
    logger.info("DDoS protection service initialized", {
      enabled: DDOS_PROTECTION_ENABLED,
      threshold: DDOS_THRESHOLD_REQUESTS,
      timeWindow: DDOS_TIME_WINDOW_SECONDS,
      banDuration: DDOS_BAN_DURATION_SECONDS,
    });
  }

  /**
   * Middleware to detect and handle potential DDoS attacks
   */
  middleware = (app: Elysia) => {
    return app.derive(async ({ request, set }) => {
      // Skip if DDoS protection is disabled
      if (!DDOS_PROTECTION_ENABLED) {
        return { isDDoS: false };
      }

      const url = new URL(request.url);

      // Skip DDoS check for excluded routes
      if (this.isExcludedRoute(url.pathname)) {
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

      // Check if IP is already marked as DDoS attacker
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

      // Track request count for this IP
      const requestCount = await this.trackIPRequest(clientIP);

      // Check if request count exceeds threshold
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

  /**
   * Check if the route should be excluded from DDoS protection
   * Generally speaking, I set to none
   */
  isExcludedRoute(pathname: string): boolean {
    if (Array.isArray(EXCLUDED_ROUTES)) {
      return EXCLUDED_ROUTES.some((route: string) =>
        pathname.startsWith(route)
      );
    } else if (typeof EXCLUDED_ROUTES === "string") {
      return pathname.startsWith(EXCLUDED_ROUTES);
    }
    return false;
  }

  /**
   * Get client IP from request headers
   */
  getClientIP(request: Request): string | null {
    // Try to get IP from Cloudflare headers first
    const cfConnectingIP = request.headers.get("cf-connecting-ip");
    if (cfConnectingIP) return cfConnectingIP;

    // Try X-Forwarded-For header
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) {
      // Get the first IP in the list
      const ips = forwardedFor.split(",");
      return ips[0].trim();
    }

    // Fallback to host header
    const host = request.headers.get("host");
    return host;
  }

  /**
   * Track request count for an IP within the time window
   */
  async trackIPRequest(ip: string): Promise<number> {
    if (!redisService.isRedisAvailable()) return 0;

    try {
      const redis = redisService.getRedisClient();
      if (!redis) return 0;

      const now = Math.floor(Date.now() / 1000);
      const windowKey = Math.floor(now / DDOS_TIME_WINDOW_SECONDS);
      const ipKey = `ddos:${ip}:${windowKey}`;

      const count = await redis.incr(ipKey);

      // Set expiration if this is the first request in this window
      if (count === 1) {
        await redis.expire(ipKey, DDOS_TIME_WINDOW_SECONDS * 2); // Double the window for safety
      }

      return count;
    } catch (error) {
      logger.error("Error tracking IP request count", { error, ip });
      return 0;
    }
  }

  /**
   * Mark an IP as a DDoS attacker
   */
  async markIPAsDDoS(ip: string): Promise<void> {
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

  /**
   * Check if an IP is marked as a DDoS attacker
   */
  async isIPMarkedAsDDoS(ip: string): Promise<boolean> {
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
