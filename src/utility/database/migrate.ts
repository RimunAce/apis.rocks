import { readFileSync } from "fs";
import { join } from "path";
import supabase from "./database.service";
import logger from "../logger/logger.service";

async function runMigration() {
  try {
    logger.info("Starting database migration check");

    const tables = [
      "users",
      "api_keys",
      "usage_records",
      "credit_changes",
      "user_events",
      "admin_keys",
    ];
    const missingTables = [];

    for (const table of tables) {
      const { error } = await supabase
        .from(table)
        .select("count")
        .limit(1)
        .maybeSingle();

      if (error && error.code === "PGRST301") {
        missingTables.push(table);
      }
    }

    if (missingTables.length > 0) {
      logger.error(`Missing tables: ${missingTables.join(", ")}`);
      logger.info(
        "Please run the migration SQL manually in the Supabase SQL editor"
      );

      const migrationPath = join(__dirname, "migration.sql");
      const migrationSQL = readFileSync(migrationPath, "utf8");

      console.log("\n=== Migration SQL ===\n");
      console.log(migrationSQL);
      console.log("\n=== End of Migration SQL ===\n");

      console.log("Instructions:");
      console.log("1. Log in to your Supabase dashboard");
      console.log("2. Go to the SQL Editor");
      console.log("3. Create a new query");
      console.log("4. Paste the above SQL");
      console.log("5. Run the query");

      return { success: false, missingTables };
    }

    logger.info("All required tables exist");

    const { data: adminKeys, error: adminKeysError } = await supabase
      .from("admin_keys")
      .select("*")
      .limit(1);

    if (!adminKeysError && (!adminKeys || adminKeys.length === 0)) {
      logger.info("No admin keys found, inserting default admin key");

      const { error: insertError } = await supabase.from("admin_keys").insert({
        key: "admin-key-change-me-in-production",
        name: "Default Admin Key",
      });

      if (insertError) {
        logger.error("Failed to insert default admin key", {
          error: insertError,
        });
      } else {
        logger.info("Default admin key inserted successfully");
      }
    }

    logger.info("Migration check completed successfully");
    return { success: true };
  } catch (error) {
    logger.error("Unhandled error during migration check", { error });
    return { success: false, error };
  }
}

if (require.main === module) {
  runMigration()
    .then((result) => {
      if (result.success) {
        logger.info("Migration check completed successfully");
        process.exit(0);
      } else {
        if (result.missingTables) {
          logger.error(
            `Migration check failed: Missing tables: ${result.missingTables.join(
              ", "
            )}`
          );
        } else {
          logger.error("Migration check failed", { error: result.error });
        }
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error("Unhandled error in migration check", { error });
      process.exit(1);
    });
}

export default runMigration;
