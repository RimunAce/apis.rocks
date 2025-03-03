import { ModelsListSchema } from "../models/models.schema";
import { loggerService } from "../../../utility/logger/logger.service";
import path from "path";

export const validateModelsList = (data: unknown) => {
  const result = ModelsListSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid models list");
  }
  return result.data;
};

export const resolveProvidersPath = (): string | undefined => {
  let providersJsonPath: string | undefined;
  try {
    providersJsonPath = path.resolve(
      __dirname,
      "../../!providers/providers.json"
    );
    loggerService.info("Resolved providers path: ", providersJsonPath);
    return providersJsonPath;
  } catch (error) {
    loggerService.warn("Failed to resolve providers path:", error);
    return undefined;
  }
};
