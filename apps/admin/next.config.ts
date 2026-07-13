import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@acting/shared'],
  // Self-contained server bundle for Docker (node apps/admin/server.js).
  output: 'standalone',
  // Trace from the monorepo root so @acting/shared is bundled into standalone.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

export default nextConfig;
