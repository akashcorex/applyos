/**
 * Live smoke test for Better Auth (email + Google) and Phase 1/2 read APIs.
 * Requires the API on $API_URL (default http://localhost:5000) and Postgres.
 *
 *   bun tests/smoke_auth_api.ts
 */
const API = process.env.API_URL ?? 'http://localhost:5000';
const TOKEN = process.env.AGENT_SERVICE_TOKEN ?? 'dev-agent-service-token-applyos';

type Check = { name: string; ok: boolean; detail?: string };

const results: Check[] = [];

function cookieJar(setCookie: string[] | undefined, prev = ''): string {
  if (!setCookie?.length) return prev;
  const next = new Map<string, string>();
  for (const part of prev.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k && rest.length) next.set(k, rest.join('='));
  }
  for (const header of setCookie) {
    const first = header.split(';')[0] ?? '';
    const [k, ...rest] = first.split('=');
    if (k && rest.length) next.set(k.trim(), rest.join('='));
  }
  return [...next.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function req(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<{ status: number; json: unknown; text: string; cookie: string; location: string | null }> {
  const headers = new Headers(init.headers);
  if (!headers.has('Origin')) headers.set('Origin', 'http://localhost:3000');
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    redirect: 'manual',
  });
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  const setCookie =
    typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie') as string]
        : [];
  return {
    status: res.status,
    json,
    text: raw,
    cookie: cookieJar(setCookie, init.cookie ?? ''),
    location: res.headers.get('location'),
  };
}

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const stamp = Date.now();
  const email = `smoke.${stamp}@applyos.test`;
  const password = 'SmokeTest9!';
  const name = 'Smoke Tester';

  const health = await req('/');
  check('GET / health', health.status === 200, String(health.status));

  const unauthMe = await req('/v1/me');
  check('GET /v1/me without session → 401', unauthMe.status === 401);

  const unauthProfiles = await req('/v1/profiles/me');
  check('GET /v1/profiles/me without session → 401', unauthProfiles.status === 401);

  const unauthResumes = await req('/v1/resumes');
  check('GET /v1/resumes without session → 401', unauthResumes.status === 401);

  const unauthAdmin = await req('/v1/admin/users');
  check('GET /v1/admin/users without session → 401', unauthAdmin.status === 401);

  const noTokenWorkflow = await req('/v1/workflows/internal/start', {
    method: 'POST',
    body: JSON.stringify({}),
  });
  check(
    'POST /v1/workflows/internal/start without token → 401',
    noTokenWorkflow.status === 401,
  );

  const noTokenLinkedin = await req('/v1/linkedin-connects/bulk', {
    method: 'POST',
    body: JSON.stringify({ connects: [] }),
  });
  check(
    'POST /v1/linkedin-connects/bulk without token → 401',
    noTokenLinkedin.status === 401,
  );

  const signup = await req('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  check(
    'POST /api/auth/sign-up/email',
    signup.status === 200 || signup.status === 201,
    String(signup.status),
  );
  let cookie = signup.cookie;

  const sessionAfterSignup = await req('/api/auth/get-session', { cookie });
  const sessionUser = (sessionAfterSignup.json as { user?: { email?: string } } | null)
    ?.user;
  check(
    'GET /api/auth/get-session after signup',
    sessionAfterSignup.status === 200 && sessionUser?.email === email,
    sessionUser?.email,
  );

  const me = await req('/v1/me', { cookie });
  const meEmail = (me.json as { user?: { email?: string; role?: string } } | null)?.user;
  check(
    'GET /v1/me after signup',
    me.status === 200 && meEmail?.email === email && meEmail?.role === 'USER',
    `${me.status} ${meEmail?.email ?? ''} ${meEmail?.role ?? ''}`,
  );

  const profileEmpty = await req('/v1/profiles/me', { cookie });
  check(
    'GET /v1/profiles/me empty',
    profileEmpty.status === 200 &&
      (profileEmpty.json as { profile?: unknown } | null)?.profile == null,
    String(profileEmpty.status),
  );

  const profilePut = await req('/v1/profiles/me', {
    method: 'PUT',
    cookie,
    body: JSON.stringify({
      fullName: name,
      headline: 'Smoke test profile',
      location: 'Remote',
    }),
  });
  check(
    'PUT /v1/profiles/me',
    profilePut.status === 200 &&
      (profilePut.json as { profile?: { fullName?: string } } | null)?.profile
        ?.fullName === name,
    String(profilePut.status),
  );

  const profileGet = await req('/v1/profiles/me', { cookie });
  check(
    'GET /v1/profiles/me after save',
    profileGet.status === 200 &&
      (profileGet.json as { profile?: { fullName?: string } } | null)?.profile
        ?.fullName === name,
  );

  const resumes = await req('/v1/resumes', { cookie });
  check(
    'GET /v1/resumes (empty list)',
    resumes.status === 200 &&
      Array.isArray((resumes.json as { resumes?: unknown } | null)?.resumes),
    String(resumes.status),
  );

  const adminAsUser = await req('/v1/admin/users', { cookie });
  check('GET /v1/admin/users as USER → 403', adminAsUser.status === 403);

  const signOut = await req('/api/auth/sign-out', {
    method: 'POST',
    cookie,
    body: JSON.stringify({}),
  });
  check(
    'POST /api/auth/sign-out',
    signOut.status === 200,
    String(signOut.status),
  );
  cookie = signOut.cookie;

  const meAfterOut = await req('/v1/me', { cookie });
  check('GET /v1/me after sign-out → 401', meAfterOut.status === 401);

  const signIn = await req('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  check(
    'POST /api/auth/sign-in/email',
    signIn.status === 200,
    String(signIn.status),
  );
  cookie = signIn.cookie;

  const meAfterIn = await req('/v1/me', { cookie });
  check(
    'GET /v1/me after email sign-in',
    meAfterIn.status === 200 &&
      (meAfterIn.json as { user?: { email?: string } } | null)?.user?.email ===
        email,
  );

  const google = await req('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: 'http://localhost:3000/dashboard',
      disableRedirect: true,
    }),
  });
  const googleUrl =
    (google.json as { url?: string } | null)?.url ?? google.location ?? '';
  const googleOk =
    (google.status === 200 ||
      google.status === 302 ||
      google.status === 301 ||
      google.status === 307) &&
    /accounts\.google\.com|google\.com\/o\/oauth2/.test(googleUrl);
  check(
    'POST /api/auth/sign-in/social google → Google OAuth URL',
    googleOk,
    `${google.status} ${googleUrl.slice(0, 96)}`,
  );

  const tokenOk = await req('/v1/linkedin-connects', {
    headers: { 'X-Agent-Service-Token': TOKEN },
  });
  check(
    'GET /v1/linkedin-connects with service token',
    tokenOk.status === 200,
    String(tokenOk.status),
  );

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
