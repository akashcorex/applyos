const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export async function subscribeEarlyAccess(email: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/v1/early-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (res.status === 409) {
    return { message: "You're already on the list. We'll be in touch soon!" };
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Something went wrong');
  }

  return { message: "You're in. We'll reach out when it's ready." };
}

export async function getEarlyAccessCount(): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/v1/early-access/count`);
    if (!res.ok) return null;
    const data = (await res.json()) as { count?: number };
    return typeof data.count === 'number' ? data.count : null;
  } catch {
    return null;
  }
}