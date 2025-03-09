import { cpus } from "os";
import cluster from "cluster";
import { envService } from "./utility/env/env.service";
import logger from "./utility/logger/logger.service";

const WORKERS =
  envService.get("NODE_ENV") === "production"
    ? Math.max(1, cpus().length - 1) // Production? Use all CPUs except one.
    : 1; // Development? Use single process for easier debugging.

if (cluster.isPrimary) {
  logger.info(`🚀 Primary ${process.pid} is running`);
  logger.info(`🧠 Starting ${WORKERS} workers...`);

  for (let i = 0; i < WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(
      `🔥 Worker ${worker.process.pid} died with code: ${code} and signal: ${signal}`
    );
    logger.info("🔄 Starting a new worker...");
    cluster.fork();
  });
} else {
  try {
    import("./index");
    logger.info(`🧑‍🔧 Worker ${process.pid} started`);
  } catch (error) {
    logger.error(
      `Failed to start worker: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exit(1);
  }
}
