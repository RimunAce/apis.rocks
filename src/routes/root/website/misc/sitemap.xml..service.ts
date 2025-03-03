import { Elysia, t } from "elysia";

const sitemapService = new Elysia().get(
  "/sitemap.xml",
  async ({ set }) => {
    const response = await fetch(
      "https://cdn.apis.rocks/pages/misc/sitemap.xml"
    );
    const xml = await response.text();
    set.headers["Content-Type"] = "application/xml";
    return xml;
  },
  {
    detail: {
      summary: "Sitemap XML",
      description: "Returns the sitemap.xml file for web crawlers",
      tags: ["root"],
    },
    response: {
      200: t.String({
        description: "XML content of sitemap.xml",
      }),
    },
  }
);

export default sitemapService;
