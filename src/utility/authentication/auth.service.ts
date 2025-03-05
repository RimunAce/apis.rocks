import { Elysia, t } from "elysia";
import supabase from "../database/database.service";
import logger from "../logger/logger.service";
import redisService from "../redis/redis.service";

// User Tiers and Their Rate Limits (RPM)
export const userTiers = {
  Free: 60,
  "Tier 1": 120,
  "Tier 2": 300,
  "Tier 3": 600,
  "Tier 4": 1200,
  "Tier 5": 3000,
  Custom: null,
};

export type UserTier = keyof typeof userTiers;
export type UserStatus = "active" | "revoked" | "expired";
export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface User {
  id: string;
  user_access_key: string;
  key_total: number;
  credits: number;
  status: UserStatus;
  tier: UserTier;
  rate_limit: number;
  usage_count: number;
  tokens_input: number;
  tokens_output: number;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  api_key: string;
  key_name: string;
  key_credits_usage: number;
  status: ApiKeyStatus;
  last_used: string | null;
  expires_at: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface UsageRecord {
  id: string;
  user_id: string;
  api_key_id: string;
  timestamp: string;
  request_type: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  credits_used: number;
}

export const generateApiKey = (): string => {
  const prefix = "sk-ar-";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = prefix;

  for (let i = 0; i < 48; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

export const generateUserAccessKey = (): string => {
  const prefix = "uk-";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = prefix;

  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

export const validateApiKey = async (
  apiKey: string
): Promise<{ isValid: boolean; user?: User; key?: ApiKey }> => {
  try {
    const cleanApiKey = apiKey.replace(/\.{3,}$/, "").trim();

    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("api_key", cleanApiKey);

    if (apiKeyError) {
      logger.error("Error querying API key", {
        error: apiKeyError,
        apiKey: cleanApiKey.substring(0, 10) + "...",
      });
      return { isValid: false };
    }

    if (!apiKeyData || apiKeyData.length === 0) {
      logger.error("Invalid API key", {
        apiKey: cleanApiKey.substring(0, 10) + "...",
      });
      return { isValid: false };
    }

    const keyData = apiKeyData[0];

    if (keyData.status !== "active") {
      logger.error("API key is not active", {
        keyId: keyData.id,
        status: keyData.status,
      });
      return { isValid: false };
    }

    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      await supabase
        .from("api_keys")
        .update({ status: "expired" })
        .eq("id", keyData.id);

      logger.error("API key is expired", { keyId: keyData.id });
      return { isValid: false };
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", keyData.owner_id);

    if (userError) {
      logger.error("Error querying user", {
        error: userError,
        keyId: keyData.id,
        ownerId: keyData.owner_id,
      });
      return { isValid: false };
    }

    if (!userData || userData.length === 0) {
      logger.error("User not found for API key", {
        keyId: keyData.id,
        ownerId: keyData.owner_id,
      });
      return { isValid: false };
    }

    const user = userData[0];

    if (user.status !== "active") {
      logger.error("User is not active", {
        userId: user.id,
        status: user.status,
      });
      return { isValid: false };
    }

    if (user.credits <= 0) {
      logger.error("User has no credits", { userId: user.id });
      return { isValid: false };
    }

    await supabase
      .from("api_keys")
      .update({ last_used: new Date().toISOString() })
      .eq("id", keyData.id);

    return { isValid: true, user: user as User, key: keyData as ApiKey };
  } catch (error) {
    logger.error("Error validating API key", { error });
    return { isValid: false };
  }
};

export const auth = new Elysia({ name: "auth" }).derive(
  { as: "global" },
  async ({ request, set }) => {
    const url = new URL(request.url);
    if (url.pathname === "/docs" || url.pathname.startsWith("/docs/")) {
      logger.info("Skipping authentication for docs route", {
        path: url.pathname,
      });
      return {};
    }

    if (url.pathname.startsWith("/admin")) {
      logger.info("Skipping authentication for admin route", {
        path: url.pathname,
      });
      return {};
    }

    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.error("Missing or invalid Authorization header", {
        path: url.pathname,
      });
      set.status = 401;
      return { error: "API key is required" };
    }

    const apiKey = authHeader.slice(7).trim();
    logger.info("Validating API key", {
      path: url.pathname,
      keyLength: apiKey.length,
    });

    const { isValid, user, key } = await validateApiKey(apiKey);

    if (!isValid) {
      logger.error("Invalid API key", {
        path: url.pathname,
        keyLength: apiKey.length,
      });
      set.status = 401;
      return { error: "Invalid API key" };
    }

    logger.info("API key validated successfully", {
      path: url.pathname,
      userId: user?.id,
      keyId: key?.id,
    });

    if (user && user.rate_limit > 0) {
      const { allowed, remaining, resetAt } = await redisService.checkRateLimit(
        user.id,
        key!.id,
        user.rate_limit
      );

      if (!allowed) {
        logger.warn("Rate limit exceeded or rate limiting service error", {
          userId: user.id,
          keyId: key!.id,
          rateLimit: user.rate_limit,
          path: url.pathname,
          remaining,
        });

        set.headers = {
          "X-RateLimit-Limit": user.rate_limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": Math.floor(resetAt.getTime() / 1000).toString(),
          "Retry-After": Math.ceil(
            (resetAt.getTime() - Date.now()) / 1000
          ).toString(),
        };

        set.status = 429;

        let errorMessage = "Rate limit exceeded. Please try again later.";

        if (
          remaining === 0 &&
          (!redisService.isRedisAvailable() || allowed === false)
        ) {
          errorMessage =
            "Rate Limited. So many requests to server is bad for my health :3";
        }

        return {
          error: errorMessage,
          rate_limited: true,
        };
      }

      set.headers = {
        "X-RateLimit-Limit": user.rate_limit.toString(),
        "X-RateLimit-Remaining": remaining.toString(),
        "X-RateLimit-Reset": Math.floor(resetAt.getTime() / 1000).toString(),
      };
    }

    return { user, apiKey: key };
  }
);

export const trackUsage = async (
  userId: string,
  apiKeyId: string,
  requestType: string,
  model: string,
  tokensInput: number,
  tokensOutput: number,
  coefficient: number
): Promise<boolean> => {
  try {
    const creditsUsed = Math.ceil((tokensInput + tokensOutput) * coefficient);

    const { error: usageError } = await supabase.from("usage_records").insert({
      user_id: userId,
      api_key_id: apiKeyId,
      timestamp: new Date().toISOString(),
      request_type: requestType,
      model,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      credits_used: creditsUsed,
    });

    if (usageError) {
      logger.error("Error creating usage record", {
        error: usageError,
        userId,
        apiKeyId,
        requestType,
      });
      return false;
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*")
      .eq("id", userId)
      .single();

    if (userError || !userData) {
      logger.error("User not found", { userId, error: userError });
      return false;
    }

    const newCredits = Math.max(0, userData.credits - creditsUsed);
    const { error: updateError } = await supabase
      .from("users")
      .update({
        credits: newCredits,
        usage_count: userData.usage_count + 1,
        tokens_input: userData.tokens_input + tokensInput,
        tokens_output: userData.tokens_output + tokensOutput,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateError) {
      logger.error("Error updating user credits", {
        error: updateError,
        userId,
        creditsUsed,
        newCredits,
      });
      return false;
    }

    try {
      const { data: keyData, error: keyFetchError } = await supabase
        .from("api_keys")
        .select("key_credits_usage")
        .eq("id", apiKeyId)
        .single();

      if (keyFetchError) {
        logger.error("Error fetching API key usage", {
          error: keyFetchError,
          apiKeyId,
        });
        return false;
      }

      if (!keyData) {
        logger.error("API key not found", { apiKeyId });
        return false;
      }

      const { error: keyUpdateError } = await supabase
        .from("api_keys")
        .update({
          key_credits_usage: (keyData.key_credits_usage || 0) + creditsUsed,
          last_used: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", apiKeyId);

      if (keyUpdateError) {
        logger.error("Error updating API key usage", {
          error: keyUpdateError,
          apiKeyId,
          creditsUsed,
        });
        return false;
      }
    } catch (keyError) {
      logger.error("Unexpected error updating API key", {
        error: keyError,
        apiKeyId,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error tracking usage", {
      error,
      userId,
      apiKeyId,
      requestType,
      model,
    });
    return false;
  }
};

export default auth;
