import { Elysia } from "elysia";

const robotsService = new Elysia()
    .get("/robots.txt", async () => {
        const response = await fetch('https://cdn.apis.rocks/pages/misc/robots.txt');
        const text = await response.text();
        return new Response(text, {
            headers: { 'Content-Type': 'text/plain' }
        });
    }
);

export default robotsService;