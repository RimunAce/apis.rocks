import { Elysia } from "elysia";

const healthService = new Elysia()
  .get("/health", () => {
    return { status: "ok" };
  });

export default healthService;
