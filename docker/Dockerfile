# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM oven/bun:1.3.10 AS client
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts index.html components.json ./
COPY src ./src
COPY public ./public
RUN bun run build

FROM --platform=$BUILDPLATFORM golang:1.26-bookworm AS api
ARG TARGETARCH
WORKDIR /src
COPY api/go.mod api/go.sum ./
RUN go mod download
COPY api/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /melody-api .

FROM --platform=$BUILDPLATFORM alpine:latest AS ytdlp
ARG TARGETARCH
# Pinned, not "latest": the layer cache would freeze whichever release was
# current at first build, and a stale yt-dlp breaks YouTube playback. Keep in
# step with flake.nix.
ARG YTDLP_VERSION=2026.08.19
RUN apk add --no-cache curl \
    && ARCH=$(case "$TARGETARCH" in arm64) echo linux_aarch64 ;; amd64) echo linux ;; *) echo "unsupported $TARGETARCH" >&2 && exit 1 ;; esac) \
    && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_${ARCH}" -o /yt-dlp \
    && chmod +x /yt-dlp

# Target arch, unlike the build stages: this bun ships in the image.
FROM oven/bun:1.3.10 AS bunruntime

FROM debian:bookworm-slim AS final
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=api /melody-api /app/melody-api
COPY --from=client /app/dist /app/pb_public
COPY --from=ytdlp /yt-dlp /usr/local/bin/yt-dlp
# yt-dlp needs a JavaScript runtime to solve YouTube's signature challenges.
COPY --from=bunruntime /usr/local/bin/bun /usr/local/bin/bun

ENV SERVER_URL=http://localhost:8090
ENV CACHE_DIR=/app/cache
EXPOSE 8090
VOLUME ["/app/pb_data", "/app/cache"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8090/api/health || exit 1

ENTRYPOINT ["/app/melody-api", "serve", "--http=0.0.0.0:8090"]
