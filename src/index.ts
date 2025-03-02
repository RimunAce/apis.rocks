import { Elysia } from "elysia";
import { env } from "process";
import compressionMiddleware from "./utility/compression/compression.service";

////////////////////////////////
// Importing routes           //
////////////////////////////////
import catService from "./routes/misc/cat/cat.service";
import healthService from "./routes/health/health.service";
import rootService from "./routes/root/root.service";

////////////////////////////////
// Setting Up/Starting Up     //
////////////////////////////////
new Elysia()
  .use(compressionMiddleware)
  .use(rootService)
  .use(catService)
  .use(healthService)
  .listen(env.PORT || 3000);

console.log(
  `🦊 Elysia running in ${env.NODE_ENV} mode on port ${env.PORT}`
);

