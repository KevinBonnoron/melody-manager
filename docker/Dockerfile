# syntax=docker/dockerfile:1

# ── PocketBase binary (per target platform) ──────────────────────────────────

FROM alpine:latest AS binary-downloader

ARG POCKETBASE_VERSION=0.26.2
ARG TARGETARCH

WORKDIR /tmp

RUN --mount=type=cache,target=/var/cache/apk \
    apk add curl unzip \
    && ARCH=$(case "$TARGETARCH" in \
        arm64) echo "linux_arm64" ;; \
        amd64) echo "linux_amd64" ;; \
        *) echo "Unsupported architecture: $TARGETARCH" >&2 && exit 1 ;; \
    esac) \
    && curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_${ARCH}.zip" -o pocketbase.zip \
    && unzip -q pocketbase.zip \
    && chmod +x pocketbase \
    && rm pocketbase.zip \
    && YT_DLP_ARCH=$(case "$TARGETARCH" in \
        arm64) echo "linux_aarch64" ;; \
        amd64) echo "linux" ;; \
        *) echo "Unsupported architecture: $TARGETARCH" >&2 && exit 1 ;; \
    esac) \
    && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_${YT_DLP_ARCH}" -o yt-dlp \
    && chmod +x yt-dlp

# ── Bun binary (per target platform) ─────────────────────────────────────────

FROM oven/bun:1.2.4 AS bun-bin

# ── Final image ──────────────────────────────────────────────────────────────

FROM nginx:bookworm AS final

COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends supervisor ffmpeg \
    && mkdir -p /var/log/supervisor /app/db/pb_data /app/skills /app/output

WORKDIR /app

COPY package.json bun.lock* ./
COPY server ./server
COPY client ./client
COPY plugins ./plugins
COPY shared ./shared
COPY db ./db
COPY client/dist /usr/share/nginx/html

RUN bun install --frozen-lockfile

COPY --from=binary-downloader /tmp/pocketbase /usr/local/bin/pocketbase
COPY --from=binary-downloader /tmp/yt-dlp /usr/local/bin/yt-dlp

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
