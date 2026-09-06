const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@applyso/database',
    '@applyso/ui',
    '@applyso/validation',
  ],
  ...(process.env.NEXT_STANDALONE === 'true'
    ? {
        output: 'standalone',
        outputFileTracingRoot: path.join(__dirname, '../..'),
      }
    : {}),
  turbopack: {
    root: path.join(__dirname, '../..'),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

module.exports = nextConfig;
