import { Elysia } from "elysia";

const sitemapService = new Elysia().get("/sitemap.xml", async () => {
  const response = await fetch("https://cdn.apis.rocks/pages/misc/sitemap.xml");
  const xml = await response.text();
  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
});

export default sitemapService;
