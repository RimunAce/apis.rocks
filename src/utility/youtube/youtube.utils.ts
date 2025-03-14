import { envService } from "../env/env.service";
import logger from "../logger/logger.service";
import * as fs from "node:fs";

export const isValidYoutubeUrl = (url: string): boolean => {
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

export const isBunnyCdnConfigured = (): boolean => {
  const apiKey = envService.get("BUNNYCDN_API_KEY");
  return !!apiKey && apiKey.length > 0;
};

export const deleteFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info(`Deleted file: ${filePath}`);
    }
  } catch (error) {
    logger.error(`Failed to delete file ${filePath}: ${error}`);
  }
};
