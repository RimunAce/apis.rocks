import { Elysia } from "elysia";

const catService = new Elysia()
    .get("/cat", async () => {
        const response = await fetch("https://cdn.apis.rocks/cat%20monitoring.mp4");
        const buffer = await response.arrayBuffer();
        return new Response(Buffer.from(buffer), {
            headers: { "Content-Type": "video/mp4" }
        });
    }
);

export default catService;