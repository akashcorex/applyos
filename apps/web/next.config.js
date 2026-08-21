const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@applyso/database', '@applyso/ui'],
  // Monorepo root so Turbopack resolves hoisted `next` and this repo's bun.lock
  // instead of a lockfile under the home directory.
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
};

module.exports = nextConfig;
