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
  .get("/models", () => {
    return {
      object: "list",
      data: validatedModels,
    };
  })
  .get(
    "/models/:id",
    ModelParamsSchema,
    ({ params: { id } }: { params: { id: string } }) => {
      const model = validatedModels.find((model) => model.id === id);
      if (!model) throw new Error("Model not found");
      return model;
    }
  );

export default modelsService;
