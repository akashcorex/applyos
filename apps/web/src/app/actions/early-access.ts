'use server';

import { db, earlyAccessEmail } from '@applyso/database';

function validateEmail(raw: unknown): { email: string } | { error: string } {
  if (!raw || typeof raw !== 'string') {
    return { error: 'email is required' };
  }

  const normalized = raw.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    return { error: 'invalid email address' };
  }

  return { email: normalized };
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
    const [row] = await db
      .insert(earlyAccessEmail)
      .values({ email })
      .onConflictDoNothing({ target: earlyAccessEmail.email })
      .returning();

    return { ok: true, alreadyRegistered: !row, email };
  } catch (err) {
    console.error('[early-access] insert error:', err);
    return { ok: false, error: 'failed to register email' };
  }
}

export async function getEarlyAccessCount(): Promise<number> {
  try {
    const rows = await db.select().from(earlyAccessEmail);
    return rows.length;
  } catch (err) {
    console.error('[early-access] count error:', err);
    return 0;
  }
}
