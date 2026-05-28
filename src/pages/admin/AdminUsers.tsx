import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/formatters';
import { Switch } from '@/components/ui/switch';
import { Search, Loader2, Plus, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/lib/inboxToast';
import { useAdminUsers, useUpdateUser, useCreateUser } from '@/hooks/useApi';
import { adminApi } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { US_STATES } from '@/components/store/AddressAutocomplete';
import type { User, UserType } from '@/types';

type UserEdit = Partial<User> & { password?: string };

const PAGE_SIZE_OPTIONS = [10, 20, 25, 30] as const;

function emailVerificationLabel(user: User): { label: string; title: string } {
  if (user.authProvider === 'google') {
    return {
      label: 'Google sign-in',
      title:
        'Signed in with Google (Gmail) via Cognito. Email is verified by Google; password signup codes and forgot-password do not apply.',
    };
  }
  if (user.emailVerified === undefined) {
    return {
      label: 'No Cognito account',
      title: 'No user in Cognito for this email (e.g. data-only profile). Cognito signup/reset emails are not sent.',
    };
  }
  if (user.emailVerified) {
    return {
      label: 'Verified',
      title: `Cognito: ${user.cognitoStatus ?? 'CONFIRMED'}, email_verified=true. Can sign in and receive password-reset emails.`,
    };
  }
  if (user.cognitoStatus === 'UNCONFIRMED') {
    return {
      label: 'Awaiting signup code',
      title:
        'Cognito status UNCONFIRMED: signup verification emails are sent from Cognito on register/resend. ' +
        'User should use Sign up → verify, or Sign in → “Need to verify your email?”',
    };
  }
  if (user.cognitoStatus === 'CONFIRMED' && !user.cognitoEmailVerified) {
    return {
      label: 'Confirmed — email flag off',
      title:
        'Cognito CONFIRMED but email_verified=false. Resend signup code will not work. ' +
        'Click “Repair Cognito account” on this user, then they can use Forgot password or sign in.',
    };
  }
  if (user.cognitoStatus === 'FORCE_CHANGE_PASSWORD') {
    return {
      label: 'Must set new password',
      title:
        'Cognito status FORCE_CHANGE_PASSWORD. Signup verification/resend code emails are not sent for this state. ' +
        'Use “Repair Cognito account”, then Forgot password or set a password in AWS Cognito.',
    };
  }
  if (user.cognitoStatus === 'RESET_REQUIRED') {
    return {
      label: 'Password reset required',
      title:
        'Cognito status RESET_REQUIRED. Signup verification emails do not apply. ' +
        'Use “Repair Cognito account”, then Forgot password.',
    };
  }
  const status = user.cognitoStatus ?? 'unknown';
  return {
    label: `Not verified (${status})`,
    title:
      `Cognito status: ${status}, email_verified=${String(user.cognitoEmailVerified ?? false)}. ` +
      'Resend signup code and verify-email only work for UNCONFIRMED accounts. Use “Repair Cognito account” for this user.',
  };
}

function canRepairCognitoAuth(user: User): boolean {
  if (user.authProvider === 'google') return false;
  return user.emailVerified === false && !!user.cognitoStatus;
}

function EmailVerificationBadge({ user }: { user: User }) {
  const { label, title } = emailVerificationLabel(user);
  if (user.authProvider === 'google') {
    return (
      <span
        className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
        title={title}
      >
        {label}
      </span>
    );
  }
  if (user.emailVerified) {
    return (
      <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300" title={title}>
        {label}
      </span>
    );
  }
  if (user.emailVerified === undefined) {
    return (
      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground" title={title}>
        {label}
      </span>
    );
  }
  return (
    <span
      className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
      title={title}
    >
      {label}
    </span>
  );
}

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: usersData, isLoading } = useAdminUsers();
  const updateUser = useUpdateUser();
  const createUser = useCreateUser();
  const [fixingCognito, setFixingCognito] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<UserType | 'All'>('All');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [editing, setEditing] = useState<UserEdit | null>(null);
  const [isNew, setIsNew] = useState(false);

  const users = usersData?.items || [];

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'All' || (u.userType || 'B2C') === typeFilter;
    return matchSearch && matchType;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, filtered.length);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleActive = async (userId: string, currentActive: boolean) => {
    try {
      await updateUser.mutateAsync({ userId, data: { isActive: !currentActive } });
      toast.success('User status updated');
    } catch {
      toast.error('Failed to update user');
    }
  };

  const toggleAdmin = async (userId: string, currentRole: string) => {
    try {
      await updateUser.mutateAsync({
        userId,
        data: { role: currentRole === 'admin' ? 'customer' : 'admin' } as Partial<User>,
      });
      toast.success('User role updated');
    } catch {
      toast.error('Failed to update user role');
    }
  };

  const handleSave = async () => {
    if (!editing) return;
    try {
      if (isNew) {
        await createUser.mutateAsync(editing);
        toast.success('User created');
      } else if (editing.userId) {
        await updateUser.mutateAsync({ userId: editing.userId, data: editing });
        toast.success('User updated');
      }
      setEditing(null);
    } catch (e) {
      const msg = e instanceof Error && e.message.trim() ? e.message : 'Failed to save user';
      toast.error(msg);
    }
  };

  const openCreate = () => {
    setEditing({
      name: '',
      email: '',
      phone: '',
      userType: 'B2B',
      role: 'customer',
      isActive: true,
      address: { line1: '', city: '', state: '', zip: '', country: 'US' },
    });
    setIsNew(true);
  };

  const openEdit = (u: User) => {
    setEditing({ ...u });
    setIsNew(false);
  };

  const handleFixCognitoEmail = async () => {
    if (!editing?.userId) return;
    setFixingCognito(true);
    try {
      const res = await adminApi.fixCognitoEmail(editing.userId);
      toast.success(res.message);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      const refreshed = await adminApi.getUser(editing.userId);
      setEditing({ ...editing, ...refreshed });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fix Cognito email');
    } finally {
      setFixingCognito(false);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {users.length} registered users
            {users.some(u => u.cognitoStatus === 'UNCONFIRMED') && (
              <span className="text-amber-700 dark:text-amber-300">
                {' '}
                · {users.filter(u => u.cognitoStatus === 'UNCONFIRMED').length} awaiting signup verification (Cognito emails)
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xl">
            Hover a badge for details. Signup verification emails are sent by <strong className="font-medium text-foreground">AWS Cognito</strong> (not
            order/contact SES) and only for <strong className="font-medium text-foreground">Awaiting signup code</strong> users. Other statuses need{' '}
            <strong className="font-medium text-foreground">Repair Cognito account</strong> in the user editor, then Forgot password.
          </p>
        </div>
        <Button className="w-full shrink-0 bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Create B2B User
        </Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex gap-1.5">
          {(['All', 'B2C', 'B2B'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTypeFilter(t); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${typeFilter === t ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:ml-auto sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b bg-background-subtle">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email verified</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Registered</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Active</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map(u => (
              <tr key={u.userId} className="hover:bg-background-subtle/50">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <EmailVerificationBadge user={u} />
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${(u.userType || 'B2C') === 'B2B' ? 'bg-primary/10 text-primary' : 'bg-secondary text-muted-foreground'}`}>
                    {u.userType || 'B2C'}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.phone || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleAdmin(u.userId, u.role)} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${u.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-secondary text-muted-foreground'}`}>
                    {u.role}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Switch checked={u.isActive} onCheckedChange={() => toggleActive(u.userId, u.isActive)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => openEdit(u)} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No users found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {filtered.length === 0
            ? 'No users to show'
            : `Showing ${rangeStart}–${rangeEnd} of ${filtered.length}${typeFilter !== 'All' || search.trim() ? ` (${users.length} total)` : ''}`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="users-page-size" className="text-sm text-muted-foreground whitespace-nowrap">
              Rows per page
            </Label>
            <Select
              value={String(pageSize)}
              onValueChange={v => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger id="users-page-size" className="h-9 w-[72px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm font-medium text-foreground">
              Page {page} of {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isNew ? 'Create B2B User' : 'Edit User'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Name</Label><Input value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} className="mt-1" /></div>
                <div><Label>Email</Label><Input type="email" value={editing.email || ''} onChange={e => setEditing({ ...editing, email: e.target.value })} className="mt-1" disabled={!isNew} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Phone</Label><Input value={editing.phone || ''} onChange={e => setEditing({ ...editing, phone: e.target.value })} className="mt-1" /></div>
                <div>
                  <Label>User Type</Label>
                  <select
                    value={editing.userType || 'B2B'}
                    onChange={e => setEditing({ ...editing, userType: e.target.value as UserType })}
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  >
                    <option value="B2B">B2B</option>
                    <option value="B2C">B2C</option>
                  </select>
                </div>
              </div>
              {isNew && (
                <div>
                  <Label>Password</Label>
                  <Input
                    type="password"
                    minLength={8}
                    autoComplete="new-password"
                    onChange={e => setEditing({ ...editing, password: e.target.value })}
                    className="mt-1"
                    placeholder="At least 8 characters"
                  />
                </div>
              )}
              <div className="space-y-3 rounded-md border p-4">
                <p className="text-sm font-medium">Address</p>
                <div><Label>Address Line 1</Label><Input value={editing.address?.line1 || ''} onChange={e => setEditing({ ...editing, address: { ...editing.address!, line1: e.target.value } })} className="mt-1" /></div>
                <div><Label>Address Line 2</Label><Input value={editing.address?.line2 || ''} onChange={e => setEditing({ ...editing, address: { ...editing.address!, line2: e.target.value } })} className="mt-1" /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>City</Label><Input value={editing.address?.city || ''} onChange={e => setEditing({ ...editing, address: { ...editing.address!, city: e.target.value } })} className="mt-1" /></div>
                  <div>
                    <Label>State</Label>
                    <select
                      value={US_STATES.some(s => s.code === (editing.address?.state || '')) ? (editing.address?.state || '') : ''}
                      onChange={e => setEditing({ ...editing, address: { ...editing.address!, state: e.target.value } })}
                      className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">Select state</option>
                      {US_STATES.map(s => (
                        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div><Label>Zip</Label><Input value={editing.address?.zip || ''} onChange={e => setEditing({ ...editing, address: { ...editing.address!, zip: e.target.value } })} className="mt-1" /></div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={editing.isActive ?? true} onCheckedChange={v => setEditing({ ...editing, isActive: v })} />
                <Label>Active</Label>
                <span className="text-xs text-muted-foreground">(store profile — separate from email verification)</span>
              </div>
              {!isNew && editing.emailVerified !== undefined && (
                <div className="space-y-2 rounded-md border bg-background-subtle px-3 py-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Cognito email: </span>
                    <EmailVerificationBadge user={editing as User} />
                    {editing.cognitoStatus && (
                      <span className="ml-2 text-xs text-muted-foreground">({editing.cognitoStatus})</span>
                    )}
                  </div>
                  {canRepairCognitoAuth(editing as User) && (
                    <div className="space-y-2 border-t pt-2">
                      <p className="text-xs text-muted-foreground">
                        Resend signup code / verify email on the login page will not help for Cognito status{' '}
                        <code className="text-foreground">{editing.cognitoStatus}</code>. Repair confirms UNCONFIRMED
                        signups without a code and marks <code className="text-foreground">email_verified=true</code> so
                        the user can sign in or use <strong className="font-medium text-foreground">Forgot password</strong>.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={fixingCognito}
                        onClick={() => void handleFixCognitoEmail()}
                      >
                        {fixingCognito ? 'Repairing…' : 'Repair Cognito account'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button className="bg-accent text-accent-foreground hover:bg-accent-hover" onClick={handleSave} disabled={createUser.isPending || updateUser.isPending}>
                  {(createUser.isPending || updateUser.isPending) ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
