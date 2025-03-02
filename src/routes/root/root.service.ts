import { Elysia } from "elysia";

const rootService = new Elysia()
    .get("/", () => 'hello world');

export default rootService;