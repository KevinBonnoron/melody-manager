# syntax=docker/dockerfile:1

# ── PocketBase & yt-dlp binaries (per target platform) ──────────────────────

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

# ── Bun binary ──────────────────────────────────────────────────────────────

FROM oven/bun:1.3.10 AS bun-bin

# ── Final image ──────────────────────────────────────────────────────────────
# Expects pre-built artifacts in the Docker context (CI runs bun run build)

FROM nginx:bookworm AS final

COPY --from=bun-bin /usr/local/bin/bun /usr/local/bin/bun

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && apt-get update \
    && apt-get install -y --no-install-recommends supervisor ffmpeg \
    && mkdir -p /var/log/supervisor /app/db/pb_data /app/skills /app/output

WORKDIR /app

# Copy pre-built artifacts (built by CI before docker build)
COPY server/dist ./server/dist
COPY client/dist /usr/share/nginx/html
COPY shared/dist ./shared/dist
COPY plugins/sdk/dist ./plugins/sdk/dist
COPY plugins/youtube/dist ./plugins/youtube/dist
COPY plugins/spotify/dist ./plugins/spotify/dist
COPY plugins/soundcloud/dist ./plugins/soundcloud/dist
COPY plugins/bandcamp/dist ./plugins/bandcamp/dist
COPY plugins/local/dist ./plugins/local/dist
COPY plugins/sonos/dist ./plugins/sonos/dist

# Copy plugin manifests (needed by the plugin loader at runtime)
COPY plugins/youtube/manifest.json ./plugins/youtube/
COPY plugins/spotify/manifest.json ./plugins/spotify/
COPY plugins/soundcloud/manifest.json ./plugins/soundcloud/
COPY plugins/bandcamp/manifest.json ./plugins/bandcamp/
COPY plugins/local/manifest.json ./plugins/local/
COPY plugins/sonos/manifest.json ./plugins/sonos/

# Copy DB hooks and migrations (pb_data is created at runtime)
COPY db/pb_hooks ./db/pb_hooks
COPY db/pb_migrations ./db/pb_migrations

COPY --from=binary-downloader /tmp/pocketbase /usr/local/bin/pocketbase
COPY --from=binary-downloader /tmp/yt-dlp /usr/local/bin/yt-dlp

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh

RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
