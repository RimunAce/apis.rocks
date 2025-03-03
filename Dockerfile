FROM oven/bun:latest

WORKDIR /app

COPY app/package.json app/bun.lockb* ./

RUN bun install --frozen-lockfile

COPY app/ ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "start"]
