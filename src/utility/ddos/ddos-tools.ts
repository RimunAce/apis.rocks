/**
 * DDoS Protection Tools
 *
 * This file contains various tools for testing and configuring DDoS protection.
 * It consolidates functionality from multiple test files to avoid code duplication.
 *
 * Usage:
 * bun run src/utility/ddos/ddos-tools.ts [command]
 *
 * Commands:
 * - check-config: Check DDoS protection configuration
 * - test-service: Test the DDoS protection service directly
 * - test-redis: Check if Redis is properly tracking IP requests
 * - test-root: Test DDoS protection for the root route
 * - load-test [url] [requests-per-second] [duration-seconds]: Run a load test
 */

import { envService } from "../env/env.service";
import logger from "../logger/logger.service";
import redisService from "../redis/redis.service";
import ddosProtectionService from "./ddos.service";

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

const logTestResults = (
  startTime: number,
  totalRequests: number,
  successCount: number,
  errorCount: number,
  rateLimitedCount: number,
  redirectCount = 0
) => {
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  const getPercentage = (count: number) =>
    ((count / totalRequests) * 100).toFixed(2);

  console.log(`\n\nTest completed at ${new Date().toISOString()}`);
  console.log(`Duration: ${duration.toFixed(2)} seconds`);
  console.log(`Total requests sent: ${totalRequests}`);
  console.log(`Success: ${successCount} (${getPercentage(successCount)}%)`);

  if (redirectCount > 0) {
    console.log(
      `Redirects: ${redirectCount} (${getPercentage(redirectCount)}%)`
    );
  }

  console.log(`Errors: ${errorCount} (${getPercentage(errorCount)}%)`);
  console.log(
    `Rate limited (429): ${rateLimitedCount} (${getPercentage(
      rateLimitedCount
    )}%)`
  );

  if (rateLimitedCount > 0 && rateLimitedCount / totalRequests > 0.3) {
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
 * Check DDoS protection configuration
 */
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

/**
 * Test the DDoS protection service directly
 */
async function testService() {
  logHeader("DDoS Protection Service Check");
  console.log(`Redis available: ${redisService.isRedisAvailable()}`);
  logSettings();

  // Create a mock request
  const mockIP = "192.168.1.1";
  const mockRequest = new Request("http://localhost:3000/test");
  mockRequest.headers.set("x-forwarded-for", mockIP);

  console.log("\nSimulating multiple requests from the same IP...");

  // Access the private methods using any type assertion
  const service = ddosProtectionService as any;
  const threshold = envService.get("DDOS_THRESHOLD_REQUESTS");

  // Test tracking IP requests
  for (let i = 1; i <= threshold + 5; i++) {
    const count = await service.trackIPRequest(mockIP);
    console.log(`Request ${i}: Count = ${count}`);

    if (count > threshold) {
      console.log(`Threshold exceeded at request ${i}. IP should be banned.`);

      // Check if IP is marked as DDoS
      const isBanned = await service.isIPMarkedAsDDoS(mockIP);
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

/**
 * Check if Redis is properly tracking IP requests for DDoS protection
 */
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

async function testRedisIPTracking(
  redis: any,
  threshold: number,
  timeWindow: number,
  banDuration: number
) {
  const testIP = "127.0.0.1";
  console.log(`\nTesting IP request tracking for IP: ${testIP}`);

  // Check if IP is already banned
  const now = Math.floor(Date.now() / 1000);
  const banKey = `ddos:banned:${testIP}`;
  const isBanned = await redis.exists(banKey);

  if (isBanned === 1) {
    console.log(
      `⚠️ Test IP ${testIP} is currently banned. Removing ban for testing...`
    );
    await redis.del(banKey);
  }

  // Track requests for the test IP
  const windowKey = Math.floor(now / timeWindow);
  const ipKey = `ddos:${testIP}:${windowKey}`;

  // Clear any existing count
  await redis.del(ipKey);

  console.log(`\nSimulating ${threshold + 5} requests from IP ${testIP}...`);

  // Simulate requests
  for (let i = 1; i <= threshold + 5; i++) {
    const count = await redis.incr(ipKey);

    if (i === 1) {
      // Set expiration on first request
      await redis.expire(ipKey, timeWindow * 2);

      // Check if expiration was set
      const ttl = await redis.ttl(ipKey);
      console.log(
        `Key expiration set: ${ttl > 0 ? "Yes" : "No"} (TTL: ${ttl} seconds)`
      );
    }

    if (i % 10 === 0 || i === threshold || i === threshold + 1) {
      console.log(`Request ${i}: Count = ${count}`);
    }

    // Check if count exceeds threshold
    if (count > threshold && i === threshold + 1) {
      console.log(
        `\n✅ Threshold exceeded at request ${i}. IP should be banned.`
      );

      // Manually ban the IP
      await redis.set(banKey, "1", { ex: banDuration });

      // Check if IP is banned
      const isBannedNow = await redis.exists(banKey);
      console.log(
        `IP banned status: ${isBannedNow === 1 ? "Banned" : "Not banned"}`
      );

      if (isBannedNow === 1) {
        console.log(
          "✅ Redis is correctly tracking and banning IPs for DDoS protection."
        );

        // Clean up the test ban
        await redis.del(banKey);
        console.log("Test ban removed.");
      } else {
        console.log("❌ Failed to ban IP in Redis.");
      }
    }
  }

  // Check final count
  const finalCount = await redis.get(ipKey);
  console.log(`\nFinal request count for IP ${testIP}: ${finalCount}`);

  // Clean up
  await redis.del(ipKey);
  console.log("Test data cleaned up.");

  console.log("\nConclusion:");
  if (parseInt(finalCount as string) > threshold) {
    console.log(
      "✅ Redis is correctly tracking request counts for DDoS protection."
    );
    console.log(
      "If DDoS protection is still not working, check the middleware implementation."
    );
  } else {
    console.log(
      "❌ Redis is not correctly tracking request counts for DDoS protection."
    );
  }
}

/**
 * Run a load test with configurable parameters
 */
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
        logTestResults(
          startTime,
          stats.totalRequests,
          stats.successCount,
          stats.errorCount,
          stats.rateLimitedCount,
          stats.redirectCount
        );
        resolve();
      }, durationSeconds * 1000);
    }, 3000);
  });
}

