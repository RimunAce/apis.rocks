import { Elysia } from "elysia";
import supabase from "../../utility/database/database.service";
import logger from "../../utility/logger/logger.service";

//////////
//
// * Try not to get confused with the user's API key auth middleware
// * Located in /src/routes/utility/authentication/auth.service.ts
//
///////////

export const adminAuth = new Elysia({ name: "adminAuth" }).derive(
  { as: "global" },
  async ({ request, set }) => {
    const url = new URL(request.url);
    if (url.pathname === "/docs" || url.pathname.startsWith("/docs/")) {
      return {};
    }

    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.error("Missing or invalid Authorization header");
      set.status = 401;
      return { error: "API key is required", admin: null };
    }

    const apiKey = authHeader.slice(7);
    // Remove any trailing ellipsis that might be added by logging
    const cleanApiKey = apiKey.replace(/\.{3,}$/, "").trim();

    logger.info("Authenticating admin request", {
      originalKeyLength: apiKey.length,
      cleanKeyLength: cleanApiKey.length,
    });

    try {
      const { data, error } = await supabase
        .from("admin_keys")
        .select("*")
        .eq("key", cleanApiKey);

      if (error) {
        logger.error("Admin authentication error", { error });
        set.status = 401;
        return { error: "Unauthorized", admin: null };
      }

      if (!data || data.length === 0) {
        logger.error("Admin key not found", {
          cleanKeyLength: cleanApiKey.length,
        });
        set.status = 401;
        return { error: "Unauthorized", admin: null };
      }

      const adminData = data[0];

      logger.info("Admin authenticated successfully", {
        adminId: adminData.id,
        adminName: adminData.name,
      });

      logger.info("Admin accessing route", {
        path: url.pathname,
        method: request.method,
        adminId: adminData.id,
        adminName: adminData.name,
      });

      return { admin: adminData };
    } catch (err) {
      logger.error("Unexpected error during admin authentication", { err });
      set.status = 500;
      return { error: "Internal server error", admin: null };
    }
  }
);
