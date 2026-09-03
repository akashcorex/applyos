'use client';

import { useCallback, useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  FileText,
  Loader2,
  Shield,
  Users,
} from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@applyso/ui/tabs';

import {
  type AccountStatus,
  type AdminResume,
  type AdminRole,
  type AdminUser,
  type ResumeStatus,
  fetchAdminResumes,
  fetchAdminUsers,
  fetchMe,
  patchAdminUser,
} from '@/lib/admin-api';
import { isAdminRole } from '@/lib/rbac';

function roleBadge(role: string) {
  return role === 'ADMIN' ? (
    <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50">
      ADMIN
    </Badge>
  ) : (
    <Badge variant="secondary">USER</Badge>
  );
}

function statusBadge(status: string) {
  if (status === 'ACTIVE') {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50">
        ACTIVE
      </Badge>
    );
  }
  if (status === 'SUSPENDED') {
    return <Badge variant="destructive">SUSPENDED</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function AdminPanel() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [resumes, setResumes] = useState<AdminResume[]>([]);
  const [resumeTotal, setResumeTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [userQuery, setUserQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<AdminRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | ''>('');
  const [resumeStatus, setResumeStatus] = useState<ResumeStatus | ''>('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const me = await fetchMe();
      if (!isAdminRole(me.user.role)) {
        setAllowed(false);
        setReady(true);
        return;
      }
      setAllowed(true);
      const [userPage, adminPage, resumePage] = await Promise.all([
        fetchAdminUsers({
          limit: 50,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
        }),
        fetchAdminUsers({ limit: 1, role: 'ADMIN' }),
        fetchAdminResumes({
          limit: 50,
          status: resumeStatus || undefined,
        }),
      ]);
      setUsers(userPage.users);
      setUserTotal(userPage.total);
      setAdminCount(adminPage.total);
      setResumes(resumePage.resumes);
      setResumeTotal(resumePage.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
      setAllowed(false);
    } finally {
      setReady(true);
    }
  }, [roleFilter, statusFilter, resumeStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeRole(user: AdminUser, role: AdminRole) {
    setBusyId(user.id);
    setError(null);
    try {
      await patchAdminUser(user.id, { role });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(user: AdminUser, status: AccountStatus) {
    setBusyId(user.id);
    setError(null);
    try {
      await patchAdminUser(user.id, { status });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading admin console
      </div>
    );
  }

  if (!allowed) {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader>
          <CardTitle>Admin only</CardTitle>
          <CardDescription>
            Your account does not have the ADMIN role. Ask an existing admin to
            promote you, or set <code>role = ADMIN</code> on your user row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            Back to workspace
          </Button>
        </CardContent>
      </Card>
    );
  }

  const filteredUsers = userQuery.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(userQuery.toLowerCase()) ||
          u.name.toLowerCase().includes(userQuery.toLowerCase()),
      )
    : users;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Admin
        </h1>
        <p className="text-sm text-slate-500 dark:text-[#8a8f9d] mt-1">
          RBAC-gated console. Mutations hit <code>/v1/admin</code> and are
          enforced server-side.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider font-mono text-slate-500">
              Users
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex items-end justify-between">
            <span className="text-2xl font-semibold">{userTotal}</span>
            <Users className="h-4 w-4 text-slate-400" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider font-mono text-slate-500">
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex items-end justify-between">
            <span className="text-2xl font-semibold">{adminCount}</span>
            <Shield className="h-4 w-4 text-slate-400" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-[11px] uppercase tracking-wider font-mono text-slate-500">
              Resume files
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex items-end justify-between">
            <span className="text-2xl font-semibold">{resumeTotal}</span>
            <FileText className="h-4 w-4 text-slate-400" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="users">
        <TabsList className="bg-slate-100 dark:bg-[#18191c]">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="resumes">Resumes</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Filter by name or email"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="max-w-xs"
            />
            <select
              value={roleFilter}
              onChange={(e) =>
                setRoleFilter(e.target.value as AdminRole | '')
              }
              className="h-8 rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-2 text-xs"
            >
              <option value="">All roles</option>
              <option value="USER">USER</option>
              <option value="ADMIN">ADMIN</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as AccountStatus | '')
              }
              className="h-8 rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-2 text-xs"
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
              <option value="DELETED">DELETED</option>
            </select>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#26282e] text-left text-slate-500">
                    <th className="px-4 py-2.5 font-medium">User</th>
                    <th className="px-4 py-2.5 font-medium">Role</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Last login</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
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
                        <div className="text-slate-500 font-mono">
                          {user.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">{roleBadge(user.role)}</td>
                      <td className="px-4 py-3">{statusBadge(user.status)}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(user.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {user.role === 'USER' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === user.id}
                              onClick={() => void changeRole(user, 'ADMIN')}
                            >
                              Make admin
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === user.id}
                              onClick={() => void changeRole(user, 'USER')}
                            >
                              Demote
                            </Button>
                          )}
                          {user.status === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === user.id}
                              onClick={() =>
                                void changeStatus(user, 'SUSPENDED')
                              }
                            >
                              Suspend
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === user.id}
                              onClick={() => void changeStatus(user, 'ACTIVE')}
                            >
                              Activate
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
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
        </TabsContent>

        <TabsContent value="resumes" className="space-y-3">
          <select
            value={resumeStatus}
            onChange={(e) =>
              setResumeStatus(e.target.value as ResumeStatus | '')
            }
            className="h-8 rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-2 text-xs"
          >
            <option value="">All statuses</option>
            <option value="UPLOADED">UPLOADED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#26282e] text-left text-slate-500">
                    <th className="px-4 py-2.5 font-medium">File</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Owner</th>
                    <th className="px-4 py-2.5 font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {resumes.map((resume) => (
                    <tr
                      key={resume.id}
                      className="border-b border-slate-100 dark:border-[#1c1d21] last:border-0"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/resumes/${resume.id}`}
                          className="font-semibold hover:underline"
                        >
                          {resume.fileName}
                        </Link>
                        <div className="text-slate-500 font-mono">
                          {resume.mimeType} · {Math.round(resume.fileSize / 1024)}{' '}
                          KB
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {statusBadge(resume.status)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/admin/users/${resume.userId}`}
                          className="font-mono text-slate-600 hover:underline"
                        >
                          {resume.userId.slice(0, 10)}…
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(resume.updatedAt)}
                      </td>
                    </tr>
                  ))}
                  {resumes.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-slate-500"
                      >
                        No resume files yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
