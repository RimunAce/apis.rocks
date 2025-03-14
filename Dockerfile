FROM oven/bun:1.0.25 AS builder

WORKDIR /app

# Copy package files first for better caching
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . ./

# Build the application
RUN bun run build

# Start a new stage for the runtime
FROM oven/bun:1.0.25

WORKDIR /app

# Install FFmpeg, yt-dlp and additional dependencies for video processing
RUN apt-get update && \
    apt-get install -y ca-certificates curl ffmpeg libavcodec-extra libavdevice-dev \
    libavformat-dev libavutil-dev libcrypto++-dev libssl-dev libswscale-dev \
    python3 python3-pip wget && \
    pip3 install --no-cache-dir --upgrade yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    ffmpeg -version && yt-dlp --version && \
    mkdir -p ./downloads && chmod 777 ./downloads

# Copy package files and install production dependencies only
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile --production

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy necessary files for runtime
COPY --from=builder /app/src/utility ./src/utility

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port
EXPOSE 3000

# Run the application in production mode with clustering
CMD ["bun", "run", "prod"]
