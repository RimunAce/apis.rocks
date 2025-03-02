import { Elysia } from "elysia";

import htmlService from "./website/html.service";
import sitemapService from "./website/misc/sitemap.xml..service";
import robotsService from "./website/misc/robots.txt.service";

const rootService = new Elysia()
    .use(htmlService)
    .use(robotsService)
    .use(sitemapService);

export default rootService;
