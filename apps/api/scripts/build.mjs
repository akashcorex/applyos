import { build } from 'esbuild';

const production = process.argv.includes('--production');

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: !production,
  tsconfig: 'tsconfig.app.json',
  external: [
    'express',
    'cors',
    'dotenv',
    'multer',
    'better-auth',
    'better-auth/*',
    '@better-auth/prisma-adapter',
    '@prisma/client',
    '@prisma/adapter-pg',
    'pg',
    '@fallow-cli/beacon',
  ],
  logLevel: 'info',
});
