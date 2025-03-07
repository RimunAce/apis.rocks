import { Elysia, t } from "elysia";
import logger from "../../../utility/logger/logger.service";
import auth, {
  trackUsage,
  User,
  ApiKey,
} from "../../../utility/authentication/auth.service";
import { AiRequestService } from "../services/ai-request.service";
import models from "../models/list.json";
import {
  validateModelsList,
  resolveProvidersPath,
} from "./chat.completions.util";
import { TokenizationService } from "../../../utility/tokenization/tokenization.service";

const validatedModels = validateModelsList(models).data;
const providersPath = resolveProvidersPath();
const aiRequestService = new AiRequestService(providersPath);
const tokenizationService = TokenizationService.getInstance();

// Get model coefficient (cost per token) from model id
const getModelCoefficient = (model: string): number => {
  const modelData = validatedModels.find((m) => m.id === model);
  if (modelData?.pricing?.coefficent !== undefined) {
    return modelData.pricing.coefficent;
  }
  // Default coefficient if one is not set (like, why?)
  return 0.001;
};

// POST endpoint for chat completions
const chatCompletionsService = new Elysia({ prefix: "/v1/chat/completions" })
  .use(auth) // Oh hey! If you use this decorator, you are explicity asking this endpoint to be protected by the auth middleware! Just saying
  .post(
    "",
    async ({ body, set, user, apiKey, rate_limited, error }) => {
      try {
        if (rate_limited === true) {
          return {
            error: error || "Rate limit exceeded. Please try again later.",
          };
        }

        if (!user || !apiKey) {
          set.status = 401;
          return { error: "Unauthorized" };
        }

        const { model, messages, stream = false } = body;

        const modelExists = validatedModels.some((m) => m.id === model);
        if (!modelExists) {
          set.status = 404;
          return {
            error: `Model '${model}' not found`,
          };
        }

        if ((user as User).credits <= 0) {
          set.status = 402;
          return { error: "Insufficient credits" };
        }

        // Get accurate token count for input (prompt)
        const inputTokens = tokenizationService.countTokensInMessages(
          messages,
          model
        );

        const result = await aiRequestService.handleChatCompletions(
          body,
          stream
        );

        if (result && result instanceof ReadableStream) {
          const tokenCounter =
            tokenizationService.createStreamingTokenCounter(model);

          const tokenCountingStream = new TransformStream({
            transform(chunk, controller) {
              controller.enqueue(chunk);

              const textContent = tokenizationService.parseSSEChunk(
                new TextDecoder().decode(chunk)
              );
              if (textContent) {
                tokenCounter.addChunk(textContent);
              }
            },
            flush(controller) {
              const outputTokens = tokenCounter.getTokenCount();
              const coefficient = getModelCoefficient(model);

              setTimeout(async () => {
                try {
                  await trackUsage(
                    (user as User).id,
                    (apiKey as ApiKey).id,
                    "chat.completion",
                    model,
                    Math.ceil(inputTokens),
                    Math.ceil(outputTokens),
                    coefficient
                  );
                } catch (err) {
                  logger.error(
                    "Error tracking usage for streaming after completion",
                    { err }
                  );
                }
              }, 0);
            },
          });

          const countedStream = result.pipeThrough(tokenCountingStream);

          const estimatedOutputTokens = 100;
          const coefficient = getModelCoefficient(model);

          try {
            await trackUsage(
              (user as User).id,
              (apiKey as ApiKey).id,
              "chat.completion",
              model,
              Math.ceil(inputTokens),
              Math.ceil(estimatedOutputTokens),
              coefficient
            );

            return new Response(countedStream, {
              headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
              },
            });
          } catch (error) {
            logger.error("Error tracking usage for streaming response", {
              error,
            });
            set.status = 500;
            return { error: "Error processing streaming request" };
          }
        }

        if (result && "error" in result) {
          const statusCode =
            result.error === "Incorrect endpoint"
              ? 400
              : result.error === "No provider available"
              ? 404
              : result.error === "All providers failed"
              ? 502
              : 500;

          set.status = statusCode;
          return result;
        }

        const tokensInput = result.usage?.prompt_tokens || inputTokens;

        const outputText = result.choices[0]?.message?.content || "";
        const tokensOutput =
          result.usage?.completion_tokens ||
          tokenizationService.countTokens(outputText, model);

        const coefficient = getModelCoefficient(model);

        await trackUsage(
          (user as User).id,
          (apiKey as ApiKey).id,
          "chat.completion",
          model,
          Math.ceil(tokensInput),
          Math.ceil(tokensOutput),
          coefficient
        );

        return result;
      } catch (error) {
        logger.error("Error in chat completions", { error });
        set.status = 500;
        return { error: "Internal server error" };
      }
    },
    {
      body: t.Object({
        model: t.String(),
        messages: t.Array(
          t.Object({
            role: t.String(),
            content: t.String(),
          })
        ),
        stream: t.Optional(t.Boolean()),
        temperature: t.Optional(t.Number()),
        top_p: t.Optional(t.Number()),
        max_tokens: t.Optional(t.Number()),
        frequency_penalty: t.Optional(t.Number()),
        presence_penalty: t.Optional(t.Number()),
      }),
      detail: {
        tags: ["AI"],
        summary: "Create a chat completion",
        description: "Create a completion for the chat message",
      },
    }
  );

export default chatCompletionsService;