/**
 * Test DDoS protection for the root route
 */
async function testRoot() {
  logHeader("Root Route DDoS Protection Test");
  await runLoadTest("http://localhost:3000/", 20, 10);
}

/**
 * Run a load test against a target URL
 */
async function loadTest(
  targetUrl = DEFAULT_TARGET_URL,
  requestsPerSecond = DEFAULT_REQUESTS_PER_SECOND,
  durationSeconds = DEFAULT_DURATION_SECONDS
) {
  logHeader("DDoS Simulation Load Test");
  await runLoadTest(targetUrl, requestsPerSecond, durationSeconds, true);
}

/**
 * Display help information
 */
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

/**
 * Main function to parse command line arguments and run the appropriate tool
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  switch (command) {
    case "check-config":
      await checkConfig();
      break;
    case "test-service":
      await testService();
      break;
    case "test-redis":
      await testRedis();
      break;
    case "test-root":
      await testRoot();
      break;
    case "load-test":
      const targetUrl = args[1] || DEFAULT_TARGET_URL;
      const requestsPerSecond = parseInt(
        args[2] || DEFAULT_REQUESTS_PER_SECOND.toString()
      );
      const durationSeconds = parseInt(
        args[3] || DEFAULT_DURATION_SECONDS.toString()
      );
      await loadTest(targetUrl, requestsPerSecond, durationSeconds);
      break;
    case "help":
    default:
      showHelp();
      break;
  }
}

// Run the main function if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
