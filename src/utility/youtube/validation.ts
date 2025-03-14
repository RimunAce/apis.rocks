import { isValidYoutubeUrl, isBunnyCdnConfigured } from "./youtube.utils";
import logger from "../logger/logger.service";

export interface ValidationResult {
  success: false;
  error: string;
  status: number;
}

export const validateYoutubeRequest = (
  url: string,
  options: {
    checkYtDlp?: boolean;
    isYtDlpInstalled?: () => boolean;
  } = {}
): ValidationResult | undefined => {
  if (!url) {
    return {
      success: false,
      error: "URL is required",
      status: 400,
    };
  }

  if (!isValidYoutubeUrl(url)) {
    return {
      success: false,
      error: "Invalid YouTube URL. Please provide a valid YouTube video URL.",
      status: 400,
    };
  }

  if (!isBunnyCdnConfigured()) {
    return {
      success: false,
      error: "BunnyCDN is not configured. Service unavailable.",
      status: 503,
    };
  }

  if (
    options.checkYtDlp &&
    options.isYtDlpInstalled &&
    !options.isYtDlpInstalled()
  ) {
    return {
      success: false,
      error:
        "yt-dlp is not installed or not found in PATH. Please install yt-dlp to use this service. See README-YTDLP.md for installation instructions.",
      status: 503,
    };
  }

  return undefined;
};
