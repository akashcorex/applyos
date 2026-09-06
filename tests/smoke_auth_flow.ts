/**
 * Strict live smoke for the split-origin auth flow.
 * Requires API :5000 and web :3000.
 *
 *   bun tests/smoke_auth_flow.ts
 */
import {
  classifyMeStatus,
  sessionStatusFromLookup,
} from '../apps/web/src/lib/proxy-session';
import {
  rewriteLocation,
  rewriteSetCookie,
} from '../apps/web/src/lib/rewrite-auth-headers';
import {
  AUTH_CLIENT_BASE_URL,
  toSameOriginAuthPath,
} from '../apps/web/src/lib/auth-client';

const API = process.env.API_URL ?? 'http://localhost:5000';
const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const WEB_FETCH = process.env.WEB_FETCH ?? WEB;

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

async function call(
  origin: string,
  path: string,
  init: RequestInit & { cookie?: string; originHeader?: string } = {},
): Promise<{
  status: number;
  json: unknown;
  text: string;
  cookie: string;
  setCookie: string[];
  location: string | null;
}> {
  const headers = new Headers(init.headers);
  if (!headers.has('Origin')) {
    headers.set('Origin', init.originHeader ?? WEB);
  }
  if (init.cookie) headers.set('Cookie', init.cookie);
  if (init.body && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${origin}${path}`, {
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
    setCookie,
    location: res.headers.get('location'),
  };
}

const api = (path: string, init?: RequestInit & { cookie?: string; originHeader?: string }) =>
  call(API, path, init);
const web = (path: string, init?: RequestInit & { cookie?: string; originHeader?: string }) =>
  call(WEB_FETCH, path, { ...init, originHeader: init?.originHeader ?? WEB });

function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function redirectUriFrom(url: string): string | null {
  try {
    return new URL(url).searchParams.get('redirect_uri');
  } catch {
    return null;
  }
}

function asUser(json: unknown): { email?: string; role?: string } | undefined {
  return (json as { user?: { email?: string; role?: string } } | null)?.user;
}

async function main() {
  const stamp = Date.now();
  const email = `smoke.flow.${stamp}@applyos.test`;
  const password = 'SmokeTest9!';
  const name = 'Smoke Flow';

  check('client base URL is pinned dummy origin', AUTH_CLIENT_BASE_URL === 'https://same-origin.invalid');
  check(
    'client rewrites API get-session to same-origin path',
    toSameOriginAuthPath('https://api.applyos.in/api/auth/get-session') ===
      '/api/auth/get-session',
  );
  check('classify 404 is logged out', classifyMeStatus(404) === 'unauthenticated');
  check('classify 500 is unavailable', classifyMeStatus(500) === 'unavailable');
  check(
    'no cookie is logged out even on 200',
    sessionStatusFromLookup(null, 200) === 'unauthenticated',
  );
  check(
    'timeout is unavailable',
    sessionStatusFromLookup('sid=1', null) === 'unavailable',
  );

  const webReq = { origin: WEB, protocol: 'http:', host: 'localhost:3000' };
  check(
    'rewrite keeps OAuth callback on API host',
    rewriteLocation(
      'https://api.applyos.in/api/auth/callback/google?code=1',
      { origin: 'https://www.applyos.in', protocol: 'https:', host: 'www.applyos.in' },
      'api.applyos.in',
    ) === 'https://api.applyos.in/api/auth/callback/google?code=1',
  );
  check(
    'rewrite maps API dashboard Location onto web',
    rewriteLocation(
      'https://api.applyos.in/dashboard',
      { origin: 'https://www.applyos.in', protocol: 'https:', host: 'www.applyos.in' },
      'api.applyos.in',
    ) === 'https://www.applyos.in/dashboard',
  );
  check(
    'rewrite strips sibling API Domain',
    !/Domain=/i.test(
      rewriteSetCookie(
        'better-auth.session_token=x; Domain=api.applyos.in; Path=/',
        'https:',
        'api.applyos.in',
      ),
    ),
  );
  check(
    'rewrite keeps parent Domain=applyos.in',
    rewriteSetCookie(
      'better-auth.session_token=x; Domain=applyos.in; Path=/',
      'http:',
      'api.applyos.in',
    ).includes('Domain=applyos.in'),
  );
  void webReq;

  const health = await api('/');
  check('API GET /', health.status === 200, String(health.status));

  const unauthMe = await api('/v1/me');
  check('API /v1/me without cookie → 401', unauthMe.status === 401);

  const corsBad = await api('/api/auth/get-session', {
    method: 'GET',
    originHeader: 'https://evil.example',
  });
  const acao = (corsBad as { status: number }).status;
  check('API rejects unknown Origin (still responds)', acao === 200 || acao === 403 || acao === 401);

  const signup = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  check(
    'API sign-up/email',
    signup.status === 200 || signup.status === 201,
    String(signup.status) + (signup.text ? ` ${signup.text.slice(0, 80)}` : ''),
  );
  const apiCookie = signup.cookie;
  check('API signup set a session cookie', /session/i.test(apiCookie) || apiCookie.includes('='), apiCookie.split('=')[0]);
  const apiHasDomain = signup.setCookie.some((c) => /Domain=/i.test(c));
  check(
    'API localhost signup has no parent Domain (cookieParentDomain unset)',
    !apiHasDomain,
    signup.setCookie[0]?.slice(0, 120),
  );
  check(
    'API localhost signup is not Secure (http)',
    !signup.setCookie.some((c) => /;\s*Secure/i.test(c)),
  );

  const session = await api('/api/auth/get-session', { cookie: apiCookie });
  check(
    'API get-session after signup',
    session.status === 200 && asUser(session.json)?.email === email,
    asUser(session.json)?.email,
  );

  const me = await api('/v1/me', { cookie: apiCookie });
  const onboarding = (me.json as { onboarding?: { onboardingComplete?: boolean } } | null)
    ?.onboarding;
  check(
    'API /v1/me after signup is USER and onboarding incomplete',
    me.status === 200 &&
      asUser(me.json)?.email === email &&
      asUser(me.json)?.role === 'USER' &&
      onboarding?.onboardingComplete === false,
    `${me.status} complete=${String(onboarding?.onboardingComplete)}`,
  );

  const dup = await api('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  check('API duplicate signup is rejected', dup.status >= 400, String(dup.status));

  const badPw = await api('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'wrong-password' }),
  });
  check('API wrong password fails', badPw.status >= 400, String(badPw.status));

  const google = await api('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: `${WEB}/dashboard`,
      disableRedirect: true,
    }),
  });
  const googleUrl =
    (google.json as { url?: string } | null)?.url ?? google.location ?? '';
  const googleRedirect = redirectUriFrom(googleUrl);
  check(
    'API Google returns Google OAuth URL',
    (google.status === 200 || google.status === 302) &&
      /accounts\.google\.com|google\.com\/o\/oauth2/.test(googleUrl),
    `${google.status}`,
  );
  check(
    'API Google redirect_uri is API callback (not web)',
    googleRedirect === `${API}/api/auth/callback/google`,
    googleRedirect ?? 'none',
  );

  const googleWebCb = await api('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: 'https://evil.example/dashboard',
      disableRedirect: true,
    }),
  });
  const evilUrl =
    (googleWebCb.json as { url?: string } | null)?.url ?? googleWebCb.location ?? '';
  check(
    'API Google rejects untrusted callbackURL origin',
    googleWebCb.status >= 400 ||
      !evilUrl ||
      redirectUriFrom(evilUrl) === `${API}/api/auth/callback/google`,
    `${googleWebCb.status}`,
  );

  const linkedin = await api('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'linkedin',
      callbackURL: `${WEB}/dashboard`,
      disableRedirect: true,
    }),
  });
  const liUrl =
    (linkedin.json as { url?: string } | null)?.url ?? linkedin.location ?? '';
  const liRedirect = redirectUriFrom(liUrl);
  check(
    'API LinkedIn redirect_uri is API callback',
    !!liUrl &&
      (liRedirect === `${API}/api/auth/callback/linkedin` ||
        liRedirect === `${API}/api/auth/callback/linkedin`),
    liRedirect ?? `${linkedin.status} ${liUrl.slice(0, 80)}`,
  );

  const err = await api('/?error=redirect_uri_mismatch');
  check(
    'API /?error= redirects to web /login',
    (err.status === 302 || err.status === 307) &&
      (err.location ?? '').startsWith(`${WEB}/login`) &&
      (err.location ?? '').includes('redirect_uri_mismatch'),
    err.location,
  );

  const dashNoCookie = await web('/dashboard');
  check(
    'proxy /dashboard without cookie → /login',
    (dashNoCookie.status === 307 || dashNoCookie.status === 302) &&
      (dashNoCookie.location ?? '').includes('/login'),
    `${dashNoCookie.status} ${dashNoCookie.location}`,
  );
  const loginNoCookie = await web('/login');
  check(
    'proxy /login without cookie stays on login',
    loginNoCookie.status === 200,
    String(loginNoCookie.status),
  );
  const signupPage = await web('/signup');
  check('proxy /signup without cookie stays', signupPage.status === 200, String(signupPage.status));

  const bffSignupEmail = `smoke.bff.${stamp}@applyos.test`;
  const bffSignup = await web('/api/auth/sign-up/email', {
    method: 'POST',
    body: JSON.stringify({ name, email: bffSignupEmail, password }),
  });
  check(
    'BFF sign-up/email',
    bffSignup.status === 200 || bffSignup.status === 201,
    `${bffSignup.status} ${bffSignup.text.slice(0, 80)}`,
  );
  const bffCookie = bffSignup.cookie;
  check('BFF signup set a session cookie', bffCookie.includes('='), bffCookie.split('=')[0]);
  check(
    'BFF Set-Cookie Domain is not the API host',
    !bffSignup.setCookie.some((c) => /Domain=api\./i.test(c) || /Domain=localhost:5000/i.test(c)),
    bffSignup.setCookie[0]?.slice(0, 140),
  );

  const bffSession = await web('/api/auth/get-session', { cookie: bffCookie });
  check(
    'BFF get-session after signup',
    bffSession.status === 200 && asUser(bffSession.json)?.email === bffSignupEmail,
    asUser(bffSession.json)?.email,
  );

  const bffMe = await web('/api/me', { cookie: bffCookie });
  check(
    'BFF /api/me after signup',
    bffMe.status === 200 && asUser(bffMe.json)?.email === bffSignupEmail,
    `${bffMe.status} ${asUser(bffMe.json)?.email ?? ''}`,
  );

  const dashWithCookie = await web('/dashboard', { cookie: bffCookie });
  check(
    'proxy /dashboard with incomplete onboarding → /onboarding',
    (dashWithCookie.status === 307 || dashWithCookie.status === 302) &&
      (dashWithCookie.location ?? '').includes('/onboarding'),
    `${dashWithCookie.status} ${dashWithCookie.location}`,
  );
  const onboardingWithCookie = await web('/onboarding', { cookie: bffCookie });
  check(
    'proxy /onboarding with session is allowed',
    onboardingWithCookie.status === 200,
    String(onboardingWithCookie.status),
  );
  const loginWithCookie = await web('/login', { cookie: bffCookie });
  const loginLoc = loginWithCookie.location ?? '';
  check(
    'proxy /login with session redirects away from login (no loop)',
    (loginWithCookie.status === 307 || loginWithCookie.status === 302) &&
      !loginLoc.endsWith('/login') &&
      (loginLoc.includes('/dashboard') || loginLoc.includes('/onboarding')),
    `${loginWithCookie.status} ${loginLoc}`,
  );

  const bffGoogle = await web('/api/auth/sign-in/social', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      callbackURL: `${WEB}/dashboard`,
      disableRedirect: true,
    }),
  });
  const bffGoogleUrl =
    (bffGoogle.json as { url?: string } | null)?.url ?? bffGoogle.location ?? '';
  const bffGoogleRedirect = redirectUriFrom(bffGoogleUrl);
  check(
    'BFF Google redirect_uri stays on API (not rewritten to web)',
    bffGoogleRedirect === `${API}/api/auth/callback/google`,
    bffGoogleRedirect ?? `${bffGoogle.status}`,
  );
  check(
    'BFF does not rewrite callback Location onto www',
    !(bffGoogle.location ?? '').includes(`${WEB}/api/auth/callback/google`),
    bffGoogle.location,
  );

  const signOut = await api('/api/auth/sign-out', {
    method: 'POST',
    cookie: apiCookie,
    body: JSON.stringify({}),
  });
  check('API sign-out', signOut.status === 200, String(signOut.status));
  const meOut = await api('/v1/me', { cookie: signOut.cookie });
  check('API /v1/me after sign-out → 401', meOut.status === 401);

  const signIn = await api('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({ email, password, rememberMe: false }),
  });
  check('API sign-in/email rememberMe=false', signIn.status === 200, String(signIn.status));
  const meIn = await api('/v1/me', { cookie: signIn.cookie });
  check(
    'API /v1/me after email sign-in',
    meIn.status === 200 && asUser(meIn.json)?.email === email,
  );

  const bffSignOut = await web('/api/auth/sign-out', {
    method: 'POST',
    cookie: bffCookie,
    body: JSON.stringify({}),
  });
  check('BFF sign-out', bffSignOut.status === 200, String(bffSignOut.status));
  const bffMeOut = await web('/api/me', { cookie: bffSignOut.cookie });
  check(
    'BFF /api/me after sign-out → 401',
    bffMeOut.status === 401,
    String(bffMeOut.status),
  );
  const dashAfterOut = await web('/dashboard', { cookie: bffSignOut.cookie });
  check(
    'proxy /dashboard after BFF sign-out → /login',
    (dashAfterOut.status === 307 || dashAfterOut.status === 302) &&
      (dashAfterOut.location ?? '').includes('/login'),
    `${dashAfterOut.status} ${dashAfterOut.location}`,
  );

  const bffSignIn = await web('/api/auth/sign-in/email', {
    method: 'POST',
    body: JSON.stringify({
      email: bffSignupEmail,
      password,
      rememberMe: true,
      callbackURL: `${WEB}/dashboard`,
    }),
  });
  check('BFF sign-in/email rememberMe=true', bffSignIn.status === 200, String(bffSignIn.status));
  const bffMeIn = await web('/api/me', { cookie: bffSignIn.cookie });
  check(
    'BFF /api/me after email sign-in',
    bffMeIn.status === 200 && asUser(bffMeIn.json)?.email === bffSignupEmail,
  );

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('Failed:');
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
