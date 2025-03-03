import { Elysia } from "elysia";

import htmlService from "./website/html.service";
import sitemapService from "./website/misc/sitemap.xml..service";
import robotsService from "./website/misc/robots.txt.service";
import faviconService from "./website/misc/favicon.service";

const rootService = new Elysia()
  .use(htmlService)
  .use(faviconService)
  .use(robotsService)
  .use(sitemapService);

export default rootService;
