/**
 * Test environment setup
 *
 * This file provides mock implementations of services for testing.
 */

// Mock environment values
export const mockEnv = {
  NODE_ENV: "test",
  DDOS_PROTECTION_ENABLED: "true",
  DDOS_THRESHOLD_REQUESTS: "100",
  DDOS_TIME_WINDOW_SECONDS: "10",
  DDOS_BAN_DURATION_SECONDS: "300",
  DDOS_EXCLUDED_ROUTES: [""],
};

// Mock environment service
export const mockEnvService = {
  get: (key: string) => {
    return mockEnv[key as keyof typeof mockEnv];
  },
};

// Mock Redis client
export const mockRedisClient = {
  incr: async (key: string) => 1,
  expire: async (key: string, seconds: number) => 1,
  exists: async (key: string) => 0,
  set: async (key: string, value: string, options?: any) => "OK",
};

// Mock Redis service
export const mockRedisService = {
  isRedisAvailable: () => true,
  getRedisClient: () => mockRedisClient,
};

// Mock logger
export const mockLogger = {
  info: (...args: any[]) => {},
  warn: (...args: any[]) => {},
  error: (...args: any[]) => {},
};
