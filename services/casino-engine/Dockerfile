# ==============================================================================
# Casino RGS & Virtual Games Engine - Production Multi-Stage Dockerfile
# ==============================================================================
FROM node:24-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY packages/ ./packages/
COPY services/ ./services/

FROM node:24-alpine AS runner
WORKDIR /app/services/casino-engine

ENV NODE_ENV=production
ENV PORT=4002
ENV HOST=0.0.0.0

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=base /app /app

USER appuser

EXPOSE 4002

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4002/api/v1/health || exit 1

CMD ["node", "--experimental-strip-types", "src/index.ts"]
