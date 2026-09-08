# syntax=docker/dockerfile:1

FROM --platform=$BUILDPLATFORM oven/bun:1.3.10 AS client
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY docs/package.json ./docs/
RUN bun install --frozen-lockfile
COPY shared ./shared
COPY client ./client
RUN bun run --cwd shared build && bun run --cwd client build

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
RUN apk add --no-cache curl \
    && ARCH=$(case "$TARGETARCH" in arm64) echo linux_aarch64 ;; amd64) echo linux ;; *) echo "unsupported $TARGETARCH" >&2 && exit 1 ;; esac) \
    && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_${ARCH}" -o /yt-dlp \
    && chmod +x /yt-dlp

FROM debian:bookworm-slim AS final
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=api /melody-api /app/melody-api
COPY --from=client /app/client/dist /app/pb_public
COPY --from=ytdlp /yt-dlp /usr/local/bin/yt-dlp

ENV SERVER_URL=http://localhost:8090
EXPOSE 8090
VOLUME ["/app/pb_data"]

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8090/api/health || exit 1

ENTRYPOINT ["/app/melody-api", "serve", "--http=0.0.0.0:8090"]
