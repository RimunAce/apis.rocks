import { Elysia } from "elysia";

const htmlService = new Elysia()
.get("/", async () => {
    const response = await fetch('https://cdn.apis.rocks/pages/html/landing/index.html');
    const html = await response.text();
    return new Response(html, {
        headers: { 'Content-Type': 'text/html' }
    });
});

export default htmlService;
