import { Elysia, t } from "elysia";

const healthService = new Elysia().get(
  "/health",
  () => {
    return { status: "ok" };
  },
  {
    detail: {
      summary: "Health Check",
      description: "Returns the health status of the API",
      tags: ["health"],
    },
    response: {
      200: t.Object({
        status: t.String(),
      }),
    },
  }
);

export default healthService;
