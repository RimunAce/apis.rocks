import { Elysia, t } from "elysia";
import { downloadMP3 } from "gimmeytmp3";
import logger from "../../utility/logger/logger.service";
import { envService } from "../../utility/env/env.service";
import { randomUUID } from "node:crypto";
import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import type { IncomingMessage } from "node:http";
import {
  isValidYoutubeUrl,
  isBunnyCdnConfigured,
  deleteFile,
} from "../../utility/youtube/youtube.utils";

export const mp3Service = new Elysia().get(
  "/youtube/mp3",
  async ({ query, set }) => {
    const { url } = query;

    if (!url) {
      set.status = 400;
      return { error: "URL is required" };
    }

    if (!isValidYoutubeUrl(url)) {
      set.status = 400;
      return {
        error: "Invalid YouTube URL. Please provide a valid YouTube video URL.",
      };
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

      const REGION = "";
      const BASE_HOSTNAME = "storage.bunnycdn.com";
      const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
      const STORAGE_ZONE_NAME = "apis-rocks";
      const FILENAME_TO_UPLOAD = `${randomUUID()}.mp3`;
      const FILE_PATH = "/";
      const ACCESS_KEY = envService.get("BUNNYCDN_API_KEY");

      const uploadPath = `/${STORAGE_ZONE_NAME}${FILE_PATH}${FILENAME_TO_UPLOAD}`;

      const fileStream = fs.createReadStream(mp3Path);
      const fileStats = fs.statSync(mp3Path);

      const requestOptions = {
        method: "PUT",
        host: HOSTNAME,
        path: uploadPath,
        headers: {
          AccessKey: ACCESS_KEY,
          "Content-Type": "application/octet-stream",
          "Content-Length": fileStats.size,
        },
      };

      return new Promise((resolve, reject) => {
        const req = https.request(requestOptions, (res: IncomingMessage) => {
          let responseData = "";

          res.on("data", (chunk: Buffer) => {
            responseData += chunk.toString("utf8");
          });

          res.on("end", () => {
            logger.info(`BunnyCDN upload response: ${responseData}`);

            if (res.statusCode === 201) {
              const cdnUrl = `https://cdn.apis.rocks${FILE_PATH}${FILENAME_TO_UPLOAD}`;

              if (mp3Path) {
                deleteFile(mp3Path);
              }

              resolve({
                success: true,
                url: cdnUrl,
              });
            } else {
              logger.error(
                `Failed to upload to BunnyCDN: ${res.statusCode} ${responseData}`
              );
              resolve({
                success: false,
                error: `Failed to upload to CDN: ${res.statusCode} ${responseData}`,
                localPath: mp3Path,
              });
            }
          });
        });

        req.on("error", (e: Error) => {
          logger.error(`Problem with BunnyCDN request: ${e.message}`);
          resolve({
            success: false,
            error: `Connection error with CDN: ${e.message}`,
            localPath: mp3Path,
          });
        });

        fileStream.pipe(req);

        fileStream.on("error", (err: Error) => {
          logger.error(`Error reading file for upload: ${err.message}`);
          req.destroy();
          resolve({
            success: false,
            error: `Failed to read local file: ${err.message}`,
            localPath: mp3Path,
          });
        });
      });
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
