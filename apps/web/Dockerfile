# ==============================================================================
# Web Frontend SPA - Production Multi-Stage Dockerfile
# ==============================================================================
FROM node:24-alpine AS base
WORKDIR /app

COPY apps/web/ ./apps/web/
COPY scripts/bundle-frontend.ts ./scripts/bundle-frontend.ts
RUN node scripts/bundle-frontend.ts

FROM node:24-alpine AS runner
WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV PORT=4004
ENV HOST=0.0.0.0

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=base /app /app

USER appuser

EXPOSE 4004

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4004/ || exit 1

CMD ["node", "--experimental-strip-types", "server.ts"]
