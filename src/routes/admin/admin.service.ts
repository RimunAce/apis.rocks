import { Elysia, t } from "elysia";
import supabase from "../../utility/database/database.service";
import {
  generateApiKey,
  generateUserAccessKey,
  User,
  ApiKey,
  UsageRecord,
  UserTier,
  UserStatus,
  ApiKeyStatus,
} from "../../utility/authentication/auth.service";
import logger from "../../utility/logger/logger.service";
import { getPagination } from "./helpers";
import { adminAuth } from "./auth";

const admin = new Elysia({ prefix: "/admin" })
  .use(adminAuth)
  .onBeforeHandle(({ admin, set, request }) => {
    const url = new URL(request.url);
    if (!admin) {
      logger.error("Admin authentication failed in beforeHandle hook", {
        path: url.pathname,
        method: request.method,
      });
      set.status = 401;
      return { error: "Unauthorized" };
    }

    logger.info("Admin authentication passed in beforeHandle hook", {
      path: url.pathname,
      method: request.method,
    });
  })

  /////////////////////////////////////////////
  //
  // * Admin Endpoints Goes Down Here
  //
  /////////////////////////////////////////////

  // GET /admin/users - List all users
  .get(
    "/users",
    async ({ query, set, admin }) => {
      const page = Number(query?.page) || 1;
      const limit = Number(query?.limit) || 10;
      const search = query?.search as string;

      const { from, to } = getPagination(page, limit);

      let query_builder = supabase
        .from("users")
        .select("*", { count: "exact" });

      if (search) {
        query_builder = query_builder.or(
          `id.ilike.%${search}%,user_access_key.ilike.%${search}%`
        );
      }

      const { data, error, count } = await query_builder
        .range(from, to)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Error fetching users", { error });
        set.status = 500;
        return { error: "Failed to fetch users" };
      }

      return {
        users: data as User[],
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil((count || 0) / limit),
        },
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "List all users",
        description:
          "Returns a paginated list of all users in the system. Can be filtered by search term.",
        responses: {
          200: {
            description: "List of users with pagination information",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                    pagination: {
                      type: "object",
                      properties: {
                        page: { type: "number" },
                        limit: { type: "number" },
                        total: { type: "number" },
                        pages: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // GET /admin/users/{user_id} - Get user details
  .get(
    "/users/:userId",
    async ({ params, set, admin }) => {
      const { userId } = params;

      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        logger.error("Error fetching user", { error, userId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "User not found"
              : "Failed to fetch user",
        };
      }

      return { user: data as User };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Get user details",
        description: "Returns detailed information about a specific user",
        responses: {
          200: {
            description: "User details",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          404: {
            description: "User not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // GET /admin/users/{user_id}/keys - List all API keys for a user
  .get(
    "/users/:userId/keys",
    async ({ params, set, admin }) => {
      const { userId } = params;

      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        logger.error("Error fetching API keys", { error, userId });
        set.status = 500;
        return { error: "Failed to fetch API keys" };
      }

      return { keys: data as ApiKey[] };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "List user API keys",
        description: "Returns all API keys belonging to a specific user",
        responses: {
          200: {
            description: "List of API keys",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    keys: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ApiKey" },
                    },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // GET /admin/keys/{key_id} - Get API key details
  .get(
    "/keys/:keyId",
    async ({ params, set, admin }) => {
      const { keyId } = params;

      const { data, error } = await supabase
        .from("api_keys")
        .select("*")
        .eq("id", keyId)
        .single();

      if (error) {
        logger.error("Error fetching API key", { error, keyId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "API key not found"
              : "Failed to fetch API key",
        };
      }

      // Get usage stats
      const { data: usageData, error: usageError } = await supabase
        .from("usage_records")
        .select("*")
        .eq("api_key_id", keyId)
        .order("timestamp", { ascending: false });

      if (usageError) {
        logger.error("Error fetching API key usage", {
          error: usageError,
          keyId,
        });
      }

      return {
        key: data as ApiKey,
        usage: (usageData || []) as UsageRecord[],
      };
    },
    {
      params: t.Object({
        keyId: t.String(),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Get API key details",
        description:
          "Returns detailed information about a specific API key and its usage records",
        responses: {
          200: {
            description: "API key details with usage records",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    key: { $ref: "#/components/schemas/ApiKey" },
                    usage: {
                      type: "array",
                      items: { $ref: "#/components/schemas/UsageRecord" },
                    },
                  },
                },
              },
            },
          },
          404: {
            description: "API key not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // POST /admin/users/{user_id}/keys - Create a new API key
  .post(
    "/users/:userId/keys",
    async ({ params, body, set, admin }) => {
      const { userId } = params;
      const { name, expiresAt } = body;

      // Check if user exists
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError) {
        logger.error("Error fetching user", { error: userError, userId });
        set.status = userError.code === "PGRST116" ? 404 : 500;
        return {
          error:
            userError.code === "PGRST116"
              ? "User not found"
              : "Failed to fetch user",
        };
      }

      // Generate API key
      const apiKey = generateApiKey();

      // Create API key
      const { data, error } = await supabase
        .from("api_keys")
        .insert({
          api_key: apiKey,
          key_name: name || "<unnamed>",
          key_credits_usage: 0,
          status: "active" as ApiKeyStatus,
          last_used: null,
          expires_at: expiresAt || null,
          owner_id: userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error("Error creating API key", { error, userId });
        set.status = 500;
        return { error: "Failed to create API key" };
      }

      // Update user key_total
      await supabase
        .from("users")
        .update({
          key_total: (userData.key_total || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      return { key: data as ApiKey };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        expiresAt: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Create new API key",
        description: "Creates a new API key for a specific user",
        responses: {
          200: {
            description: "API key created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    key: { $ref: "#/components/schemas/ApiKey" },
                  },
                },
              },
            },
          },
          404: {
            description: "User not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // PUT /admin/keys/{key_id} - Update an API key
  .put(
    "/keys/:keyId",
    async ({ params, body, set, admin }) => {
      const { keyId } = params;
      const { name, status, expiresAt } = body;

      const updates: Partial<ApiKey> = {
        updated_at: new Date().toISOString(),
      };

      if (name !== undefined) updates.key_name = name;
      if (status !== undefined) updates.status = status;
      if (expiresAt !== undefined) updates.expires_at = expiresAt;

      const { data, error } = await supabase
        .from("api_keys")
        .update(updates)
        .eq("id", keyId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating API key", { error, keyId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "API key not found"
              : "Failed to update API key",
        };
      }

      return { key: data as ApiKey, message: "API key updated successfully" };
    },
    {
      params: t.Object({
        keyId: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        status: t.Optional(
          t.Enum({ active: "active", revoked: "revoked", expired: "expired" })
        ),
        expiresAt: t.Optional(t.Union([t.String(), t.Null()])),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Update API key",
        description: "Updates an existing API key's properties",
        responses: {
          200: {
            description: "API key updated successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    key: { $ref: "#/components/schemas/ApiKey" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          404: {
            description: "API key not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // POST /admin/users/{user_id}/credits/set - Set credits
  .post(
    "/users/:userId/credits/set",
    async ({ params, body, set, admin }) => {
      const { userId } = params;
      const { credits } = body;

      // Enforce limits
      const safeCredits = Math.min(Math.max(0, credits), 100000000);

      const { data, error } = await supabase
        .from("users")
        .update({
          credits: safeCredits,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error setting credits", { error, userId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "User not found"
              : "Failed to set credits",
        };
      }

      return {
        user: data as User,
        message: `Credits set to ${safeCredits} successfully`,
      };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      body: t.Object({
        credits: t.Number(),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Set user credits",
        description: "Sets a specific amount of credits for a user",
        responses: {
          200: {
            description: "Credits set successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          404: {
            description: "User not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // POST /admin/users/{user_id}/credits/deduct - Deduct credits
  .post(
    "/users/:userId/credits/deduct",
    async ({ params, body, set, admin }) => {
      const { userId } = params;
      const { credits, reason } = body;

      // Get current user
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError) {
        logger.error("Error fetching user", { error: userError, userId });
        set.status = userError.code === "PGRST116" ? 404 : 500;
        return {
          error:
            userError.code === "PGRST116"
              ? "User not found"
              : "Failed to fetch user",
        };
      }

      // Calculate new credits (never below 0)
      const newCredits = Math.max(0, userData.credits - credits);

      const { data, error } = await supabase
        .from("users")
        .update({
          credits: newCredits,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error deducting user credits", { error, userId });
        set.status = 500;
        return { error: "Failed to deduct user credits" };
      }

      // Log credit change
      await supabase.from("credit_changes").insert({
        user_id: userId,
        amount: -credits,
        reason: reason || "Admin deduction",
        timestamp: new Date().toISOString(),
      });

      return {
        user: data as User,
        message: `Deducted ${credits} credits, new balance: ${newCredits}`,
      };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      body: t.Object({
        credits: t.Number(),
        reason: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Deduct user credits",
        description:
          "Deducts a specific amount of credits from a user's balance",
        responses: {
          200: {
            description: "Credits deducted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          404: {
            description: "User not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // POST /admin/users/{user_id}/credits/add - Add credits
  .post(
    "/users/:userId/credits/add",
    async ({ params, body, set, admin }) => {
      const { userId } = params;
      const { credits, reason } = body;

      // Get current user
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError) {
        logger.error("Error fetching user", { error: userError, userId });
        set.status = userError.code === "PGRST116" ? 404 : 500;
        return {
          error:
            userError.code === "PGRST116"
              ? "User not found"
              : "Failed to fetch user",
        };
      }

      // Calculate new credits (max 100M)
      const newCredits = Math.min(userData.credits + credits, 100000000);

      const { data, error } = await supabase
        .from("users")
        .update({
          credits: newCredits,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error adding user credits", { error, userId });
        set.status = 500;
        return { error: "Failed to add user credits" };
      }

      // Log credit change
      await supabase.from("credit_changes").insert({
        user_id: userId,
        amount: credits,
        reason: reason || "Admin addition",
        timestamp: new Date().toISOString(),
      });

      return {
        user: data as User,
        message: `Added ${credits} credits, new balance: ${newCredits}`,
      };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      body: t.Object({
        credits: t.Number(),
        reason: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Add user credits",
        description: "Adds a specific amount of credits to a user's balance",
        responses: {
          200: {
            description: "Credits added successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: { $ref: "#/components/schemas/User" },
                    message: { type: "string" },
                  },
                },
              },
            },
          },
          404: {
            description: "User not found",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
          500: {
            description: "Server error",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    }
  )

  // PUT /admin/users/{user_id} - Update user
  .put(
    "/users/:userId",
    async ({ params, body, set, admin }) => {
      const { userId } = params;
      const { tier, status, rate_limit } = body;

      const updates: Partial<User> = {
        updated_at: new Date().toISOString(),
      };

      if (tier !== undefined) updates.tier = tier;
      if (status !== undefined) updates.status = status;
      if (rate_limit !== undefined)
        updates.rate_limit = Math.min(Math.max(0, rate_limit), 6000);

      const { data, error } = await supabase
        .from("users")
        .update(updates)
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error updating user", { error, userId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "User not found"
              : "Failed to update user",
        };
      }

      return { user: data as User, message: "User updated successfully" };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      body: t.Object({
        tier: t.Optional(
          t.Enum({
            Free: "Free",
            "Tier 1": "Tier 1",
            "Tier 2": "Tier 2",
            "Tier 3": "Tier 3",
            "Tier 4": "Tier 4",
            "Tier 5": "Tier 5",
            Custom: "Custom",
          })
        ),
        status: t.Optional(
          t.Enum({ active: "active", revoked: "revoked", expired: "expired" })
        ),
        rate_limit: t.Optional(t.Number()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Update User",
        description: "Update a user's details",
      },
    }
  )

  // POST /admin/users - Create a new user
  .post(
    "/users",
    async ({ body, set, admin }) => {
      const { tier, rate_limit, credits } = body;

      // Generate user access key
      const userAccessKey = generateUserAccessKey();

      // Create user
      const { data, error } = await supabase
        .from("users")
        .insert({
          user_access_key: userAccessKey,
          key_total: 0,
          credits: Math.min(Math.max(0, credits || 0), 100000000),
          status: "active" as UserStatus,
          tier: tier || "Free",
          rate_limit: Math.min(Math.max(0, rate_limit || 60), 6000),
          usage_count: 0,
          tokens_input: 0,
          tokens_output: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error("Error creating user", { error });
        set.status = 500;
        return { error: "Failed to create user" };
      }

      return { user: data as User, message: "User created successfully" };
    },
    {
      body: t.Object({
        tier: t.Optional(
          t.Enum({
            Free: "Free",
            "Tier 1": "Tier 1",
            "Tier 2": "Tier 2",
            "Tier 3": "Tier 3",
            "Tier 4": "Tier 4",
            "Tier 5": "Tier 5",
            Custom: "Custom",
          })
        ),
        rate_limit: t.Optional(t.Number()),
        credits: t.Optional(t.Number()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Create User",
        description: "Create a new user",
      },
    }
  )

  // DELETE /admin/users/{user_id} - Deactivate a user
  .delete(
    "/users/:userId",
    async ({ params, body, set, admin }) => {
      const { userId } = params;
      const { reason } = body;

      // Get user's API keys
      const { data: keysData } = await supabase
        .from("api_keys")
        .select("*")
        .eq("owner_id", userId);

      // Revoke all API keys
      if (keysData && keysData.length > 0) {
        const keyIds = keysData.map((key) => key.id);
        await supabase
          .from("api_keys")
          .update({
            status: "revoked",
            updated_at: new Date().toISOString(),
          })
          .in("id", keyIds);
      }

      // Deactivate user
      const { data, error } = await supabase
        .from("users")
        .update({
          status: "revoked",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error deactivating user", { error, userId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "User not found"
              : "Failed to deactivate user",
        };
      }

      // Log deactivation
      await supabase.from("user_events").insert({
        user_id: userId,
        event_type: "deactivation",
        reason: reason || "Admin deactivation",
        timestamp: new Date().toISOString(),
      });

      return {
        user: data as User,
        message: "User deactivated successfully",
        keysRevoked: keysData?.length || 0,
      };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      body: t.Object({
        reason: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Deactivate User",
        description: "Deactivate a user and revoke all their API keys",
      },
    }
  )

  // POST /admin/users/{user_id}/reset-access-key - Reset access key
  .post(
    "/users/:userId/reset-access-key",
    async ({ params, set, admin }) => {
      const { userId } = params;

      // Generate new user access key
      const newUserAccessKey = generateUserAccessKey();

      const { data, error } = await supabase
        .from("users")
        .update({
          user_access_key: newUserAccessKey,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId)
        .select()
        .single();

      if (error) {
        logger.error("Error resetting user access key", { error, userId });
        set.status = error.code === "PGRST116" ? 404 : 500;
        return {
          error:
            error.code === "PGRST116"
              ? "User not found"
              : "Failed to reset user access key",
        };
      }

      // Log access key reset
      await supabase.from("user_events").insert({
        user_id: userId,
        event_type: "access_key_reset",
        timestamp: new Date().toISOString(),
      });

      return {
        user: data as User,
        message: "User access key reset successfully",
      };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Reset User Access Key",
        description: "Reset a user's access key",
      },
    }
  )

  // GET /admin/users/{user_id}/usage - Get usage statistics
  .get(
    "/users/:userId/usage",
    async ({ params, query, set, admin }) => {
      const { userId } = params;
      const timeframe = (query?.timeframe as string) || "30d";

      // Check if user exists
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (userError) {
        logger.error("Error fetching user", { error: userError, userId });
        set.status = userError.code === "PGRST116" ? 404 : 500;
        return {
          error:
            userError.code === "PGRST116"
              ? "User not found"
              : "Failed to fetch user",
        };
      }

      // Calculate date range based on timeframe
      const now = new Date();
      let startDate = new Date();

      switch (timeframe) {
        case "24h":
          startDate.setHours(now.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(now.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(now.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(now.getDate() - 90);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

      // Get usage records
      const { data: usageData, error: usageError } = await supabase
        .from("usage_records")
        .select("*")
        .eq("user_id", userId)
        .gte("timestamp", startDate.toISOString())
        .order("timestamp", { ascending: false });

      if (usageError) {
        logger.error("Error fetching usage data", {
          error: usageError,
          userId,
        });
        set.status = 500;
        return { error: "Failed to fetch usage data" };
      }

      // Calculate statistics
      const totalRequests = usageData?.length || 0;
      const totalTokensInput =
        usageData?.reduce((sum, record) => sum + record.tokens_input, 0) || 0;
      const totalTokensOutput =
        usageData?.reduce((sum, record) => sum + record.tokens_output, 0) || 0;
      const totalCreditsUsed =
        usageData?.reduce((sum, record) => sum + record.credits_used, 0) || 0;

      // Calculate model usage
      const modelUsage: Record<string, number> = {};
      usageData?.forEach((record) => {
        modelUsage[record.model] = (modelUsage[record.model] || 0) + 1;
      });

      // Sort models by usage
      const topModels = Object.entries(modelUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([model, count]) => ({ model, count }));

      return {
        user: userData as User,
        statistics: {
          timeframe,
          totalRequests,
          totalTokensInput,
          totalTokensOutput,
          totalCreditsUsed,
          topModels,
          requestsPerDay:
            totalRequests /
            (timeframe === "24h"
              ? 1
              : timeframe === "7d"
              ? 7
              : timeframe === "30d"
              ? 30
              : 90),
        },
        records: usageData as UsageRecord[],
      };
    },
    {
      params: t.Object({
        userId: t.String(),
      }),
      query: t.Object({
        timeframe: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Get User Usage",
        description: "Get usage statistics for a specific user",
      },
    }
  )

  // GET /admin/usage - Get platform-wide usage statistics
  .get(
    "/usage",
    async ({ query, set, admin }) => {
      const timeframe = (query?.timeframe as string) || "30d";

      // Calculate date range based on timeframe
      const now = new Date();
      let startDate = new Date();

      switch (timeframe) {
        case "24h":
          startDate.setHours(now.getHours() - 24);
          break;
        case "7d":
          startDate.setDate(now.getDate() - 7);
          break;
        case "30d":
          startDate.setDate(now.getDate() - 30);
          break;
        case "90d":
          startDate.setDate(now.getDate() - 90);
          break;
        default:
          startDate.setDate(now.getDate() - 30);
      }

      // Get usage records
      const { data: usageData, error: usageError } = await supabase
        .from("usage_records")
        .select("*")
        .gte("timestamp", startDate.toISOString())
        .order("timestamp", { ascending: false });

      if (usageError) {
        logger.error("Error fetching platform usage data", {
          error: usageError,
        });
        set.status = 500;
        return { error: "Failed to fetch platform usage data" };
      }

      // Get active users count
      const { count: activeUsersCount, error: activeUsersError } =
        await supabase
          .from("users")
          .select("*", { count: "exact" })
          .eq("status", "active");

      if (activeUsersError) {
        logger.error("Error fetching active users", {
          error: activeUsersError,
        });
      }

      // Get active API keys count
      const { count: activeKeysCount, error: activeKeysError } = await supabase
        .from("api_keys")
        .select("*", { count: "exact" })
        .eq("status", "active");

      if (activeKeysError) {
        logger.error("Error fetching active API keys", {
          error: activeKeysError,
        });
      }

      // Calculate statistics
      const totalRequests = usageData?.length || 0;
      const totalTokensInput =
        usageData?.reduce((sum, record) => sum + record.tokens_input, 0) || 0;
      const totalTokensOutput =
        usageData?.reduce((sum, record) => sum + record.tokens_output, 0) || 0;
      const totalCreditsUsed =
        usageData?.reduce((sum, record) => sum + record.credits_used, 0) || 0;

      // Calculate model usage
      const modelUsage: Record<string, number> = {};
      usageData?.forEach((record) => {
        modelUsage[record.model] = (modelUsage[record.model] || 0) + 1;
      });

      // Sort models by usage
      const topModels = Object.entries(modelUsage)
        .sort((a, b) => b[1] - a[1])
        .map(([model, count]) => ({ model, count }));

      // Calculate user activity
      const userActivity: Record<string, number> = {};
      usageData?.forEach((record) => {
        userActivity[record.user_id] = (userActivity[record.user_id] || 0) + 1;
      });

      // Get top users
      const topUsers = Object.entries(userActivity)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([userId, count]) => ({ userId, count }));

      return {
        statistics: {
          timeframe,
          totalRequests,
          totalTokensInput,
          totalTokensOutput,
          totalCreditsUsed,
          activeUsers: activeUsersCount || 0,
          activeApiKeys: activeKeysCount || 0,
          topModels,
          topUsers,
          requestsPerDay:
            totalRequests /
            (timeframe === "24h"
              ? 1
              : timeframe === "7d"
              ? 7
              : timeframe === "30d"
              ? 30
              : 90),
        },
      };
    },
    {
      query: t.Object({
        timeframe: t.Optional(t.String()),
      }),
      detail: {
        tags: ["ADMIN"],
        security: [{ adminKey: [] }],
        summary: "Get Platform Usage",
        description: "Get platform-wide usage statistics",
      },
    }
  );

export default admin;
