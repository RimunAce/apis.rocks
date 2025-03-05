import { Redis } from "@upstash/redis";
import { envService } from "../env/env.service";
import logger from "../logger/logger.service";

class RedisService {
  private redis: Redis | null = null;

  constructor() {
    const redisUrl = envService.get("UPSTASH_REDIS_URL");
    const redisToken = envService.get("UPSTASH_REDIS_TOKEN");

    if (redisUrl && redisToken) {
      try {
        this.redis = new Redis({
          url: redisUrl,
          token: redisToken,
        });
        logger.info("Redis connection initialized");
      } catch (error) {
        logger.error("Failed to initialize Redis connection", { error });
        this.redis = null;
      }
    } else {
      logger.warn(
        "Redis credentials not provided, rate limiting will be disabled"
      );
    }
  }

  isRedisAvailable(): boolean {
    return this.redis !== null;
  }

  async checkRateLimit(
    userId: string,
    apiKeyId: string,
    rateLimit: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    if (!this.redis) {
      logger.error("Rate limiting failed: Redis connection not available");
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      };
    }

    try {
      const now = Date.now();
      const windowKey = Math.floor(now / 60000);
      const userKey = `rate:${userId}:${apiKeyId}:${windowKey}`;

      const currentCount = await this.redis.incr(userKey);

      if (currentCount === 1) {
        await this.redis.expire(userKey, 60);
      }

      const resetAt = new Date((windowKey + 1) * 60000);
      const remaining = Math.max(0, rateLimit - currentCount);
      const allowed = currentCount <= rateLimit;

      if (!allowed) {
        logger.warn("Rate limit exceeded", {
          userId,
          apiKeyId,
          rateLimit,
          currentCount,
        });
      }

      return { allowed, remaining, resetAt };
    } catch (error) {
      logger.error("Error checking rate limit", { error, userId, apiKeyId });
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 60000),
      };
    }
  }
}

const redisService = new RedisService();
export default redisService;
