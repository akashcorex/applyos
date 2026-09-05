import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from './generated/prisma/client.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  // Prisma 7 uses node-pg. Neon and other managed Postgres hosts require TLS;
  // rejectUnauthorized: false matches the v6 engine's previous default.
  const needsTls = /sslmode=require|neon\.tech|ssl=true/i.test(
    connectionString,
  );
  const adapter = new PrismaPg({
    connectionString,
    ...(needsTls ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  return new PrismaClient({ adapter });
}

// Reuse a single client across hot reloads / serverless invocations.
export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
