import { Elysia, t } from "elysia";
import { downloadMP3 } from "gimmeytmp3";
import logger from "../../utility/logger/logger.service";
import { randomUUID } from "node:crypto";
import {
  isBunnyCdnConfigured,
  deleteFile,
} from "../../utility/youtube/youtube.utils";
import { uploadToBunnyCDN } from "../../utility/bunnycdn/bunnycdn.utils";
import { validateYoutubeRequest } from "../../utility/youtube/validation";

export const mp3Service = new Elysia().get(
  "/youtube/mp3",
  async ({ query, set }) => {
    const { url } = query;

    const validationResult = validateYoutubeRequest(url);
    if (validationResult) {
      set.status = validationResult.status;
      return { error: validationResult.error };
    }

    if (!isBunnyCdnConfigured()) {
      set.status = 503;
      return { error: "BunnyCDN is not configured. Service unavailable." };
    }

    let mp3Path: string | undefined = undefined;

    try {
      const options = { showProgress: false };

      mp3Path = await downloadMP3(url, "./downloads", options);
      logger.info(`Downloaded MP3 from ${url} to ${mp3Path}`);

      const fileName = `${randomUUID()}.mp3`;

      const result = await uploadToBunnyCDN(
        mp3Path,
        fileName,
        {
          storageBucket: "apis-rocks",
          cdnHostname: "cdn.apis.rocks",
        },
        {}
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Error processing MP3 from ${url}: ${errorMessage}`);

      if (mp3Path) {
        deleteFile(mp3Path);
      }

      set.status = 500;
      return {
        success: false,
        error: `Failed to process MP3: ${errorMessage}`,
      };
    }
  },
  {
    query: t.Object({
      url: t.String({
        description: "YouTube video URL to convert to MP3",
        pattern: "^https?://(www\\.|m\\.)?(youtube\\.com|youtu\\.be).*",
        error: "Must be a valid YouTube URL",
      }),
    }),
    response: {
      200: t.Union([
        t.Object({
          success: t.Literal(true),
          url: t.String({
            description: "CDN URL to the converted MP3 file",
          }),
        }),
        t.Object({
          success: t.Literal(false),
          error: t.String({
            description: "Detailed error message explaining what went wrong",
          }),
          localPath: t.Optional(
            t.String({
              description:
                "Local path to the MP3 file if download succeeded but upload failed",
            })
          ),
        }),
      ]),
      400: t.Object({
        error: t.String({
          description:
            "Error message for invalid requests (missing or invalid URL)",
        }),
      }),
      503: t.Object({
        error: t.String({
          description: "Service unavailable error (BunnyCDN not configured)",
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
      summary: "Convert YouTube video to MP3",
      description:
        "Downloads a YouTube video and converts it to MP3 format, then uploads to BunnyCDN. " +
        "The local file is automatically deleted after successful upload. " +
        "Requires a valid YouTube URL and properly configured BunnyCDN credentials.",
      tags: ["YOUTUBE"],
    },
  }
);
