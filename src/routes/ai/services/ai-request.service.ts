import {
  EndpointType,
  ProviderService,
  ProviderWithModel,
} from "./provider.service";
import path from "path";
import { loggerService } from "../../../utility/logger/logger.service";

export class AiRequestService {
  private providerService: ProviderService;

  constructor(providersJsonPath?: string) {
    if (!providersJsonPath) {
      try {
        providersJsonPath = path.resolve(
          __dirname,
          "../../!providers/providers.json"
        );
        loggerService.info("Using resolved providers path:", providersJsonPath);
      } catch (error) {
        loggerService.warn("Failed to resolve providers.json path:", error);
      }
    }

    this.providerService = new ProviderService(providersJsonPath);
  }

  async handleChatCompletions(requestBody: any, isStreaming: boolean) {
    const modelId = requestBody.model;

    if (
      !this.providerService.isCorrectEndpoint(
        modelId,
        EndpointType.CHAT_COMPLETIONS
      )
    ) {
      const correctEndpoint =
        this.providerService.getCorrectEndpointForModel(modelId);
      return {
        error: "Incorrect endpoint",
        message: `The model '${modelId}' should be used with the '${correctEndpoint}' endpoint, not chat completions.`,
      };
    }

    const providers = this.providerService.getProvidersForModel(
      modelId,
      EndpointType.CHAT_COMPLETIONS
    );

    if (providers.length === 0) {
      return {
        error: "No provider available",
        message: `No provider available for model '${modelId}'.`,
      };
    }

    if (isStreaming) {
      return this.handleStreamingRequest(providers, requestBody);
    } else {
      return this.handleNonStreamingRequest(providers, requestBody);
    }
  }

  private async handleNonStreamingRequest(
    providers: ProviderWithModel[],
    requestBody: any
  ) {
    const errors: any[] = [];

    for (const provider of providers) {
      try {
        const providerRequestBody = {
          ...requestBody,
          model: provider.modelId,
        };

        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(providerRequestBody),
        });

        if (!response.ok) {
          const error = await response.json();
          errors.push({
            provider: provider.provider.name,
            error,
          });
          continue;
        }

        const data = await response.json();
        return data;
      } catch (error) {
        errors.push({
          provider: provider.provider.name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return {
      error: "All providers failed",
      details: errors,
    };
  }

  private async handleStreamingRequest(
    providers: ProviderWithModel[],
    requestBody: any
  ) {
    const createProviderStream = async (provider: ProviderWithModel) => {
      const providerRequestBody = {
        ...requestBody,
        model: provider.modelId,
        stream: true,
      };

      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify(providerRequestBody),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(JSON.stringify(error));
        }

        return response.body;
      } catch (error) {
        throw error;
      }
    };

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      try {
        const stream = await createProviderStream(provider);
        return stream;
      } catch (error) {
        if (i === providers.length - 1) {
          return new Response(
            JSON.stringify({
              error: "All providers failed",
              message: "Failed to stream from any provider",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }
  }
}
