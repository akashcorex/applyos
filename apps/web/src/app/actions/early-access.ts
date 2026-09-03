'use server';

import { prisma } from '@applyso/database';
import { earlyAccessSubscribeSchema } from '@applyso/validation';

function validateEmail(raw: unknown): { email: string } | { error: string } {
  const result = earlyAccessSubscribeSchema.safeParse({ email: raw });
  if (!result.success) {
    return { error: 'invalid email address' };
  }

  return { email: result.data.email };
}

export async function registerEarlyAccessEmail(
  rawEmail: string,
): Promise<
  | { ok: true; alreadyRegistered: boolean; email: string }
  | { ok: false; error: string }
> {
  const validation = validateEmail(rawEmail);
  if ('error' in validation) {
    return { ok: false, error: validation.error };
  }

  const { email } = validation;

  try {
    const existing = await prisma.earlyAccessEmail.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, alreadyRegistered: true, email };
    }
    await prisma.earlyAccessEmail.create({ data: { email } });
    return { ok: true, alreadyRegistered: false, email };
  } catch (err) {
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2002'
    ) {
      return { ok: true, alreadyRegistered: true, email };
    }
    console.error('[early-access] insert error:', err);
    return { ok: false, error: 'failed to register email' };
  }
}

export async function getEarlyAccessCount(): Promise<number> {
  try {
    return await prisma.earlyAccessEmail.count();
  } catch (err) {
    console.error('[early-access] count error:', err);
    return 0;
  }
}
