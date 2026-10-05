# !Browse engine + HostFS for the RISC OS desktop, served behind Apache at /ro/.
# Build context is the repository root:  docker build -f deploy/Dockerfile .
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium fonts-liberation fonts-noto-cjk fonts-noto-color-emoji fonts-dejavu-core \
      dumb-init ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /app /data /profile \
 && chown node:node /data /profile

WORKDIR /app
COPY serve.mjs index.html ./
COPY assets ./assets
COPY src ./src
COPY tools ./tools

ENV HOME=/tmp \
    RISCOS_BROWSER=/usr/bin/chromium \
    RISCOS_BROWSER_ARGS=""

USER node
EXPOSE 8371

# Extra Chrome flags come from RISCOS_BROWSER_ARGS (set in compose.yml), read by tools/browser-server.mjs.
# RISCOS_PROXY_SECRET must be in the environment (compose passes it).
ENTRYPOINT ["dumb-init", "--"]
CMD ["node","serve.mjs","8371","--listen=0.0.0.0","--public-url=https://tsihome.mynetgear.com/ro","--browser","--browser-profile=/profile","--host","Server=/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8371/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
