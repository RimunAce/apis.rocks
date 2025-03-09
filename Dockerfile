FROM oven/bun:latest AS builder

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
FROM oven/bun:latest

WORKDIR /app

# Install FFmpeg and yt-dlp (required for gimmeytmp3)
RUN apt-get update && \
    apt-get install -y ffmpeg python3 python3-pip && \
    pip3 install yt-dlp && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Verify FFmpeg installation
RUN ffmpeg -version && yt-dlp --version

# Create downloads directory for MP3 files
RUN mkdir -p ./downloads && chmod 777 ./downloads

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
