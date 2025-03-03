import fs from "fs";
import path from "path";
import { envService } from "../../../utility/env/env.service";
import { loggerService } from "../../../utility/logger/logger.service";

export interface Provider {
  name: string;
  env: string;
  description: string;
  base_url: string;
  logo: string;
  enabled: boolean;
  "model-link": Array<{
    chatCompletions?: Record<string, ModelLink>;
    imageGeneration?: Record<string, ModelLink>;
    embedding?: Record<string, ModelLink>;
  }>;
}

export interface ModelLink {
  weight: number;
  url: string;
  "point-to": string;
  enabled: boolean;
}

export interface ProviderWithModel {
  provider: Provider;
  modelId: string;
  url: string;
  apiKey: string | undefined;
  weight: number;
}

export enum EndpointType {
  CHAT_COMPLETIONS = "chatCompletions",
  IMAGE_GENERATION = "imageGeneration",
  EMBEDDING = "embedding",
}

export class ProviderService {
  private providers: Record<string, Provider> = {};

  constructor(providersJsonPath?: string) {
    this.loadProviders(providersJsonPath);
  }

  private loadProviders(providersJsonPath?: string) {
    const possiblePaths = [
      providersJsonPath,
      path.join(process.cwd(), "src/routes/ai/!providers/providers.json"),
      path.join(process.cwd(), "app/src/routes/ai/!providers/providers.json"),
      path.join(process.cwd(), "routes/ai/!providers/providers.json"),
      path.join(process.cwd(), "ai/!providers/providers.json"),
      path.join(process.cwd(), "!providers/providers.json"),
      path.join(process.cwd(), "providers.json"),
      path.join(__dirname, "../../!providers/providers.json"),
      path.join(__dirname, "../!providers/providers.json"),
      path.join(__dirname, "../../providers/providers.json"),
      path.join(__dirname, "../providers/providers.json"),
    ].filter(Boolean) as string[];

    let providers: Record<string, Provider> | null = null;
    let lastError: any = null;

    for (const filePath of possiblePaths) {
      try {
        loggerService.info(`Trying to load providers from: ${filePath}`);
        const data = fs.readFileSync(filePath, "utf8");
        providers = JSON.parse(data);
        loggerService.info(`Successfully loaded providers from: ${filePath}`);
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!providers) {
      loggerService.error(
        "Failed to load providers from all possible paths. Last error:",
        lastError
      );
      this.providers = {
        template: {
          name: "Template",
          env: "TEMPLATE_KEY",
          description: "This is a template provider for development.",
          base_url: "https://example.com",
          logo: "",
          enabled: true,
          "model-link": [
            {
              chatCompletions: {
                "gpt-4o": {
                  weight: 10,
                  url: "/chat/completions",
                  "point-to": "gpt-4o",
                  enabled: true,
                },
              },
            },
          ],
        },
      };
      loggerService.warn(
        "Using fallback provider configuration for development"
      );
    } else {
      this.providers = providers;
    }
  }

  getProvidersForModel(
    modelId: string,
    endpointType: EndpointType
  ): ProviderWithModel[] {
    const result: ProviderWithModel[] = [];

    Object.entries(this.providers).forEach(([providerId, provider]) => {
      if (!provider.enabled) return;

      provider["model-link"].forEach((modelLink) => {
        const endpointModels = modelLink[endpointType];
        if (!endpointModels) return;

        Object.entries(endpointModels).forEach(([providerModelId, config]) => {
          if (config["point-to"] === modelId && config.enabled) {
            const apiKey = envService.get(provider.env as any);

            result.push({
              provider,
              modelId: providerModelId,
              url: `${provider.base_url}${config.url}`,
              apiKey,
              weight: config.weight,
            });
          }
        });
      });
    });

    return result.sort((a, b) => b.weight - a.weight);
  }

  isCorrectEndpoint(modelId: string, endpointType: EndpointType): boolean {
    for (const [_, provider] of Object.entries(this.providers)) {
      if (!provider.enabled) continue;

      for (const modelLink of provider["model-link"]) {
        for (const [currentEndpoint, models] of Object.entries(modelLink)) {
          if (currentEndpoint === endpointType) continue;

          for (const [_, config] of Object.entries(models)) {
            if (config["point-to"] === modelId && config.enabled) {
              return false;
            }
          }
        }
      }
    }

    return true;
  }

  getCorrectEndpointForModel(modelId: string): EndpointType | null {
    for (const [_, provider] of Object.entries(this.providers)) {
      if (!provider.enabled) continue;

      for (const modelLink of provider["model-link"]) {
        for (const [endpoint, models] of Object.entries(modelLink)) {
          for (const [_, config] of Object.entries(models)) {
            if (config["point-to"] === modelId && config.enabled) {
              return endpoint as EndpointType;
            }
          }
        }
      }
    }

    return null;
  }
}
