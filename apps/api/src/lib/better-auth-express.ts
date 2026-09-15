import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

type AuthLike = {
  handler: (request: Request) => Promise<Response> | Response;
};

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
]);

function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  return raw.split(',')[0]?.trim() || undefined;
}

export function authRequestUrl(req: ExpressRequest): string {
  const proto =
    firstHeaderValue(req.headers['x-forwarded-proto']) ??
    (req.secure ? 'https' : 'http');
  const host = firstHeaderValue(req.headers.host) ?? 'localhost';
  return `${proto}://${host}${req.originalUrl}`;
}

export function toWebRequestHeaders(req: ExpressRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

async function readBody(req: ExpressRequest): Promise<Uint8Array | undefined> {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return undefined;
  if (req.readable && !req.readableEnded && !req.destroyed) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const body = Buffer.concat(chunks);
    return body.length > 0 ? new Uint8Array(body) : undefined;
  }
  if (typeof req.body === 'string')
    return new Uint8Array(Buffer.from(req.body));
  if (Buffer.isBuffer(req.body)) return new Uint8Array(req.body);
  if (req.body != null) {
    return new Uint8Array(Buffer.from(JSON.stringify(req.body)));
  }
  return undefined;
}

async function writeAuthResponse(
  res: ExpressResponse,
  response: Response,
): Promise<void> {
  if (res.headersSent) return;
  res.status(response.status);
  const cookies =
    typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });
  if (cookies.length > 0) {
    res.setHeader('set-cookie', cookies);
  }
  res.end(Buffer.from(await response.arrayBuffer()));
}

export function betterAuthExpressHandler(auth: AuthLike) {
  return (req: ExpressRequest, res: ExpressResponse): void => {
    void (async () => {
      try {
        const body = await readBody(req);
        const init: RequestInit & { duplex?: 'half' } = {
          method: req.method,
          headers: toWebRequestHeaders(req),
        };
        if (body) {
          init.body = body;
          init.duplex = 'half';
        }
        const response = await auth.handler(
          new Request(authRequestUrl(req), init),
        );
        await writeAuthResponse(res, response);
      } catch (err) {
        console.error('[api] auth handler failed', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Auth handler failed' });
        }
      }
    })();
  };
}
