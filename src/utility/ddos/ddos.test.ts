import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import ddosProtectionService from "./ddos.test-service";
import {
  mockRedisService as redisService,
  mockLogger as logger,
  mockRedisClient,
} from "./test-env";

mock.module("../redis/redis.service", () => ({
  default: {
    isRedisAvailable: () => true,
    getRedisClient: () => ({
      incr: async () => 1,
      expire: async () => 1,
      exists: async () => 0,
      set: async () => "OK",
    }),
  },
}));

mock.module("../logger/logger.service", () => ({
  default: {
    info: () => {},
    warn: () => {},
    error: () => {},
  },
}));

mock.module("../env/env.service", () => ({
  envService: {
    get: (key: string) => {
      const mockEnv: Record<string, string | boolean | number> = {
        NODE_ENV: "test",
        DDOS_PROTECTION_ENABLED: "true",
        DDOS_THRESHOLD_REQUESTS: "100",
        DDOS_TIME_WINDOW_SECONDS: "10",
        DDOS_BAN_DURATION_SECONDS: "300",
      };
      return mockEnv[key];
    },
  },
}));

describe("DDoS Protection Service", () => {
  let mockRequest: Request;

  beforeEach(() => {
    mockRequest = new Request("https://example.com/api/test", {
      headers: {
        "cf-connecting-ip": "192.168.1.1",
      },
    });

    spyOn(logger, "info");
    spyOn(logger, "warn");
    spyOn(logger, "error");
  });

  it("should skip DDoS check for excluded routes", async () => {
    const result = ddosProtectionService.isExcludedRoute("/health");
    expect(result).toBe(true);
  });

  it("should allow normal traffic", async () => {
    spyOn(mockRedisClient, "incr").mockResolvedValue(5);

    const requestCount = await ddosProtectionService.trackIPRequest(
      "192.168.1.1"
    );
    expect(requestCount).toBe(5);
  });

  it("should detect DDoS attacks", async () => {
    spyOn(mockRedisClient, "incr").mockResolvedValue(101);

    const requestCount = await ddosProtectionService.trackIPRequest(
      "192.168.1.1"
    );
    expect(requestCount).toBe(101);
  });

  it("should identify already marked DDoS attackers", async () => {
    spyOn(mockRedisClient, "exists").mockResolvedValue(1);

    const isBanned = await ddosProtectionService.isIPMarkedAsDDoS(
      "192.168.1.1"
    );
    expect(isBanned).toBe(true);
  });

  it("should extract client IP from request headers", async () => {
    const ip = ddosProtectionService.getClientIP(mockRequest);
    expect(ip).toBe("192.168.1.1");
  });

  it("should handle missing client IP", async () => {
    mockRequest = new Request("https://example.com/api/test");

    const ip = ddosProtectionService.getClientIP(mockRequest);
    expect(ip).toBe(mockRequest.headers.get("host"));
  });

  it("should handle Redis unavailability", async () => {
    spyOn(redisService, "isRedisAvailable").mockReturnValue(false);

    const requestCount = await ddosProtectionService.trackIPRequest(
      "192.168.1.1"
    );
    expect(requestCount).toBe(0);
  });
});
