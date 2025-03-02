import { z } from 'zod';

export const ModelParamsSchema = z.object({
  id: z.string(),
});

export const ModelsListSchema = z.object({
  object: z.string(),
  data: z.array(z.object({
    id: z.string(),
    object: z.string(),
    created: z.number(),
    owned_by: z.string(),
  })),
});
