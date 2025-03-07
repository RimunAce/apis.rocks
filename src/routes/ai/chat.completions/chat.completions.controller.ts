import { Elysia, t } from "elysia";
import { ChatCompletionsBody } from "./chat.completions.interface";
import chatCompletionsRequestSchema, {
  chatCompletionsBodySchema,
  errorResponseSchema,
} from "./chat.completions.schema";
import { AiRequestService } from "../services/ai-request.service";
import models from "../models/list.json";
import {
  validateModelsList,
  resolveProvidersPath,
} from "./chat.completions.util";

const validatedModels = validateModelsList(models).data;
const providersPath = resolveProvidersPath();
const aiRequestService = new AiRequestService(providersPath);

export const createChatCompletionsController = () => {
  return new Elysia().post(
    "/v1/chat/completions",
    async ({
      body,
      set,
      request,
    }: {
      body: ChatCompletionsBody;
      set: { status: number };
      request: Request;
    }) => {
      try {
        const contentType = request.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          set.status = 415;
          return {
            error: "Unsupported Media Type",
            message: "Content-Type must be application/json",
          };
        }

        if (!body || typeof body !== "object") {
          set.status = 422;
          return {
            error: "Unprocessable Entity",
            message:
              "Expected a valid JSON object with required fields: model and messages",
          };
        }

        const validationResult = chatCompletionsRequestSchema.safeParse(body);
        if (!validationResult.success) {
          set.status = 422;
          return {
            error: "Unprocessable Entity",
            message:
              "Invalid request format. Please check required fields: model and messages.",
          };
        }

        const modelExists = validatedModels.some(
          (model) => model.id === body.model
        );
        if (!modelExists) {
          set.status = 404;
          return {
            error: `Model '${body.model}' not found`,
          };
        }

        const isStreaming = body.stream === true;

        const result = await aiRequestService.handleChatCompletions(
          body,
          isStreaming
        );

        if (result && result instanceof ReadableStream) {
          return new Response(result, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
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

        return result;
      } catch (error) {
        set.status = 500;
        return {
          error: "Internal Server Error",
          message:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        };
      }
    },
    {
      detail: {
        summary: "Chat Completions",
        description: "Chat Completions API for AI model interactions",
        tags: ["AI"],
      },
      body: chatCompletionsBodySchema,
      response: {
        200: t.Any(),
        400: errorResponseSchema,
        404: errorResponseSchema,
        415: errorResponseSchema,
        422: errorResponseSchema,
        500: errorResponseSchema,
        502: errorResponseSchema,
      },
    }
  );
};
