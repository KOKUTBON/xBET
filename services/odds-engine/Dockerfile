# ==============================================================================
# Odds Engine Microservice - Production Multi-Stage Dockerfile
# ==============================================================================
FROM node:24-alpine AS base
WORKDIR /app

COPY package*.json ./
COPY packages/ ./packages/
COPY services/ ./services/
RUN cd services/odds-engine && (npm ci --omit=dev || npm install --omit=dev)

FROM node:24-alpine AS runner
WORKDIR /app/services/odds-engine

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Create non-root system user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=base /app /app

USER appuser

EXPOSE 4000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/api/v1/health || exit 1

CMD ["node", "--experimental-strip-types", "src/index.ts"]
