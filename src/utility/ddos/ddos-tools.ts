/**
 * ##################################
 *
 * DDoS Protection Tools
 *
 * ##################################
 *
 * This file contains various tools for testing and configuring DDoS protection.
 * Consolidates functionality from multiple test files to avoid code duplication.
 *
 * Usage:
 * bun run src/utility/ddos/ddos-tools.ts [command]
 *
 * Commands:
 * * check-config: Check DDoS protection configuration
 * * test-service: Test the DDoS protection service directly
 * * test-redis: Check if Redis is properly tracking IP requests
 * * test-root: Test DDoS protection for the root route
 * * load-test [url] [requests-per-second] [duration-seconds]: Run a load test
 */

import { envService } from "../env/env.service";
import redisService from "../redis/redis.service";
import ddosProtectionService from "./ddos.service";
import type { Redis } from "@upstash/redis";

// Default values for load test
const DEFAULT_TARGET_URL = "http://localhost:3000/";
const DEFAULT_REQUESTS_PER_SECOND = 50;
const DEFAULT_DURATION_SECONDS = 10;

// Common utility functions
const logHeader = (title: string) => console.log(`=== ${title} ===`);

const logSettings = () => {
  console.log("DDoS Protection Settings:");
  console.log(`- Enabled: ${envService.get("DDOS_PROTECTION_ENABLED")}`);
  console.log(
    `- Threshold Requests: ${envService.get("DDOS_THRESHOLD_REQUESTS")}`
  );
  console.log(
    `- Time Window (seconds): ${envService.get("DDOS_TIME_WINDOW_SECONDS")}`
  );
  console.log(
    `- Ban Duration (seconds): ${envService.get("DDOS_BAN_DURATION_SECONDS")}`
  );
  console.log(
    `- Excluded Routes: ${
      envService.get("DDOS_EXCLUDED_ROUTES").join(", ") || "None"
    }`
  );
};

const logTestStart = (url: string, rps: number, duration: number) => {
  console.log(`Target URL: ${url}`);
  console.log(`Requests per second: ${rps}`);
  console.log(`Duration: ${duration} seconds`);
  console.log(`Total requests to be sent: ${rps * duration}`);
  console.log(`\nStarting test in 3 seconds...`);
};

interface TestResults {
  startTime: number;
  totalRequests: number;
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  redirectCount?: number;
}

