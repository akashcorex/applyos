import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { admin } from 'better-auth/plugins';

import { prisma } from '@applyso/database';

import { cookieParentDomain, publicAuthUrl, webOrigins } from './lib/web-origins';

// Phase 1: Prisma is the primary adapter. Better Auth core tables
// (user/session/account/verification) are shared with the legacy Drizzle
// schema by table name, so existing rows are preserved.
const authUrl = publicAuthUrl();
const cookieDomain = cookieParentDomain();
const isHttps = authUrl.startsWith('https://');

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  // Must match Google/LinkedIn authorized redirect:
  // ${BETTER_AUTH_URL}/api/auth/callback/google  (e.g. https://api.applyos.in)
  baseURL: authUrl,
  secret: process.env.BETTER_AUTH_SECRET,
  advanced: {
    useSecureCookies: isHttps,
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: isHttps,
      path: '/',
    },
    ...(cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : {}),
  },
  emailAndPassword: {
    enabled: true,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google', 'linkedin'],
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET
      ? {
          linkedin: {
            clientId: process.env.LINKEDIN_CLIENT_ID,
            clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
          },
        }
      : {}),
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: false,
        defaultValue: 'USER',
        input: false,
      },
      status: {
        type: 'string',
        required: false,
        defaultValue: 'ACTIVE',
        input: false,
      },
      lastLoginAt: {
        type: 'date',
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            await prisma.user.update({
              where: { id: session.userId },
              data: { lastLoginAt: new Date() },
            });
          } catch {
            // lastLoginAt is best-effort; never block sign-in.
          }
        },
      },
    },
  },
  plugins: [
    admin({
      defaultRole: 'USER',
      adminRoles: ['ADMIN'],
    }),
  ],
  trustedOrigins: webOrigins(),
  onAPIError: {
    errorURL: `${process.env.WEB_URL ?? 'http://localhost:3000'}/login`,
  },
});

export type Session = typeof auth.$Infer.Session;
