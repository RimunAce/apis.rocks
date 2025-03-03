import { Elysia, t } from "elysia";

const robotsService = new Elysia().get(
  "/robots.txt",
  async ({ set }) => {
    const response = await fetch(
      "https://cdn.apis.rocks/pages/misc/robots.txt"
    );
    const text = await response.text();
    set.headers["Content-Type"] = "text/plain";
    return text;
  },
  {
    detail: {
      summary: "Robots.txt",
      description: "Returns the robots.txt file for web crawlers",
      tags: ["GENERAL"],
    },
    response: {
      200: t.String({
        description: "Text content of robots.txt",
      }),
    },
  }
);

export default robotsService;
