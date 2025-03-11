import { Elysia, t } from "elysia";
import logger from "../../utility/logger/logger.service";
import * as https from "node:https";

const isValidYoutubeUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const validDomains = [
      "youtube.com",
      "www.youtube.com",
      "youtu.be",
      "m.youtube.com",
      "music.youtube.com",
    ];
    return validDomains.some((domain) => urlObj.hostname === domain);
  } catch (error) {
    return false;
  }
};

const extractVideoId = (url: string): string | null => {
  try {
    const urlObj = new URL(url);

    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.substring(1);
    }

    const validDomains = [
      "youtube.com",
      "www.youtube.com",
      "m.youtube.com",
      "music.youtube.com",
    ];
    if (validDomains.some((domain) => urlObj.hostname === domain)) {
      const videoId = urlObj.searchParams.get("v");
      if (videoId) return videoId;

      if (urlObj.pathname.includes("/shorts/")) {
        return urlObj.pathname.split("/shorts/")[1].split("/")[0];
      }
    }

    return null;
  } catch (error) {
    return null;
  }
};

const fetchYoutubeHtml = async (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        },
        (res) => {
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP error: ${res.statusCode}`));
            return;
          }

          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve(data);
          });
        }
      )
      .on("error", (err) => {
        reject(err);
      });
  });
};

interface VideoInfo {
  id: string;
  url: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  channelUrl: string;
  publishDate: string;
  viewCount: string | number;
  likeCount?: string | number;
  duration: string | number;
  formattedDuration?: string;
  thumbnails: Array<{
    url: string;
    width: number;
    height: number;
  }>;
  tags: string[];
  isLiveContent: boolean;
  category?: string;
}

const extractVideoInfo = (html: string): VideoInfo => {
  const info: VideoInfo = {
    id: "",
    url: "",
    title: "",
    description: "",
    channelName: "",
    channelId: "",
    channelUrl: "",
    publishDate: "",
    viewCount: "0",
    duration: 0,
    thumbnails: [],
    tags: [],
    isLiveContent: false,
  };

  try {
    let ytInitialData = null;
    const dataRegex = /window\["ytInitialData"\]\s*=\s*({.*?});/s;
    const dataMatch =
      html.match(dataRegex) ||
      html.match(/var\s+ytInitialData\s*=\s*({.*?});/s);

    if (dataMatch && dataMatch[1]) {
      try {
        ytInitialData = JSON.parse(dataMatch[1]);
      } catch (e) {
        logger.error(`Failed to parse ytInitialData: ${e}`);
      }
    }

    let ytInitialPlayerResponse = null;
    const playerRegex = /window\["ytInitialPlayerResponse"\]\s*=\s*({.*?});/s;
    const playerMatch =
      html.match(playerRegex) ||
      html.match(/var\s+ytInitialPlayerResponse\s*=\s*({.*?});/s);

    if (playerMatch && playerMatch[1]) {
      try {
        ytInitialPlayerResponse = JSON.parse(playerMatch[1]);
      } catch (e) {
        logger.error(`Failed to parse ytInitialPlayerResponse: ${e}`);

        const scriptTags = html.match(/<script[^>]*>(\{.*?\})<\/script>/gs);
        if (scriptTags) {
          for (const script of scriptTags) {
            if (
              script.includes('"videoDetails"') &&
              script.includes('"playerConfig"')
            ) {
              try {
                const jsonContent = script.replace(
                  /<script[^>]*>([\s\S]*?)<\/script>/g,
                  "$1"
                );

                if (
                  jsonContent.trim().startsWith("{") &&
                  jsonContent.trim().endsWith("}")
                ) {
                  ytInitialPlayerResponse = JSON.parse(jsonContent);
                  break;
                } else {
                  logger.error(
                    "Script content does not appear to be valid JSON"
                  );
                }
              } catch (err) {
                logger.error(`Failed to parse script tag JSON: ${err}`);
              }
            }
          }
        }
      }
    }

    if (!ytInitialPlayerResponse && !ytInitialData) {
      const jsonScriptRegex =
        /<script[^>]+type="application\/json"[^>]*>(.*?)<\/script>/gs;
      let match;
      while ((match = jsonScriptRegex.exec(html)) !== null) {
        try {
          const jsonData = JSON.parse(match[1]);
          if (jsonData.playerResponse) {
            ytInitialPlayerResponse = jsonData.playerResponse;
            break;
          }
        } catch (e) {
          logger.error(`Failed to parse JSON script tag: ${e}`);
        }
      }
    }

    if (ytInitialPlayerResponse) {
      const videoDetails = ytInitialPlayerResponse.videoDetails;
      if (videoDetails) {
        info.title = videoDetails.title || "";
        info.description = videoDetails.shortDescription || "";
        info.channelName = videoDetails.author || "";
        info.channelId = videoDetails.channelId || "";
        info.viewCount = videoDetails.viewCount || "0";
        info.isLiveContent = videoDetails.isLiveContent || false;
        info.duration = videoDetails.lengthSeconds
          ? parseInt(videoDetails.lengthSeconds)
          : 0;

        if (videoDetails.thumbnail && videoDetails.thumbnail.thumbnails) {
          info.thumbnails = videoDetails.thumbnail.thumbnails;
        }
      }

      const microformat =
        ytInitialPlayerResponse.microformat?.playerMicroformatRenderer;
      if (microformat) {
        info.publishDate = microformat.publishDate || "";
        info.channelUrl = microformat.ownerProfileUrl || "";

        if (microformat.category) {
          info.category = microformat.category;
        }
      }
    }

    if (ytInitialData) {
      try {
        const contents =
          ytInitialData.contents?.twoColumnWatchNextResults?.results?.results
            ?.contents || [];
        for (const content of contents) {
          const videoSecondaryInfoRenderer = content.videoSecondaryInfoRenderer;
          if (videoSecondaryInfoRenderer) {
            const metadataRowContainer =
              videoSecondaryInfoRenderer.metadataRowContainer
                ?.metadataRowContainerRenderer?.rows || [];
            for (const row of metadataRowContainer) {
              if (row.metadataRowRenderer?.title?.runs?.[0]?.text === "Tags") {
                info.tags =
                  row.metadataRowRenderer.contents?.[0]?.runs?.map(
                    (run: any) => run.text
                  ) || [];
              }
            }
          }

          const videoPrimaryInfoRenderer = content.videoPrimaryInfoRenderer;
          if (videoPrimaryInfoRenderer) {
            const likeButton =
              videoPrimaryInfoRenderer.videoActions?.menuRenderer
                ?.topLevelButtons?.[0]?.toggleButtonRenderer;
            if (
              likeButton &&
              likeButton.defaultText?.accessibility?.accessibilityData?.label
            ) {
              const likeText =
                likeButton.defaultText.accessibility.accessibilityData.label;
              const likeMatch = likeText.match(/(\d+(?:,\d+)*)/);
              if (likeMatch) {
                info.likeCount = likeMatch[0];
              }
            }
          }
        }
      } catch (e) {
        logger.error(`Failed to extract additional data: ${e}`);
      }
    }

    if (info.viewCount && typeof info.viewCount === "string") {
      info.viewCount = parseInt(info.viewCount.replace(/,/g, ""));
    }

    if (info.likeCount && typeof info.likeCount === "string") {
      info.likeCount = info.likeCount.replace(/,/g, "");
    }

    if (info.duration && typeof info.duration === "number") {
      const hours = Math.floor(info.duration / 3600);
      const minutes = Math.floor((info.duration % 3600) / 60);
      const seconds = info.duration % 60;

      info.formattedDuration = [
        hours > 0 ? hours.toString().padStart(2, "0") : null,
        minutes.toString().padStart(2, "0"),
        seconds.toString().padStart(2, "0"),
      ]
        .filter(Boolean)
        .join(":");
    }
  } catch (error) {
    logger.error(`Error extracting video info: ${error}`);
  }

  return info;
};

export const infoService = new Elysia().get(
  "/youtube/info",
  async ({ query, set }) => {
    const { url, id } = query;

    if (!url && !id) {
      set.status = 400;
      return { error: "Either URL or video ID is required" };
    }

    let videoId: string | null = null;
    let videoUrl: string = "";

    if (url) {
      if (!isValidYoutubeUrl(url)) {
        set.status = 400;
        return {
          error:
            "Invalid YouTube URL. Please provide a valid YouTube video URL.",
        };
      }

      videoId = extractVideoId(url);
      videoUrl = url;
    } else if (id) {
      videoId = id;
      videoUrl = `https://www.youtube.com/watch?v=${id}`;
    }

    if (!videoId) {
      set.status = 400;
      return {
        error:
          "Could not extract video ID from the provided URL or invalid video ID.",
      };
    }

    try {
      const html = await fetchYoutubeHtml(videoUrl);

      const videoInfo = extractVideoInfo(html);

      videoInfo.id = videoId;
      videoInfo.url = videoUrl;

      return {
        success: true as const,
        data: videoInfo,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(
        `Error fetching YouTube info for ${videoUrl}: ${errorMessage}`
      );

      set.status = 500;
      return {
        success: false,
        error: `Failed to fetch video information: ${errorMessage}`,
      };
    }
  },
  {
    query: t.Object({
      url: t.Optional(
        t.String({
          description: "YouTube video URL to fetch information from",
        })
      ),
      id: t.Optional(
        t.String({
          description: "YouTube video ID to fetch information from",
        })
      ),
    }),
    response: {
      200: t.Object({
        success: t.Literal(true),
        data: t.Object({
          id: t.String(),
          url: t.String(),
          title: t.String(),
          description: t.String(),
          channelName: t.String(),
          channelId: t.String(),
          channelUrl: t.String(),
          publishDate: t.String(),
          viewCount: t.Union([t.String(), t.Number()]),
          likeCount: t.Optional(t.Union([t.String(), t.Number()])),
          duration: t.Union([t.String(), t.Number()]),
          formattedDuration: t.Optional(t.String()),
          thumbnails: t.Array(
            t.Object({
              url: t.String(),
              width: t.Number(),
              height: t.Number(),
            })
          ),
          tags: t.Array(t.String()),
          isLiveContent: t.Boolean(),
          category: t.Optional(t.String()),
        }),
      }),
      400: t.Object({
        error: t.String({
          description: "Error message for invalid requests",
        }),
      }),
      500: t.Object({
        success: t.Literal(false),
        error: t.String({
          description: "Internal server error message",
        }),
      }),
    },
    detail: {
      summary: "Fetch YouTube video information",
      description:
        "Scrapes and fetches detailed information about a YouTube video from its URL or ID. " +
        "Returns comprehensive metadata including title, description, channel info, view count, " +
        "like count, duration, thumbnails, tags, and more.",
      tags: ["YOUTUBE"],
    },
  }
);
