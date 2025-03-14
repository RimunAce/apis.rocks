import * as https from "node:https";
import * as fs from "node:fs";
import type { IncomingMessage } from "node:http";
import { envService } from "../env/env.service";
import logger from "../logger/logger.service";
import { deleteFile } from "../youtube/youtube.utils";

interface BunnyCdnConfig {
  storageBucket: string;
  cdnHostname: string;
}

type UploadResult<T> =
  | {
      success: true;
      url: string;
      data: T;
    }
  | {
      success: false;
      error: string;
      localPath?: string;
    };

export const uploadToBunnyCDN = <T>(
  filePath: string,
  fileName: string,
  config: BunnyCdnConfig,
  additionalData: T
): Promise<UploadResult<T>> => {
  const REGION = "";
  const BASE_HOSTNAME = "storage.bunnycdn.com";
  const HOSTNAME = REGION ? `${REGION}.${BASE_HOSTNAME}` : BASE_HOSTNAME;
  const STORAGE_ZONE_NAME = config.storageBucket;
  const FILE_PATH = "/";
  const ACCESS_KEY = envService.get("BUNNYCDN_API_KEY");

  const uploadPath = `/${STORAGE_ZONE_NAME}${FILE_PATH}${fileName}`;
  const fileStream = fs.createReadStream(filePath);
  const fileStats = fs.statSync(filePath);

  const requestOptions = {
    method: "PUT",
    host: HOSTNAME,
    path: uploadPath,
    headers: {
      AccessKey: ACCESS_KEY,
      "Content-Type": getContentType(fileName),
      "Content-Length": fileStats.size,
    },
  };

  return new Promise<UploadResult<T>>((resolve) => {
    const req = https.request(requestOptions, (res: IncomingMessage) => {
      let responseData = "";

      res.on("data", (chunk: Buffer) => {
        responseData += chunk.toString("utf8");
      });

      res.on("end", () => {
        logger.info(`BunnyCDN upload response: ${responseData}`);

        if (res.statusCode === 201) {
          const cdnUrl = `https://${config.cdnHostname}${FILE_PATH}${fileName}`;
          deleteFile(filePath);

          resolve({
            success: true,
            url: cdnUrl,
            data: additionalData,
          });
        } else {
          logger.error(
            `Failed to upload to BunnyCDN: ${res.statusCode} ${responseData}`
          );
          resolve({
            success: false,
            error: `Failed to upload to CDN: ${res.statusCode} ${responseData}`,
            localPath: filePath,
          });
        }
      });
    });

    req.on("error", (e: Error) => {
      logger.error(`Problem with BunnyCDN request: ${e.message}`);
      resolve({
        success: false,
        error: `Connection error with CDN: ${e.message}`,
        localPath: filePath,
      });
    });

    fileStream.pipe(req);

    fileStream.on("error", (err: Error) => {
      logger.error(`Error reading file for upload: ${err.message}`);
      req.destroy();
      resolve({
        success: false,
        error: `Failed to read local file: ${err.message}`,
        localPath: filePath,
      });
    });
  });
};

const getContentType = (fileName: string): string => {
  const extension = fileName.split(".").pop()?.toLowerCase();
  switch (extension) {
    case "mp4":
      return "video/mp4";
    case "mp3":
      return "audio/mpeg";
    default:
      return "application/octet-stream";
  }
};
