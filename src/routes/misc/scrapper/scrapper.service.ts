import { Elysia, t } from "elysia";
import logger from "../../../utility/logger/logger.service";
import { envService } from "../../../utility/env/env.service";

// * Scrapper Service
// * This is the most simplest scrapping. There is no advanced features.
// * You can however, implement your own features for more advanced filter and so on.

const scrapperService = new Elysia({ prefix: "/scrapper" })
  .get(
    "/",
    async ({ query, set }) => {
      try {
        if (!query.url) {
          set.status = 400;
          return {
            error: "URL parameter is required",
          };
        }

        try {
          new URL(query.url);
        } catch (error: any) {
          set.status = 400;
          return {
            error: "Invalid URL format",
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
          const response = await fetch(
            `${envService.get("SCRAPPER_URL")}?url=${encodeURIComponent(
              query.url
            )}&html=${query.html ? query.html : true}`,
            {
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            logger.error(`Scrapper API error: ${response.status} ${errorText}`);
            set.status = response.status;
            return {
              error: `Scrapper API error: ${response.status}`,
              details: errorText,
            };
          }

          // If html parameter is true, return the full HTML content
          if (query.html === true) {
            const htmlContent = await response.clone().text();
            set.headers["Content-Type"] = "text/html";
            return htmlContent;
          }

          const data = await response.json();
          return data;
        } catch (error: any) {
          clearTimeout(timeoutId);

          if (error.name === "AbortError") {
            set.status = 504;
            return {
              error: "Request timed out after 60 seconds",
            };
          }

          logger.error(`Scrapper fetch error: ${error.message}`);
          set.status = 500;
          return {
            error: "Failed to fetch data from scrapper service",
            details: error.message,
          };
        }
      } catch (error: any) {
        logger.error(`Unexpected scrapper error: ${error.message}`);
        set.status = 500;
        return {
          error: "An unexpected error occurred",
          details: error.message,
        };
      }
    },
    {
      query: t.Object({
        url: t.Optional(t.String()),
        html: t.Optional(t.BooleanString()),
      }),
      detail: {
        tags: ["MISCELLANEOUS"],
        summary: "Scrape content from a URL",
        description:
          "Fetches and scrapes content from the provided URL using an external scrapper service. Returns structured data about the webpage including content, metadata, and semantic analysis. Default to only sending HTML response otherwise stated.",
        responses: {
          200: {
            description: "Successfully scraped content",
            content: {
              "application/json": {
                schema: t.Object({
                  success: t.Boolean(),
                  url: t.String(),
                  data: t.Object({
                    title: t.String(),
                    metaDescription: t.Optional(t.String()),
                    h1Tags: t.Array(t.String()),
                    content: t.String(),
                  }),
                  structuredData: t.Optional(
                    t.Object({
                      structured: t.Boolean(),
                      data: t.Object({
                        pageType: t.Optional(t.String()),
                        mainTopic: t.Optional(t.String()),
                        keyInformation: t.Optional(t.Array(t.String())),
                        entities: t.Optional(t.Array(t.String())),
                        sentiment: t.Optional(t.String()),
                        categories: t.Optional(t.Array(t.String())),
                        summary: t.Optional(t.String()),
                      }),
                    })
                  ),
                }),
              },
              "text/html": {
                schema: t.String(),
              },
            },
          },
          400: {
            description: "Bad request - Missing or invalid URL",
            content: {
              "application/json": {
                schema: t.Object({
                  error: t.String(),
                }),
              },
            },
          },
          500: {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: t.Object({
                  error: t.String(),
                  details: t.Optional(t.String()),
                }),
              },
            },
          },
          504: {
            description: "Gateway timeout - Request took too long",
            content: {
              "application/json": {
                schema: t.Object({
                  error: t.String(),
                }),
              },
            },
          },
        },
      },
    }
  )
  .compile();

export default scrapperService;
