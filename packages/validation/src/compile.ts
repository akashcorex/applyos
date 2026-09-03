/**
 * Opt-in global auto-compilation (Zod 4.5).
 *
 * Import ONCE at the top of the server entry point, BEFORE any module that
 * defines schemas:
 *
 * ```ts
 * // apps/api/src/main.ts
 * import '@applyso/validation/compile';
 * ```
 *
 * Every schema constructed after this import is automatically compiled on
 * first use (~3–9x faster parses on objects/arrays/unions, lower memory).
 * The test suite runs with and without this import to guarantee fidelity.
 *
 * Bun/Node preload alternative (no code change):
 * `node --import zod/compile dist/main.js`
 */
import 'zod/compile';

export {};
