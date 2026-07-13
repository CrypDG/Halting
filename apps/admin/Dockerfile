# Acting admin panel — production image (Next.js standalone).
# Build from the REPO ROOT (needs the @acting/shared workspace):
#   docker build -f apps/admin/Dockerfile -t acting-admin .

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
RUN npm run build -w @acting/admin

# ── runtime stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3100 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN addgroup -g 1001 nodejs && adduser -u 1001 -G nodejs -S nextjs

# Next puts .next inside the app's own dir (apps/admin/.next), not the repo
# root, even with outputFileTracingRoot set — that setting only affects which
# files get traced into standalone, not where .next itself lives.
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static

USER nextjs
EXPOSE 3100
CMD ["node", "apps/admin/server.js"]
