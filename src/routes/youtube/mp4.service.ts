import { Elysia, t } from "elysia";
import logger from "../../utility/logger/logger.service";
import { envService } from "../../utility/env/env.service";
import * as https from "node:https";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import type { IncomingMessage } from "node:http";

const config = {
  showDownloadProgress: envService.get("NODE_ENV") === "development",
  debugMode: envService.get("NODE_ENV") === "development",
  downloadDir: "./downloads",
  storageBucket: "apis-rocks",
  cdnHostname: "cdn.apis.rocks",
};

interface YtDlpResponse {
  title: string;
  duration: number;
  formats: Array<any>;
  thumbnails: Array<any>;
  description: string;
  upload_date: string;
  uploader: string;
  uploader_id: string;
  uploader_url: string;
  channel_id: string;
  channel_url: string;
  view_count: number;
  average_rating: number;
  age_limit: number;
  webpage_url: string;
  categories: Array<string>;
  tags: Array<string>;
  is_live: boolean;
  [key: string]: any;
}

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

const isBunnyCdnConfigured = (): boolean => {
  const apiKey = envService.get("BUNNYCDN_API_KEY");
  return !!apiKey && apiKey.length > 0;
};

const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted file: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Failed to delete file ${filePath}: ${error}`);
  }
};

const isYtDlpInstalled = (): boolean => {
  try {
    const result = child_process.spawnSync("yt-dlp", ["--version"]);
    return result.status === 0;
  } catch (error) {
    return false;
  }
};

const sanitizeFilename = (filename: string): string => {
  // Replace invalid filename characters with underscores
  let sanitized = filename
    .replace(/[/\\?%*:|"<>]/g, "_") // Remove characters invalid for filenames
    .replace(/\s+/g, "_"); // Replace spaces with underscores

  // Limit filename length to avoid path length issues
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }

  return sanitized;
};

const getVideoInfo = (url: string): Promise<YtDlpResponse> => {
  return new Promise((resolve, reject) => {
    const args = [
      "--dump-json",
      "--no-check-certificates",
      "--no-warnings",
      "--prefer-free-formats",
    ];

    if (!config.debugMode) {
      args.push("--no-progress");
      args.push("--quiet");
    }

    args.push(url);

    if (config.debugMode) {
      logger.info(`Executing: yt-dlp ${args.join(" ")}`);
    } else {
      logger.info(`Retrieving video info for ${url}`);
    }

    const ytDlp = child_process.spawn("yt-dlp", args);
    let stdout = "";
    let stderr = "";

    ytDlp.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ytDlp.stderr.on("data", (data) => {
      const errorText = data.toString();
      stderr += errorText;

      if (
        !errorText.includes("[debug]") &&
        !errorText.trim().startsWith("[debug]")
      ) {
        logger.error(`yt-dlp error: ${errorText.trim()}`);
      }
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        const actualErrors = stderr
          .split("\n")
          .filter((line) => !line.includes("[debug]") && line.trim() !== "")
          .join("\n");

        logger.error(
          `yt-dlp exited with code ${code}: ${actualErrors || "Unknown error"}`
        );
        reject(
          new Error(
            `yt-dlp exited with code ${code}: ${
              actualErrors || "Unknown error"
            }`
          )
        );
        return;
      }

      try {
        const info = JSON.parse(stdout);
        resolve(info);
      } catch (error) {
        logger.error(`Failed to parse yt-dlp output: ${error}`);
        reject(new Error(`Failed to parse yt-dlp output: ${error}`));
      }
    });

    ytDlp.on("error", (error) => {
      logger.error(`Failed to spawn yt-dlp: ${error}`);
      reject(error);
    });
  });
};

const downloadVideo = (
  url: string,
  outputPath: string,
  format: string
): Promise<void> => {
  return new Promise((resolve, reject) => {
    const args = [
      "--no-check-certificates",
      "--no-warnings",
      "--prefer-free-formats",
      "-f",
      format,
      "-o",
      outputPath,
      "--merge-output-format",
      "mp4",
    ];

    if (config.showDownloadProgress) {
      args.push("--progress");
    } else {
      args.push("--no-progress");
      args.push("--quiet");
    }

    args.push(url);

    if (config.debugMode) {
      logger.info(`Executing: yt-dlp ${args.join(" ")}`);
    } else {
      logger.info(`Downloading video with format: ${format}`);
    }

    const ytDlp = child_process.spawn("yt-dlp", args);
    let stderr = "";

    ytDlp.stdout.on("data", (data) => {
      const output = data.toString();
      if (
        config.showDownloadProgress &&
        (output.includes("[download]") || output.includes("[ffmpeg]"))
      ) {
        logger.info(`yt-dlp: ${output.trim()}`);
      }
    });

    ytDlp.stderr.on("data", (data) => {
      const errorText = data.toString();
      stderr += errorText;

      if (
        !errorText.includes("[debug]") &&
        !errorText.trim().startsWith("[debug]")
      ) {
        logger.error(`yt-dlp error: ${errorText.trim()}`);
      }
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        const actualErrors = stderr
          .split("\n")
          .filter((line) => !line.includes("[debug]") && line.trim() !== "")
          .join("\n");

        logger.error(
          `yt-dlp exited with code ${code}: ${actualErrors || "Unknown error"}`
        );
        reject(
          new Error(
            `yt-dlp exited with code ${code}: ${
              actualErrors || "Unknown error"
            }`
          )
        );
        return;
      }

      if (!fs.existsSync(outputPath)) {
        reject(
          new Error(`yt-dlp did not create the output file: ${outputPath}`)
        );
        return;
      }

      resolve();
    });

    ytDlp.on("error", (error) => {
      logger.error(`Failed to spawn yt-dlp: ${error}`);
      reject(error);
    });
  });
};

type VideoQuality =
  | "auto"
  | "144p"
  | "240p"
  | "360p"
  | "480p"
  | "720p"
  | "1080p";

const qualityToFormat: Record<string, string> = {
  "144p": "160+bestaudio/best[height<=144]",
  "240p": "133+bestaudio/best[height<=240]",
  "360p": "134+bestaudio/best[height<=360]",
  "480p": "135+bestaudio/best[height<=480]",
  "720p": "136+bestaudio/best[height<=720]",
  "1080p": "137+bestaudio/best[height<=1080]",
  auto: "best[ext=mp4]/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best",
};

// Helper function to validate prerequisites
const validatePrerequisites = (
  url: string,
  set: any
): { error: string } | { success: false; error: string } | null => {
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

  if (!isYtDlpInstalled()) {
    set.status = 503;
    return {
      success: false,
      error:
        "yt-dlp is not installed or not found in PATH. Please install yt-dlp to use this service. See README-YTDLP.md for installation instructions.",
    };
  }

  return null;
};

// Helper function to prepare for download
const prepareDownload = async (
  url: string,
  quality: string
): Promise<{
  videoInfo: YtDlpResponse;
  sanitizedTitle: string;
  mp4Path: string;
  format: string;
}> => {
  const videoInfo = await getVideoInfo(url);
  logger.info(`Video info retrieved: ${videoInfo.title}`);

  const sanitizedTitle = sanitizeFilename(videoInfo.title);
  const uniqueId = `${sanitizedTitle}_${Date.now()}`;
  const mp4Path = path.join(config.downloadDir, `${uniqueId}.mp4`);

  logger.info(
    `Starting download of ${url} with quality ${quality} to ${mp4Path}`
  );

  const format =
    qualityToFormat[quality as VideoQuality] || qualityToFormat.auto;

  return { videoInfo, sanitizedTitle, mp4Path, format };
};

// Helper function to upload to BunnyCDN
const uploadToBunnyCDN = (
  mp4Path: string,
  sanitizedTitle: string,
  videoInfo: YtDlpResponse,
  quality: string
): Promise<
  | {
      success: true;
      url: string;
      quality: string;
      title: string;
      duration: number;
    }
  | { success: false; error: string; localPath?: string }
> => {
  const REGION = "";
  const BASE_HOSTNAME = "storage.bunnycdn.com";
  const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
  const STORAGE_ZONE_NAME = config.storageBucket;
  const FILENAME_TO_UPLOAD = `${sanitizedTitle}.mp4`;
  const FILE_PATH = "/";
  const ACCESS_KEY = envService.get("BUNNYCDN_API_KEY");

  const uploadPath = `/${STORAGE_ZONE_NAME}${FILE_PATH}${FILENAME_TO_UPLOAD}`;
  const fileStream = fs.createReadStream(mp4Path);
  const fileStats = fs.statSync(mp4Path);

  const requestOptions = {
    method: "PUT",
    host: HOSTNAME,
    path: uploadPath,
    headers: {
      AccessKey: ACCESS_KEY,
      "Content-Type": "video/mp4",
      "Content-Length": fileStats.size,
    },
  };

  return new Promise((resolve) => {
    const req = https.request(requestOptions, (res: IncomingMessage) => {
      let responseData = "";

      res.on("data", (chunk: Buffer) => {
        responseData += chunk.toString("utf8");
      });

      res.on("end", () => {
        logger.info(`BunnyCDN upload response: ${responseData}`);

        if (res.statusCode === 201) {
          const cdnUrl = `https://${config.cdnHostname}${FILE_PATH}${FILENAME_TO_UPLOAD}`;
          deleteFile(mp4Path);

          resolve({
            success: true,
            url: cdnUrl,
            quality: quality,
            title: videoInfo.title,
            duration: videoInfo.duration,
          });
        } else {
          logger.error(
            `Failed to upload to BunnyCDN: ${res.statusCode} ${responseData}`
          );
          resolve({
            success: false,
            error: `Failed to upload to CDN: ${res.statusCode} ${responseData}`,
            localPath: mp4Path,
          });
        }
      });
    });

    req.on("error", (e: Error) => {
      logger.error(`Problem with BunnyCDN request: ${e.message}`);
      resolve({
        success: false,
        error: `Connection error with CDN: ${e.message}`,
        localPath: mp4Path,
      });
    });

    fileStream.pipe(req);

    fileStream.on("error", (err: Error) => {
      logger.error(`Error reading file for upload: ${err.message}`);
      req.destroy();
      resolve({
        success: false,
        error: `Failed to read local file: ${err.message}`,
        localPath: mp4Path,
      });
    });
  });
};

