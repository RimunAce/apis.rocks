import { Elysia } from "elysia";
import htmlService from "./website/html.service";

const rootService = new Elysia().use(htmlService);

export default rootService;
