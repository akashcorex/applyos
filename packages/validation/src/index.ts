/**
 * `@applyso/validation` — centralized Zod 4.5 validation for the entire repo.
 *
 * - Frontend (`apps/web`): import schemas for forms, Server Actions
 *   (`validateAction`), and Route Handlers (`parseJsonBody`).
 * - Backend (`apps/api`): import schemas + `validateBody`/`validateQuery`/
 *   `validateParams` Express middleware.
 * - Python agents: consume `contractJsonSchema()` snapshots (see
 *   `json-schema.ts`) — the TS boundary mirrors the Pydantic models.
 *
 * Performance: hot schemas ship pre-compiled (`z.compile`, ~3–9x faster).
 * For boolean guards on high-volume paths use `isValid` (`z.validate`,
 * up to 16x faster on invalid data). Import
 * `@applyso/validation/compile` at the server entry point to auto-compile
 * everything else.
 */
import * as z from 'zod';

export { z };
export * from './primitives';
export * from './enums';
export * from './auth';
export * from './profile';
export * from './profile-summary';
export * from './progression';
export * from './resume';
export * from './preferences';
export * from './applications';
export * from './workflows';
export * from './outreach';
export * from './linkedin';
export * from './jobs';
export * from './score';
export * from './billing';
export * from './http';
export * from './errors';
export * from './evals';
export * from './parse';
export * from './express';
export * from './next';
export * from './json-schema';
