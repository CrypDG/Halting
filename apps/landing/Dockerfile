# Acting landing page — production image (Next.js standalone).
# Build from the REPO ROOT:
#   docker build -f apps/landing/Dockerfile -t acting-landing .

# ── build stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
# --ignore-scripts skips the Expo/React-Native postinstall hooks we don't need here.
RUN npm ci --ignore-scripts
RUN npm run build -w @acting/landing

# ── runtime stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3200 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# .next lives inside the app dir (apps/landing/.next), not the repo root.
COPY --from=build --chown=nextjs:nodejs /app/apps/landing/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/landing/.next/static ./apps/landing/.next/static

USER nextjs
EXPOSE 3200
CMD ["node", "apps/landing/server.js"]
