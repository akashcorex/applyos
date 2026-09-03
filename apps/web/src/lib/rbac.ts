export type AppRole = 'USER' | 'ADMIN';

export function isAdminRole(role: unknown): boolean {
  return role === 'ADMIN';
}
