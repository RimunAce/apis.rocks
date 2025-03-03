import { z } from "zod";
import { t } from "elysia";

export const chatCompletionsRequestSchema = z.object({
  stream: z.boolean().optional(),
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),
});

export const chatCompletionsBodySchema = t.Object({
  stream: t.Optional(t.Boolean()),
  model: t.String(),
  messages: t.Array(
    t.Object({
      role: t.String(),
      content: t.String(),
    })
  ),
  temperature: t.Optional(t.Number()),
  top_p: t.Optional(t.Number()),
  max_tokens: t.Optional(t.Number()),
  frequency_penalty: t.Optional(t.Number()),
  presence_penalty: t.Optional(t.Number()),
});

// Response schemas for better type safety
export const errorResponseSchema = t.Object({
  error: t.String(),
  message: t.Optional(t.String()),
  details: t.Optional(t.Any()),
});

export default chatCompletionsRequestSchema;
