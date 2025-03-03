import { Elysia, t } from "elysia";
import models from "./list.json";
import { ModelsListSchema, ModelParamsSchema } from "./models.schema";

const validateModelsList = (data: unknown) => {
  const result = ModelsListSchema.safeParse(data);
  if (!result.success) {
    throw new Error("Invalid models list");
  }
  return result.data;
};

const validatedModels = validateModelsList(models).data;

const modelsService = new Elysia()
  .get(
    "/models",
    () => {
      return {
        object: "list",
        data: validatedModels,
      };
    },
    {
      detail: {
        summary: "List Models",
        description: "Lists the available AI models",
        tags: ["models"],
      },
      response: {
        200: t.Object({
          object: t.String(),
          data: t.Array(
            t.Object({
              id: t.String(),
              object: t.String(),
              created: t.Number(),
              owned_by: t.String(),
            })
          ),
        }),
      },
    }
  )
  .get(
    "/models/:id",
    ({ params: { id } }: { params: { id: string } }) => {
      const model = validatedModels.find((model) => model.id === id);
      if (!model) throw new Error("Model not found");
      return model;
    },
    {
      detail: {
        summary: "Get Model",
        description: "Retrieves a specific AI model by ID",
        tags: ["models"],
      },
      params: t.Object({
        id: t.String({
          description: "The ID of the model to retrieve",
        }),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          object: t.String(),
          created: t.Number(),
          owned_by: t.String(),
        }),
        404: t.Object({
          error: t.String(),
        }),
      },
    }
  );

export default modelsService;
