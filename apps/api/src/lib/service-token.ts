import { timingSafeEqual } from 'node:crypto';

import type { Request, Response, NextFunction } from 'express';

/** Timing-safe compare of `X-Agent-Service-Token` against `AGENT_SERVICE_TOKEN`. */
export function serviceRequestAllowed(token: string | undefined): boolean {
  const expected = process.env.AGENT_SERVICE_TOKEN;
  if (!expected || !token) return false;
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
}

/** Express middleware: requires a valid agent service token. */
export function requireServiceToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }
  next();
}
