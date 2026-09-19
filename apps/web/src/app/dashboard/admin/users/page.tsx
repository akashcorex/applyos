'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import { Card, CardContent } from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';

import {
  type AccountStatus,
  type AdminRole,
  type AdminUser,
  fetchAdminUsers,
  patchAdminUser,
} from '@/lib/admin-api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<AdminRole | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const page = await fetchAdminUsers({
        limit: 50,
        role: role || undefined,
        status: status || undefined,
      });
      setUsers(page.users);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setReady(true);
    }
  }, [role, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(
    user: AdminUser,
    data: { role?: AdminRole; status?: AccountStatus },
  ) {
    setBusyId(user.id);
    setError(null);
    try {
      await patchAdminUser(user.id, data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = query.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(query.toLowerCase()) ||
          u.name.toLowerCase().includes(query.toLowerCase()),
      )
    : users;

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading users
      </div>
    );
  }

  return (
    <div className="max-w-[1240px] mx-auto space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
          Users
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5 font-normal">
          {total} total · promote, demote, suspend, or re-activate accounts.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Filter by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AdminRole | '')}
          className="h-8 rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-2 text-xs"
        >
          <option value="">All roles</option>
          <option value="USER">USER</option>
          <option value="ADMIN">ADMIN</option>
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as AccountStatus | '')}
          className="h-8 rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-2 text-xs"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="SUSPENDED">SUSPENDED</option>
          <option value="DELETED">DELETED</option>
        </select>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-[#26282e] text-left text-slate-500 dark:text-[#8a8f9d]">
                <th className="px-4 py-2.5 font-medium">User</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-slate-100 dark:border-[#1c1d21] last:border-0"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/admin/users/${user.id}`}
                      className="font-semibold text-slate-900 dark:text-[#f1f3f9] hover:underline"
                    >
                      {user.name}
                    </Link>
                    <div className="font-mono text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={user.role === 'ADMIN' ? 'default' : 'secondary'}
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        user.status === 'ACTIVE' ? 'secondary' : 'destructive'
                      }
                    >
                      {user.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === user.id}
                        onClick={() =>
                          void mutate(user, {
                            role: user.role === 'USER' ? 'ADMIN' : 'USER',
                          })
                        }
                      >
                        {user.role === 'USER' ? 'Make admin' : 'Demote'}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === user.id}
                        onClick={() =>
                          void mutate(user, {
                            status:
                              user.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                          })
                        }
                      >
                        {user.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-8 text-center text-slate-500"
                  >
                    No users match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
