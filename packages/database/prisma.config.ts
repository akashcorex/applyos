import 'dotenv/config';

import { defineConfig } from 'prisma/config';

const GENERATE_PLACEHOLDER =
  'postgresql://postgres:postgres@127.0.0.1:5432/outreach';

function datasourceUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  if (process.argv.includes('generate')) {
    return GENERATE_PLACEHOLDER;
  }
  throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: datasourceUrl(),
  },
});
