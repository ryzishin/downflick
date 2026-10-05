# DownFlick — production Dockerfile.
# Works on Render.com, Fly.io, Railway, or any container host.
#
# Build:  docker build -t downflick .
# Run:    docker run -p 3000:3000 downflick

# ---- Stage 1: deps -----------------------------------------------------------
# We install ALL deps (including devDeps) because the build step needs:
#   • @tailwindcss/postcss   (CSS processor)
#   • tailwindcss            (CSS framework)
#   • tw-animate-css         (CSS animation library imported by globals.css)
#   • eslint-config-next    (Next.js build validation)
# The runtime stage doesn't carry node_modules — Next.js standalone bundles
# everything the app actually needs at runtime.
FROM node:20-slim AS deps
WORKDIR /app

# Install system packages needed by yt-dlp + ffmpeg at the final runtime stage.
# Installing them here too so we can verify yt-dlp works during deps stage if needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    ffmpeg \
    curl ca-certificates \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp system-wide (visible to the Node process at runtime)
RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

# Copy lockfile + package.json first for layer caching
COPY package.json bun.lock* package-lock.json* ./

# Install ALL deps (dev + prod). The build step below needs the devDeps.
RUN npm install --no-audit --no-fund

# ---- Stage 2: build ----------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app

# Bring over installed deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build the Next.js standalone bundle
# `next build` with output: "standalone" produces .next/standalone/server.js
# plus a minimal node_modules subset that the runtime needs.
RUN npm run build

# ---- Stage 3: runtime --------------------------------------------------------
FROM node:20-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# So yt-dlp resolves correctly in the spawned child process
ENV PATH="/usr/local/bin:/usr/bin:/bin:${PATH}"

# Re-install runtime system deps (ffmpeg + yt-dlp). This layer is cached
# separately from the build layer to speed up rebuilds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv \
    ffmpeg \
    curl ca-certificates \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --break-system-packages --no-cache-dir yt-dlp

# Copy the Next.js standalone output (this includes a minimal node_modules
# subset that Next.js itself needs at runtime — NOT the full deps tree).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

# Healthcheck — hits the Next.js homepage
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS "http://localhost:3000/" || exit 1

CMD ["node", "server.js"]
