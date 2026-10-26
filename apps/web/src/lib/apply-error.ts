export function asDisplayError(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const joined = value
      .map((item) => asDisplayError(item, ''))
      .filter(Boolean)
      .join('; ');
    return joined || fallback;
  }
  if (value && typeof value === 'object' && 'msg' in value) {
    const msg = String((value as { msg: unknown }).msg).trim();
    return msg || fallback;
  }
  return fallback;
}

export function applyErrorMessage(
  status: number,
  data: { error?: unknown; reason?: string; code?: string } | null,
): string {
  if (data?.reason === 'quota_exceeded') {
    return 'You have used all your applications for now. Get more on Plans & Billing.';
  }
  if (status === 404) return 'This posting looks closed or unreachable.';
  if (status === 422) {
    if (data?.code === 'PROFILE_UNCONFIRMED') {
      return asDisplayError(
        data.error,
        'Confirm your profile before applying.',
      );
    }
    if (data?.code === 'RESUME_REQUIRED') {
      return asDisplayError(data.error, 'Add a resume before applying.');
    }
    return asDisplayError(
      data?.error,
      'Could not start this application. Try again.',
    );
  }
  if (status === 502) {
    return 'Apply service is unreachable. Try again in a moment.';
  }
  return asDisplayError(
    data?.error,
    'Could not start this application. Try again.',
  );
}
