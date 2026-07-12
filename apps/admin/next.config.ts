import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@halting/shared'],
  // Self-contained server bundle for Docker (node apps/admin/server.js).
  output: 'standalone',
  // Trace from the monorepo root so @halting/shared is bundled into standalone.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
