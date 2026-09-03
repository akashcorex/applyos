import { validationErrorBody } from './errors';

import type { NextFunction, Request, Response } from 'express';
import type * as z from 'zod';

/**
 * Express validation middleware (apps/api). Attaches parsed data to the
 * request and short-circuits with a stable 400 body on failure.
 *
 * Usage:
 * ```ts
 * resumesRouter.post('/', validateBody(compiledResumeCreateSchema), async (req, res) => {
 *   const body = req.validatedBody; // typed as z.output<typeof schema>
 * });
 * ```
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      validatedBody?: unknown;
      validatedQuery?: unknown;
      validatedParams?: unknown;
    }
  }
}

export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      res.status(400).json(validationErrorBody(result.error));
      return;
    }
    req.validatedBody = result.data as z.output<T>;
    next();
  };
}

export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      res.status(400).json(validationErrorBody(result.error));
      return;
    }
    req.validatedQuery = result.data as z.output<T>;
    next();
  };
}

export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params ?? {});
    if (!result.success) {
      res.status(400).json(validationErrorBody(result.error));
      return;
    }
    req.validatedParams = result.data as z.output<T>;
    next();
  };
}
