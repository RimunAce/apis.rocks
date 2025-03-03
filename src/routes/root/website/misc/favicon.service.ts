import { Elysia, t } from "elysia";

const faviconService = new Elysia().get(
  "/favicon.ico",
  async () => {
    return new Response(
      Buffer.from(
        await (
          await fetch("https://cdn.apis.rocks/icon/favicon.ico")
        ).arrayBuffer()
      ),
      {
        headers: { "Content-Type": "image/x-icon" },
      }
    );
  },
  {
    detail: {
      summary: "Favicon",
      description: "Returns the favicon.ico file",
      tags: ["GENERAL"],
    },
    response: {
      200: t.Any({
        description: "Favicon.ico file",
      }),
    },
  }
);

export default faviconService;
