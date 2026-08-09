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
    'better-auth',
    'better-auth/*',
    'drizzle-orm',
    'drizzle-orm/*',
    'pg',
    'postgres',
    '@fallow-cli/beacon',
  ],
  logLevel: 'info',
});
