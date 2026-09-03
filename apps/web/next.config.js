const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@applyso/database',
    '@applyso/ui',
    '@applyso/validation',
  ],
  // Railway Docker uses `output: 'standalone'` for minimal image.
  // Enable only when `NEXT_STANDALONE=true` to keep local dev fast.
  ...(process.env.NEXT_STANDALONE === 'true' ? { output: 'standalone' } : {}),
  // Monorepo root so Turbopack resolves hoisted `next` and this repo's bun.lock
  // instead of a lockfile under the home directory.
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  // Railway/Vercel: skip TS project-references check (Next 16 + Turbopack limitation with rootDir)
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
