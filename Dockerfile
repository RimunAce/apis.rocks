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

COPY package.json bun.lockb* ./

RUN bun install --frozen-lockfile

COPY . ./

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "run", "start"]
