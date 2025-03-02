import { Elysia } from "elysia";
import zlib from "zlib";

// Compression logic will be implemented here
const compressResponse = async (
  response: Response,
  req: Request
): Promise<Response> => {
  const acceptEncoding = req.headers.get("accept-encoding") || "";
  if (
    acceptEncoding.includes("gzip") &&
    !response.headers.get("content-encoding")
  ) {
    const originalBuffer = Buffer.from(await response.arrayBuffer());
    const compressedBuffer = zlib.gzipSync(originalBuffer);
    const headers = new Headers(response.headers);
    headers.set("content-encoding", "gzip");
    headers.set("content-length", compressedBuffer.length.toString());
    return new Response(compressedBuffer, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
};

const compressionMiddleware = (app: Elysia) =>
  app
    .onRequest(async (context) => {
      const req = context.request;
      if (req.headers.get("content-encoding") === "gzip") {
        const arrayBuffer = await req.arrayBuffer();
        const decompressed = await new Promise<Buffer>((resolve, reject) => {
          zlib.gunzip(Buffer.from(arrayBuffer), (err, result) => {
            if (err) reject(err);
            else resolve(result);
          });
        });

        context.request = new Request(req.url, {
          method: req.method,
          headers: (() => {
            const headers = new Headers(req.headers);
            headers.delete("content-encoding");
            headers.set("content-length", decompressed.length.toString());
            return headers;
          })(),
          body: decompressed,
        });
      }
    })
    .onAfterHandle(async (context) => {
      return await compressResponse(
        context.response as Response,
        context.request
      );
    });

export default compressionMiddleware;
