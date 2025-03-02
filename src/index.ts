import { Elysia } from "elysia";
import { env } from "process";
import compressionMiddleware from "./utility/compression/compression.service";


new Elysia()
  .use(compressionMiddleware)
  .get("/", () => 'hello world')
  .get("/cat", async () => {
    const response = await fetch("https://cdn.apis.rocks/cat%20monitoring.mp4");
    const buffer = await response.arrayBuffer();
    return new Response(Buffer.from(buffer), {
      headers: { "Content-Type": "video/mp4" }
    });
  })
  .listen(env.PORT || 3000);

console.log(
  `🦊 Elysia running in ${env.NODE_ENV} mode on port ${env.PORT}`
);
