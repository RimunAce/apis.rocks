import { Redis as UpstashRedis } from "@upstash/redis";
import IORedis from "ioredis";
import { envService } from "../env/env.service";
import logger from "../logger/logger.service";

interface RedisClient {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<void>;
  set(key: string, value: string, expireSeconds?: number): Promise<void>;
  exists(key: string): Promise<boolean>;
}

// Adapter for Upstash Redis
class UpstashRedisAdapter implements RedisClient {
  constructor(private client: UpstashRedis) {}

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (expireSeconds) {
      await this.client.set(key, value, { ex: expireSeconds });
    } else {
      await this.client.set(key, value);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }
}

// Adapter for IORedis (self-hosted)
class IORedisAdapter implements RedisClient {
  constructor(private client: IORedis) {}

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  async set(key: string, value: string, expireSeconds?: number): Promise<void> {
    if (expireSeconds) {
      await this.client.set(key, value, "EX", expireSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }
}

class RedisService {
  private redisClient: RedisClient | null = null;
  private redisType: "upstash" | "self-hosted" | "none" = "none";
  private upstashClient: UpstashRedis | null = null;
  private ioRedisClient: IORedis | null = null;

  constructor() {
    const redisType = envService.get("REDIS_TYPE");

    if (redisType === "upstash") {
      this.initUpstashRedis();
    } else if (redisType === "self-hosted") {
      this.initSelfHostedRedis();
    } else {
      logger.warn(
        `Invalid REDIS_TYPE: ${redisType}. Valid options are 'upstash' or 'self-hosted'. Rate limiting will be disabled.`
      );
    }
  }

  private initUpstashRedis(): void {
    const redisUrl = envService.get("UPSTASH_REDIS_URL");
    const redisToken = envService.get("UPSTASH_REDIS_TOKEN");

    if (redisUrl && redisToken) {
      try {
        const upstashClient = new UpstashRedis({
          url: redisUrl,
          token: redisToken,
        });

        this.upstashClient = upstashClient;
        this.redisClient = new UpstashRedisAdapter(upstashClient);
        this.redisType = "upstash";
        logger.info("Upstash Redis connection initialized");
      } catch (error) {
        logger.error("Failed to initialize Upstash Redis connection", {
          error,
        });
      }
    } else {
      logger.warn(
        "Upstash Redis credentials not provided, rate limiting will be disabled"
      );
    }
  }

  private initSelfHostedRedis(): void {
    const redisUrl = envService.get("REDIS_CONNECTION_STRING");

    if (redisUrl && typeof redisUrl === "string") {
      try {
        // Configure Redis client with connection string
        const ioRedisClient = new IORedis(redisUrl, {
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          enableReadyCheck: true,
          connectTimeout: 10000,
        });

        ioRedisClient.on("error", (error) => {
          logger.error("Redis connection error", { error });
        });

        ioRedisClient.on("connect", () => {
          logger.info("Successfully connected to Redis");
        });

        ioRedisClient.on("reconnecting", () => {
          logger.warn("Reconnecting to Redis...");
        });

        this.ioRedisClient = ioRedisClient;
        this.redisClient = new IORedisAdapter(ioRedisClient);
        this.redisType = "self-hosted";
        logger.info("Self-hosted Redis connection initialized");
      } catch (error) {
        logger.error("Failed to initialize self-hosted Redis connection", {
          error,
        });
      }
    } else {
      logger.warn(
        "Self-hosted Redis connection string not provided, rate limiting will be disabled"
      );
    }
  }

  isRedisAvailable(): boolean {
    return this.redisClient !== null;
  }

  getRedisType(): string {
    return this.redisType;
  }

  // Backward Compatibility
  getRedisClient(): UpstashRedis | null {
    return this.upstashClient;
  }

  getRedisAdapter(): RedisClient | null {
    return this.redisClient;
  }

  async checkRateLimit(
    userId: string,
    apiKeyId: string,
    rateLimit: number
  ): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    if (!this.redisClient) {
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

      const currentCount = await this.redisClient.incr(userKey);

      if (currentCount === 1) {
        await this.redisClient.expire(userKey, 60);
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
