import { Elysia, t } from "elysia";
import logger from "../../utility/logger/logger.service";
import { envService } from "../../utility/env/env.service";
import {
  isValidYoutubeUrl,
  isBunnyCdnConfigured,
  deleteFile,
} from "../../utility/youtube/youtube.utils";
import { uploadToBunnyCDN } from "../../utility/bunnycdn/bunnycdn.utils";
import * as fs from "node:fs";
import * as path from "node:path";
import * as child_process from "node:child_process";
import * as os from "node:os";
import { ChildProcessWithoutNullStreams } from "child_process";

const config = {
  showDownloadProgress: envService.get("NODE_ENV") === "development",
  debugMode: envService.get("NODE_ENV") === "development",
  downloadDir: "./downloads",
  storageBucket: "apis-rocks",
  cdnHostname: "cdn.apis.rocks",
};

const getYtDlpPath = (): string => {
  const isWindows = os.platform() === "win32";
  const possiblePaths = isWindows
    ? [
        path.join(process.cwd(), "yt-dlp.exe"),
        path.join(os.homedir(), "yt-dlp", "yt-dlp.exe"),
        "C:\\Program Files\\yt-dlp\\yt-dlp.exe",
        "C:\\Program Files (x86)\\yt-dlp\\yt-dlp.exe",
        "yt-dlp.exe",
      ]
    : [
        path.join(process.cwd(), "yt-dlp"),
        path.join("/usr/local/bin", "yt-dlp"),
        path.join("/usr/bin", "yt-dlp"),
        path.join(os.homedir(), "bin", "yt-dlp"),
        "yt-dlp",
      ];

  for (const p of possiblePaths.slice(0, -1)) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return possiblePaths[possiblePaths.length - 1];
};

const ytDlpPath = getYtDlpPath();

const handleYtDlpStderr = (data: Buffer, stderr: string): string => {
  const errorText = data.toString();
  const newStderr = stderr + errorText;

  if (
    !errorText.includes("[debug]") &&
    !errorText.trim().startsWith("[debug]")
  ) {
    logger.error(`yt-dlp error: ${errorText.trim()}`);
  }

  return newStderr;
};

const processYtDlpErrors = (stderr: string, code: number | null): string => {
  const exitCode = code ?? -1;
  const actualErrors = stderr
    .split("\n")
    .filter((line) => !line.includes("[debug]") && line.trim() !== "")
    .join("\n");

  logger.error(
    `yt-dlp exited with code ${exitCode}: ${actualErrors || "Unknown error"}`
  );

  return actualErrors || "Unknown error";
};

const setupYtDlpErrorHandlers = (
  ytDlp: ChildProcessWithoutNullStreams,
  stderr: string,
  reject: (reason?: any) => void
): void => {
  ytDlp.on("error", (error) => {
    logger.error(`Failed to spawn yt-dlp: ${error}`);
    reject(error);
  });
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

const isYtDlpInstalled = (): boolean => {
  try {
    const result = child_process.spawnSync(ytDlpPath, ["--version"], {
      env: { ...process.env, PATH: process.env.PATH ?? "" },
      shell: false,
    });
    return result.status === 0;
  } catch (error) {
    logger.error(`Failed to check yt-dlp installation: ${error}`);
    return false;
  }
};

const sanitizeFilename = (filename: string): string => {
  let sanitized = filename
    .replace(/[/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, "_");

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
      logger.info(`Executing: ${ytDlpPath} ${args.join(" ")}`);
    } else {
      logger.info(`Retrieving video info for ${url}`);
    }

    const ytDlp = child_process.spawn(ytDlpPath, args, {
      env: { ...process.env, PATH: process.env.PATH ?? "" },
      shell: false,
    });
    let stdout = "";
    let stderr = "";

    ytDlp.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ytDlp.stderr.on("data", (data) => {
      stderr = handleYtDlpStderr(data, stderr);
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        const errorMessage = processYtDlpErrors(stderr, code);
        reject(new Error(`yt-dlp exited with code ${code}: ${errorMessage}`));
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

    setupYtDlpErrorHandlers(ytDlp, stderr, reject);
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
      logger.info(`Executing: ${ytDlpPath} ${args.join(" ")}`);
    } else {
      logger.info(`Downloading video with format: ${format}`);
    }

    const ytDlp = child_process.spawn(ytDlpPath, args, {
      env: { ...process.env, PATH: process.env.PATH ?? "" },
      shell: false,
    });
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
      stderr = handleYtDlpStderr(data, stderr);
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        const errorMessage = processYtDlpErrors(stderr, code);
        reject(new Error(`yt-dlp exited with code ${code}: ${errorMessage}`));
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

    setupYtDlpErrorHandlers(ytDlp, stderr, reject);
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

const uploadToStorage = async (
  mp4Path: string,
  sanitizedTitle: string,
  videoInfo: YtDlpResponse,
  quality: string
) => {
  const result = await uploadToBunnyCDN(
    mp4Path,
    `${sanitizedTitle}.mp4`,
    {
      storageBucket: config.storageBucket,
      cdnHostname: config.cdnHostname,
    },
    {
      quality,
      title: videoInfo.title,
      duration: videoInfo.duration,
    }
  );

  if (result.success) {
    return {
      success: true as const,
      url: result.url,
      quality: result.data.quality,
      title: result.data.title,
      duration: result.data.duration,
    };
  }
  return result;
};

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

    const validationError = validatePrerequisites(url, set);
    if (validationError) return validationError;

    if (!fs.existsSync(config.downloadDir)) {
      fs.mkdirSync(config.downloadDir, { recursive: true });
    }

    let mp4Path: string | undefined;

    try {
      const {
        videoInfo,
        sanitizedTitle,
        mp4Path: filePath,
        format,
      } = await prepareDownload(url, quality);
      mp4Path = filePath;

      await downloadVideo(url, mp4Path, format);
      logger.info(`Download completed: ${mp4Path}`);

      return uploadToStorage(mp4Path, sanitizedTitle, videoInfo, quality);
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
