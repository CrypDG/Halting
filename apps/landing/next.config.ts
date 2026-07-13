import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker (node apps/landing/server.js).
  output: 'standalone',
  // Trace from the monorepo root so workspace files resolve into standalone.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
