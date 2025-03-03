import { Elysia, t } from "elysia";

const htmlService = new Elysia().get(
  "/",
  async ({ set }) => {
    const response = await fetch(
      "https://cdn.apis.rocks/pages/html/landing/index.html"
    );
    const html = await response.text();
    set.headers["Content-Type"] = "text/html";
    return html;
  },
  {
    detail: {
      summary: "Landing Page",
      description: "Returns the main landing page HTML",
      tags: ["GENERAL"],
    },
    response: {
      200: t.String({
        description: "HTML content of the landing page",
      }),
    },
  }
);

export default htmlService;
