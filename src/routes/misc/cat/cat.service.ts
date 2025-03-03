import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";

const catService = new Elysia()
  .use(
    cors({
      methods: "GET",
    })
  )
  .get(
    "/cat",
    async () => {
      const response = await fetch(
        "https://cdn.apis.rocks/cat%20monitoring.mp4"
      );
      const buffer = await response.arrayBuffer();
      return new Response(Buffer.from(buffer), {
        headers: { "Content-Type": "video/mp4" },
      });
    },
    {
      detail: {
        summary: "Cat Video",
        description: "Returns a cat monitoring video",
        tags: ["cat"],
      },
      response: {
        200: t.Any({
          description: "MP4 video of a cat",
        }),
      },
    }
  );

export default catService;
