import redisService from "./redis.service";

async function testRateLimit() {
  console.log("Testing Redis rate limiting...");

  const userId = "test-user-id";
  const apiKeyId = "test-api-key-id";
  const rateLimit = 5; // Requests Per Minute

  console.log(`Testing with rate limit of ${rateLimit} requests per minute`);
  console.log(`Redis available: ${redisService.isRedisAvailable()}`);
  console.log(`Redis type: ${redisService.getRedisType()}`);

  if (!redisService.isRedisAvailable()) {
    console.log(
      "WARNING: Redis is not available. All requests will be denied with an error message to contact the Administrator."
    );
    console.log(
      "Please check your .env file and ensure that either UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN (for Upstash Redis) " +
        "or REDIS_CONNECTION_STRING (for self-hosted Redis) are properly configured."
    );
  }

  for (let i = 1; i <= 7; i++) {
    const result = await redisService.checkRateLimit(
      userId,
      apiKeyId,
      rateLimit
    );

    console.log(`Request ${i}:`, {
      allowed: result.allowed,
      remaining: result.remaining,
      resetAt: result.resetAt.toISOString(),
      errorMessage: !result.allowed
        ? result.remaining === 0 && !redisService.isRedisAvailable()
          ? "Rate Limited. So many requests to server is bad for my health :3"
          : "Rate limit exceeded. Please try again later."
        : null,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

testRateLimit().catch(console.error);