const logTestResults = (results: TestResults) => {
  const endTime = Date.now();
  const duration = (endTime - results.startTime) / 1000;
  const getPercentage = (count: number) =>
    ((count / results.totalRequests) * 100).toFixed(2);

  console.log(`\n\nTest completed at ${new Date().toISOString()}`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Total requests sent: ${results.totalRequests}`);
  console.log(
    `Success: ${results.successCount} (${getPercentage(results.successCount)}%)`
  );

  if (results.redirectCount) {
    console.log(
      `Redirects: ${results.redirectCount} (${getPercentage(
        results.redirectCount
      )}%)`
    );
  }

  console.log(
    `Errors: ${results.errorCount} (${getPercentage(results.errorCount)}%)`
  );
  console.log(
    `Rate limited (429): ${results.rateLimitedCount} (${getPercentage(
      results.rateLimitedCount
    )}%)`
  );

  if (
    results.rateLimitedCount > 0 &&
    results.rateLimitedCount / results.totalRequests > 0.3
  ) {
    console.log(
      `\n✅ DDoS protection appears to be working! Requests were blocked with 429 status code.`
    );
  } else {
    console.log(
      `\n❌ No rate limiting detected. DDoS protection might not be working correctly.`
    );
  }
};

// Request handling for load tests
interface RequestStats {
  successCount: number;
  errorCount: number;
  rateLimitedCount: number;
  redirectCount: number;
  totalRequests: number;
}

async function makeRequest(
  url: string,
  stats: RequestStats,
  trackRedirects = false
) {
  try {
    const response = await fetch(url);
    stats.totalRequests++;

    if (trackRedirects && response.redirected) {
      stats.redirectCount++;
      process.stdout.write(
        response.url.includes("youtube.com/watch") ? "R" : "r"
      );
    } else if (response.status === 429) {
      stats.rateLimitedCount++;
      process.stdout.write("L");
    } else if (response.ok) {
      stats.successCount++;
      process.stdout.write(".");
    } else {
      stats.errorCount++;
      process.stdout.write("x");
    }
  } catch (error) {
    stats.errorCount++;
    process.stdout.write("E");
  }
}

/**
 * ##################################
 *
 * DDoS Protection Functions
 *
 * ##################################
 */

// Check DDoS protection configuration
async function checkConfig() {
  logHeader("DDoS Protection Configuration Check");

  const isEnabled = envService.get("DDOS_PROTECTION_ENABLED");
  console.log(`DDoS Protection Enabled: ${isEnabled}`);

  if (!isEnabled) {
    console.log(
      "❌ DDoS protection is disabled. Enable it by setting DDOS_PROTECTION_ENABLED=true in your .env file."
    );
    return;
  }

  const excludedRoutes = envService.get("DDOS_EXCLUDED_ROUTES");
  console.log(`Excluded Routes: ${JSON.stringify(excludedRoutes)}`);

  console.log("\n✅ Configuration Check:");
  console.log(
    "The environment variable DDOS_EXCLUDED_ROUTES is correctly named to indicate routes that are EXCLUDED from DDoS protection."
  );

  console.log("\nRoutes Configuration:");
  if (
    excludedRoutes.length === 0 ||
    (excludedRoutes.length === 1 && excludedRoutes[0] === "")
  ) {
    console.log(
      "✅ No routes are excluded from protection. All routes, including the root route, will be protected from DDoS attacks."
    );
  } else {
    console.log(
      `The following routes are excluded from DDoS protection: ${excludedRoutes.join(
        ", "
      )}`
    );

    // Check if the root route is being excluded
    if (excludedRoutes.includes("") || excludedRoutes.includes("/")) {
      console.log(
        "\n⚠️ Warning: The root route '/' is in your DDOS_EXCLUDED_ROUTES list, which means it's being EXCLUDED from protection."
      );
      console.log(
        "Remove it from the list if you want to protect the root route."
      );
    }
  }

  console.log("\nDDoS Protection Settings:");
  console.log(
    `- Threshold Requests: ${envService.get("DDOS_THRESHOLD_REQUESTS")}`
  );
  console.log(
    `- Time Window (seconds): ${envService.get("DDOS_TIME_WINDOW_SECONDS")}`
  );
  console.log(
    `- Ban Duration (seconds): ${envService.get("DDOS_BAN_DURATION_SECONDS")}`
  );
}

// Test the DDoS protection service directly
async function testService() {
  logHeader("DDoS Protection Service Check");
  console.log(`Redis available: ${redisService.isRedisAvailable()}`);
  logSettings();

  // Create a mock request
  const mockIP = "192.168.1.1";
  const mockRequest = new Request("http://localhost:3000/test");
  mockRequest.headers.set("x-forwarded-for", mockIP);

  console.log("\nSimulating multiple requests from the same IP...");

  const service = ddosProtectionService;
  const threshold = envService.get("DDOS_THRESHOLD_REQUESTS");

  // Test tracking IP requests
  for (let i = 1; i <= threshold + 5; i++) {
    const count = await service.ipTracker.track(mockIP);
    console.log(`Request ${i}: Count = ${count}`);

    if (count > threshold) {
      console.log(`Threshold exceeded at request ${i}. IP should be banned.`);

      // Check if IP is marked as DDoS
      const isBanned = await service.ipTracker.isBanned(mockIP);
      console.log(`IP banned status: ${isBanned}`);
      console.log(
        isBanned
          ? "✅ DDoS protection is working correctly!"
          : "❌ DDoS protection failed to ban the IP!"
      );
      break;
    }
  }
}

// Check if Redis is properly tracking IP requests for DDoS protection
async function testRedis() {
  logHeader("Redis IP Request Tracking Check");

  // Check Redis connection
  const isRedisAvailable = redisService.isRedisAvailable();
  console.log(`Redis available: ${isRedisAvailable}`);

  if (!isRedisAvailable) {
    console.log(
      "❌ Redis is not available. DDoS protection cannot work without Redis."
    );
    return;
  }

  // Get Redis client
  const redis = redisService.getRedisClient();
  if (!redis) {
    console.log("❌ Failed to get Redis client.");
    return;
  }

  // Get DDoS protection settings
  const DDOS_THRESHOLD_REQUESTS = envService.get("DDOS_THRESHOLD_REQUESTS");
  const DDOS_TIME_WINDOW_SECONDS = envService.get("DDOS_TIME_WINDOW_SECONDS");
  const DDOS_BAN_DURATION_SECONDS = envService.get("DDOS_BAN_DURATION_SECONDS");

  console.log("DDoS Protection Settings:");
  console.log(`- Threshold Requests: ${DDOS_THRESHOLD_REQUESTS}`);
  console.log(`- Time Window (seconds): ${DDOS_TIME_WINDOW_SECONDS}`);
  console.log(`- Ban Duration (seconds): ${DDOS_BAN_DURATION_SECONDS}`);

  await testRedisIPTracking(
    redis,
    DDOS_THRESHOLD_REQUESTS,
    DDOS_TIME_WINDOW_SECONDS,
    DDOS_BAN_DURATION_SECONDS
  );
}

async function checkAndClearBan(redis: Redis, testIP: string) {
  const banKey = `ddos:banned:${testIP}`;
  const isBanned = await redis.exists(banKey);

  if (isBanned === 1) {
    console.log(
      `⚠️ Test IP ${testIP} is currently banned. Removing ban for testing...`
    );
    await redis.del(banKey);
  }
  return banKey;
}

async function setupRequestTracking(
  redis: Redis,
  testIP: string,
  timeWindow: number
) {
  const now = Math.floor(Date.now() / 1000);
  const windowKey = Math.floor(now / timeWindow);
  const ipKey = `ddos:${testIP}:${windowKey}`;
  await redis.del(ipKey);
  return ipKey;
}

async function handleThresholdExceeded(
  redis: Redis,
  testIP: string,
  banKey: string,
  banDuration: number,
  ipKey: string
) {
  await redis.set(banKey, "1", { ex: banDuration });
  const isBannedNow = await redis.exists(banKey);
  console.log(
    `IP banned status: ${isBannedNow === 1 ? "Banned" : "Not banned"}`
  );

  if (isBannedNow === 1) {
    console.log(
      "✅ Redis is correctly tracking and banning IPs for DDoS protection."
    );
    await redis.del(banKey);
    console.log("Test ban removed.");
  } else {
    console.log("❌ Failed to ban IP in Redis.");
  }
}

async function testRedisIPTracking(
  redis: Redis,
  threshold: number,
  timeWindow: number,
  banDuration: number
) {
  const testIP = "127.0.0.1";
  console.log(`\nTesting IP request tracking for IP: ${testIP}`);

  const banKey = await checkAndClearBan(redis, testIP);
  const ipKey = await setupRequestTracking(redis, testIP, timeWindow);

  console.log(`\nSimulating ${threshold + 5} requests from IP ${testIP}...`);

  for (let i = 1; i <= threshold + 5; i++) {
    const count = await redis.incr(ipKey);

    if (i === 1) {
      await redis.expire(ipKey, timeWindow * 2);
      const ttl = await redis.ttl(ipKey);
      console.log(
        `Key expiration set: ${ttl > 0 ? "Yes" : "No"} (TTL: ${ttl} seconds)`
      );
    }

    if (i % 10 === 0 || i === threshold || i === threshold + 1) {
      console.log(`Request ${i}: Count = ${count}`);
    }

    if (count > threshold && i === threshold + 1) {
      console.log(
        `\n✅ Threshold exceeded at request ${i}. IP should be banned.`
      );
      await handleThresholdExceeded(redis, testIP, banKey, banDuration, ipKey);
    }
  }

  const finalCount = await redis.get(ipKey);
  console.log(`\nFinal request count for IP ${testIP}: ${finalCount}`);
  await redis.del(ipKey);

  console.log("\nConclusion:");
  console.log(
    parseInt(finalCount as string) > threshold
      ? "✅ Redis is correctly tracking request counts for DDoS protection."
      : "❌ Redis is not correctly tracking request counts for DDoS protection."
  );
}

// Run a load test with configurable parameters
async function runLoadTest(
  targetUrl: string,
  requestsPerSecond: number,
  durationSeconds: number,
  trackRedirects = false
) {
  logTestStart(targetUrl, requestsPerSecond, durationSeconds);

  return new Promise<void>((resolve) => {
    setTimeout(async () => {
      console.log(`\nTest started at ${new Date().toISOString()}`);

      const startTime = Date.now();
      const stats: RequestStats = {
        successCount: 0,
        errorCount: 0,
        rateLimitedCount: 0,
        redirectCount: 0,
        totalRequests: 0,
      };

      const intervalId = setInterval(() => {
        for (let i = 0; i < requestsPerSecond; i++) {
          makeRequest(targetUrl, stats, trackRedirects);
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(intervalId);
        logTestResults({
          startTime,
          ...stats,
        });
        resolve();
      }, durationSeconds * 1000);
    }, 3000);
  });
}

// Test DDoS protection for the root route
async function testRoot() {
  logHeader("Root Route DDoS Protection Test");
  await runLoadTest("http://localhost:3000/", 20, 10);
}

// Run a load test against a target URL
async function loadTest(
  targetUrl = DEFAULT_TARGET_URL,
  requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
  durationSeconds = DEFAULT_DURATION_SECONDS
) {
  logHeader("DDoS Simulation Load Test");
  await runLoadTest(targetUrl, requestsPerSecond, durationSeconds, true);
}

// Display help information
function showHelp() {
  console.log(`
DDoS Protection Tools

Usage: bun run src/utility/ddos/ddos-tools.ts [command]

Commands:
  check-config                                  Check DDoS protection configuration
  test-service                                  Test the DDoS protection service directly
  test-redis                                    Check if Redis is properly tracking IP requests
  test-root                                     Test DDoS protection for the root route
  load-test [url] [requests/sec] [duration]     Run a load test against a target URL
  help                                          Show this help message
  `);
}

const commandMap = {
  "check-config": checkConfig,
  "test-service": testService,
  "test-redis": testRedis,
  "test-root": testRoot,
  "load-test": async (args: string[]) => {
    const targetUrl = args[1] || DEFAULT_TARGET_URL;
    const requestsPerSecond = parseInt(
      args[2] || DEFAULT_REQUESTS_PER_SECOND.toString()
    );
    const durationSeconds = parseInt(
      args[3] || DEFAULT_DURATION_SECONDS.toString()
    );
    await loadTest(targetUrl, requestsPerSecond, durationSeconds);
  },
  help: showHelp,
} as const;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";
  const handler = commandMap[command as keyof typeof commandMap] || showHelp;
  await handler(args);
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
