import ddosProtectionService from "./ddos.test-service";
import {
  mockRedisService as redisService,
  mockLogger as logger,
  mockEnvService as envService,
  mockRedisClient,
} from "./test-env";

/**
 * Manual test script for DDoS protection service
 *
 * This script simulates a DDoS attack by making multiple requests from the same IP
 * and verifies that the service correctly identifies and bans the attacker.
 *
 * Run with: bun run src/utility/ddos/ddos.manual-test.ts
 */
console.log("Starting DDoS protection manual test...");

// Get configuration values from environment service
const DDOS_PROTECTION_ENABLED = envService.get("DDOS_PROTECTION_ENABLED");
const DDOS_THRESHOLD_REQUESTS = Number(
  envService.get("DDOS_THRESHOLD_REQUESTS")
);
const DDOS_TIME_WINDOW_SECONDS = envService.get("DDOS_TIME_WINDOW_SECONDS");
const DDOS_BAN_DURATION_SECONDS = envService.get("DDOS_BAN_DURATION_SECONDS");

// Log configuration
console.log(`DDoS Protection Enabled: ${DDOS_PROTECTION_ENABLED}`);
console.log(`Request Threshold: ${DDOS_THRESHOLD_REQUESTS}`);
console.log(`Time Window: ${DDOS_TIME_WINDOW_SECONDS} seconds`);
console.log(`Ban Duration: ${DDOS_BAN_DURATION_SECONDS} seconds`);
console.log(`Redis Available: ${redisService.isRedisAvailable()}`);

// Check if Redis is available
if (!redisService.isRedisAvailable()) {
  console.error(
    "Redis is not available. DDoS protection will not work properly."
  );
  process.exit(1);
}

// Create a mock request
const mockRequest = new Request("https://example.com/api/test", {
  headers: {
    "cf-connecting-ip": "192.168.1.1",
  },
});

// Test IP
const testIP = "192.168.1.1";

// Simulate multiple requests from the same IP
const simulateRequests = async () => {
  const requestsToSimulate = DDOS_THRESHOLD_REQUESTS + 10;
  console.log(`Simulating ${requestsToSimulate} requests from IP ${testIP}...`);

  // Override the Redis incr method to simulate increasing request counts
  let requestCount = 0;
  const originalIncr = mockRedisClient.incr;
  mockRedisClient.incr = async (key: string) => {
    if (key.startsWith(`ddos:${testIP}`)) {
      return ++requestCount;
    }
    return originalIncr(key);
  };

  // Override the exists method to return 1 after marking as DDoS
  let ipBanned = false;
  const originalExists = mockRedisClient.exists;
  mockRedisClient.exists = async (key: string) => {
    if (key === `ddos:banned:${testIP}` && ipBanned) {
      return 1;
    }
    return originalExists(key);
  };

  // Override the set method to mark as banned
  const originalSet = mockRedisClient.set;
  mockRedisClient.set = async (key: string, value: string, options?: any) => {
    if (key === `ddos:banned:${testIP}`) {
      ipBanned = true;
    }
    return originalSet(key, value, options);
  };

  // Make requests exceeding the threshold
  for (let i = 1; i <= requestsToSimulate; i++) {
    const count = await ddosProtectionService.trackIPRequest(testIP);
    console.log(`Request ${i} from ${testIP}: Count = ${count}`);

    // Check if IP is marked as DDoS
    const isDDoS = await ddosProtectionService.isIPMarkedAsDDoS(testIP);
    if (isDDoS) {
      console.log(
        `IP ${testIP} is now marked as DDoS attacker after ${i} requests`
      );
      break;
    }

    // Mark as DDoS if threshold exceeded
    if (count > DDOS_THRESHOLD_REQUESTS && !ipBanned) {
      await ddosProtectionService.markIPAsDDoS(testIP);
    }
  }

  // Verify IP ban status
  const finalBanStatus = await ddosProtectionService.isIPMarkedAsDDoS(testIP);
  if (finalBanStatus) {
    console.log(`✅ Test passed: IP ${testIP} is correctly banned`);
  } else {
    console.error(`❌ Test failed: IP ${testIP} should be banned but is not`);
  }

  // Restore original methods
  mockRedisClient.incr = originalIncr;
  mockRedisClient.exists = originalExists;
  mockRedisClient.set = originalSet;
};

// Run the test
simulateRequests().catch((error) => {
  console.error("Error during DDoS protection test:", error);
});