// Helper function to handle errors
const handleProcessingError = (
  error: unknown,
  mp4Path: string | undefined,
  set: any
): { success: false; error: string } => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error(`Error processing MP4: ${errorMessage}`);

  if (config.debugMode && error instanceof Error && error.stack) {
    logger.error(`Error stack: ${error.stack}`);
  }

  if (mp4Path && fs.existsSync(mp4Path)) {
    deleteFile(mp4Path);
  }

  set.status = 500;

  if (
    errorMessage.includes("unavailable") ||
    errorMessage.includes("not available")
  ) {
    return {
      success: false,
      error:
        "This video is unavailable or restricted. It may be private, deleted, or region-restricted.",
    };
  }

  if (errorMessage.includes("copyright") || errorMessage.includes("removed")) {
    return {
      success: false,
      error:
        "This video has been removed due to copyright or terms of service violations.",
    };
  }

  if (errorMessage.includes("spawn") || errorMessage.includes("not found")) {
    return {
      success: false,
      error:
        "yt-dlp executable not found. Please install yt-dlp and make sure it's in your PATH.",
    };
  }

  return {
    success: false,
    error: `Failed to process MP4: ${errorMessage}`,
  };
};

export const mp4Service = new Elysia().post(
  "/youtube/mp4",
  async ({ body, set }) => {
    const { url, quality = "auto" } = body;

    // Validate prerequisites
    const validationError = validatePrerequisites(url, set);
    if (validationError) return validationError;

    // Ensure download directory exists
    if (!fs.existsSync(config.downloadDir)) {
      fs.mkdirSync(config.downloadDir, { recursive: true });
    }

    let mp4Path: string | undefined;

    try {
      // Prepare for download
      const {
        videoInfo,
        sanitizedTitle,
        mp4Path: filePath,
        format,
      } = await prepareDownload(url, quality);
      mp4Path = filePath;

      // Download the video
      await downloadVideo(url, mp4Path, format);
      logger.info(`Download completed: ${mp4Path}`);

      // Upload to BunnyCDN
      return uploadToBunnyCDN(mp4Path, sanitizedTitle, videoInfo, quality);
    } catch (error) {
      return handleProcessingError(error, mp4Path, set);
    }
  },
  {
    body: t.Object({
      url: t.String({
        description: "YouTube video URL to download as MP4",
        pattern: "^https?://(www\\.|m\\.)?(youtube\\.com|youtu\\.be).*",
        error: "Must be a valid YouTube URL",
      }),
      quality: t.Optional(
        t.Union(
          [
            t.Literal("auto"),
            t.Literal("144p"),
            t.Literal("240p"),
            t.Literal("360p"),
            t.Literal("480p"),
            t.Literal("720p"),
            t.Literal("1080p"),
          ],
          { description: "Video quality to download (defaults to auto)" }
        )
      ),
    }),
    response: {
      200: t.Union([
        t.Object({
          success: t.Literal(true),
          url: t.String({
            description: "CDN URL to the downloaded MP4 file",
          }),
          quality: t.String({
            description: "Quality of the downloaded video",
          }),
          title: t.String({
            description: "Title of the video",
          }),
          duration: t.Number({
            description: "Duration of the video in seconds",
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
                "Local path to the MP4 file if download succeeded but upload failed",
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
          description:
            "Service unavailable error (BunnyCDN not configured or yt-dlp not installed)",
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
      summary: "Download YouTube video as MP4",
      description:
        "Downloads a YouTube video in MP4 format with quality selection, then uploads to BunnyCDN. " +
        "The local file is automatically deleted after successful upload. " +
        "Requires a valid YouTube URL, properly configured BunnyCDN credentials, and yt-dlp installed on the system. " +
        "Quality options: auto (default), 144p, 240p, 360p, 480p, 720p, 1080p. " +
        "If the requested quality is not available, it will fall back to the next best available quality.",
      tags: ["YOUTUBE"],
    },
  }
);
