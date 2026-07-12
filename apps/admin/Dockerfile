# Halting admin panel — production image (Next.js standalone).
# Build from the REPO ROOT (needs the @halting/shared workspace):
#   docker build -f apps/admin/Dockerfile -t halting-admin .

# ── build stage ───────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Public Supabase config is inlined into the client bundle at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_TELEMETRY_DISABLED=1

COPY . .
# --ignore-scripts skips the Expo/React-Native postinstall hooks we don't need here.
RUN npm ci --ignore-scripts
RUN npm run build -w @halting/admin

# ── runtime stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Standalone server + traced deps (incl. @halting/shared) and static assets.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs
EXPOSE 3100
CMD ["node", "apps/admin/server.js"]
