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
  banner: {
    js: "var import_meta_url = require('url').pathToFileURL(__filename).href;",
  },
  define: {
    'import.meta.url': 'import_meta_url',
  },
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
    'dodopayments',
  ],
  logLevel: 'info',
});
