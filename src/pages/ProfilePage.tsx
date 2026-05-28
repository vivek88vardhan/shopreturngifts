import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Gift, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateProfile, useUpdateAddress, useChangePassword, useMyRewards } from '@/hooks/useApi';
import { toast } from '@/lib/inboxToast';
import { AddressAutocomplete, US_STATES, toStateCode, type ParsedAddress } from '@/components/store/AddressAutocomplete';
import { formatPrice, formatDateTime } from '@/lib/formatters';

const REWARD_HISTORY_PAGE = 10;

function ledgerTypeLabel(t: string): string {
  if (t === 'earn') return 'Earned';
  if (t === 'redeem') return 'Redeemed';
  if (t === 'reverse') return 'Adjustment';
  return t;
}

export default function ProfilePage() {
  const { user, isAuthenticated, updateProfile: updateLocal } = useAuthStore();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
  });

  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const [rewardHistPage, setRewardHistPage] = useState(1);

  const updateProfileMutation = useUpdateProfile();
  const updateAddressMutation = useUpdateAddress();
  const changePasswordMutation = useChangePassword();

  const rewardsQuery = useMyRewards();

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      line1: user.address?.line1 || '',
      line2: user.address?.line2 || '',
      city: user.address?.city || '',
      state: toStateCode(user.address?.state || ''),
      zip: user.address?.zip || '',
      country: user.address?.country || 'US',
    });
  }, [user?.userId, user?.updatedAt, user?.name, user?.email, user?.phone, user?.address]);

  const rewardHistory = rewardsQuery.data?.history ?? [];
  const rewardHistTotalPages = Math.max(1, Math.ceil(rewardHistory.length / REWARD_HISTORY_PAGE));
  const rewardHistSlice = useMemo(() => {
    const start = (rewardHistPage - 1) * REWARD_HISTORY_PAGE;
    return rewardHistory.slice(start, start + REWARD_HISTORY_PAGE);
  }, [rewardHistory, rewardHistPage]);

  useEffect(() => {
    if (rewardHistPage > rewardHistTotalPages) setRewardHistPage(rewardHistTotalPages);
  }, [rewardHistPage, rewardHistTotalPages]);

  useEffect(() => {
    setRewardHistPage(1);
  }, [rewardHistory.length]);

  const handleSave = async () => {
    try {
      await updateProfileMutation.mutateAsync({ name: form.name, phone: form.phone });
      await updateAddressMutation.mutateAsync({
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        zip: form.zip,
        country: form.country,
      });
      updateLocal({
        name: form.name,
        phone: form.phone,
        address: { line1: form.line1, line2: form.line2, city: form.city, state: form.state, zip: form.zip, country: form.country },
      });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile. Check your address (state must be a 2-letter US code).');
    }
  };

  const handleChangePassword = async () => {
    if (pwdNew.length < 8) {
      setFieldErrors(prev => ({ ...prev, pwdNew: true }));
      toast.error('New password must be at least 8 characters');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setFieldErrors(prev => ({ ...prev, pwdConfirm: true }));
      toast.error('New passwords do not match');
      return;
    }
    try {
      await changePasswordMutation.mutateAsync({ currentPassword: pwdCurrent, newPassword: pwdNew });
      setPwdCurrent('');
      setPwdNew('');
      setPwdConfirm('');
      toast.success('Password updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="sf-container flex flex-col items-center py-20">
        <p className="text-muted-foreground">Please sign in</p>
        <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent-hover"><Link to="/login">Sign In</Link></Button>
      </div>
    );
  }

  return (
    <div className="sf-container max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-foreground">My Profile</h1>

      <div className="mt-8 space-y-6">
        <div className="rounded-lg border p-6">
          <h2 className="text-sm font-semibold">Personal Information</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Full Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>Email</Label>
              <Input value={form.email} readOnly disabled className="mt-1 bg-muted" />
              <p className="mt-1 text-xs text-muted-foreground">Email is tied to your sign-in and cannot be changed here.</p>
            </div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
          </div>
        </div>

        <div className="rounded-lg border p-6">
          <div className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-accent shrink-0" aria-hidden />
            <h2 className="text-sm font-semibold">Rewards</h2>
          </div>
          {rewardsQuery.isLoading && (
            <div className="mt-6 flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading rewards" />
            </div>
          )}
          {rewardsQuery.isError && (
            <p className="mt-4 text-sm text-muted-foreground">Rewards could not be loaded. Please try again later.</p>
          )}
          {rewardsQuery.data && !rewardsQuery.data.config.enabled && (
            <p className="mt-4 text-sm text-muted-foreground">The rewards program is not active for this store.</p>
          )}
          {rewardsQuery.data?.config.enabled && rewardsQuery.data.summary && (() => {
            const { summary, config } = rewardsQuery.data;
            const spendDollars = (config.spendThresholdCents || 0) / 100;
            const pts = config.pointsPerThreshold || 0;
            const ptValCents = config.pointValueCents || 0;
            const eligDays = config.eligibilityDays > 0 ? config.eligibilityDays : 15;
            const availValue = ((summary.availablePoints ?? 0) * ptValCents) / 100;
            const pendingValue = ((summary.pendingPoints ?? 0) * ptValCents) / 100;
            return (
              <>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Earn <span className="font-medium text-foreground">{pts}</span>{' '}
                  point{pts !== 1 ? 's' : ''} for every {formatPrice(spendDollars)} spent (on eligible orders once delivered).
                  Each point is worth {formatPrice(ptValCents / 100)} at checkout.
                  New points become available <span className="font-medium text-foreground">{eligDays}</span>{' '}
                  day{eligDays !== 1 ? 's' : ''} after delivery.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">Available for checkout</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{(summary.availablePoints ?? 0).toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">≈ {formatPrice(availValue)} value now</p>
                  </div>
                  <div className="rounded-md border bg-card p-4">
                    <p className="text-xs font-medium text-muted-foreground">Pending</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{(summary.pendingPoints ?? 0).toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">≈ {formatPrice(pendingValue)} after eligibility</p>
                  </div>
                </div>
                {(summary.redeemedPoints ?? 0) > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Lifetime redeemed: {(summary.redeemedPoints ?? 0).toLocaleString()} points
                  </p>
                )}
                {rewardHistory.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent activity</h3>
                    <div className="mt-2 overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[520px] text-sm">
                        <thead className="border-b bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">When</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Points</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Order</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {rewardHistSlice.map((e) => (
                            <tr key={`${e.createdAt}-${e.entryId}`}>
                              <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                              <td className="px-3 py-2">{ledgerTypeLabel(e.type)}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums">
                                {e.type === 'redeem' ? '−' : e.type === 'earn' ? '+' : ''}{e.points.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 capitalize text-muted-foreground">{e.status}</td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{e.orderId ? e.orderId.slice(0, 8) + '…' : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          Showing {(rewardHistPage - 1) * REWARD_HISTORY_PAGE + 1}–
                          {Math.min(rewardHistPage * REWARD_HISTORY_PAGE, rewardHistory.length)} of {rewardHistory.length}
                          {rewardHistTotalPages > 1 ? ` · Page ${rewardHistPage} of ${rewardHistTotalPages}` : ''}
                        </p>
                        {rewardHistTotalPages > 1 && (
                          <div className="flex items-center gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={rewardHistPage <= 1} onClick={() => setRewardHistPage(p => p - 1)}>
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="outline" size="sm" disabled={rewardHistPage >= rewardHistTotalPages} onClick={() => setRewardHistPage(p => p + 1)}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="text-sm font-semibold">Default Shipping Address</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Address Line 1</Label>
              <AddressAutocomplete
                value={form.line1}
                onChange={val => setForm({ ...form, line1: val })}
                onSelect={(parsed: ParsedAddress) => setForm(prev => ({
                  ...prev,
                  line1: parsed.line1,
                  city: parsed.city,
                  state: toStateCode(parsed.state),
                  zip: parsed.zip,
                  country: parsed.country,
                }))}
                className="mt-1"
              />
            </div>
            <div className="sm:col-span-2"><Label>Address Line 2</Label><Input value={form.line2} onChange={e => setForm({ ...form, line2: e.target.value })} className="mt-1" /></div>
            <div><Label>City</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="mt-1" /></div>
            <div>
              <Label>State</Label>
              <select
                value={US_STATES.some(s => s.code === form.state) ? form.state : ''}
                onChange={e => setForm({ ...form, state: e.target.value })}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select state</option>
                {US_STATES.map(s => (
                  <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                ))}
              </select>
            </div>
            <div><Label>ZIP Code</Label><Input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} className="mt-1" /></div>
            <div><Label>Country</Label><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="mt-1" /></div>
          </div>
        </div>

        <div className="rounded-lg border p-6">
          <h2 className="text-sm font-semibold">Change Password</h2>
          <p className="mt-1 text-xs text-muted-foreground">For accounts that sign in with email and password. Social sign-in only accounts cannot use this form.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Current password</Label>
              <Input type="password" autoComplete="current-password" value={pwdCurrent} onChange={e => setPwdCurrent(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>New password</Label>
              <Input type="password" autoComplete="new-password" value={pwdNew} onChange={e => { setPwdNew(e.target.value); setFieldErrors(prev => ({ ...prev, pwdNew: false })); }} className={`mt-1 ${fieldErrors.pwdNew ? 'border-destructive ring-1 ring-destructive' : ''}`} minLength={8} />
            </div>
            <div>
              <Label>Confirm new password</Label>
              <Input type="password" autoComplete="new-password" value={pwdConfirm} onChange={e => { setPwdConfirm(e.target.value); setFieldErrors(prev => ({ ...prev, pwdConfirm: false })); }} className={`mt-1 ${fieldErrors.pwdConfirm ? 'border-destructive ring-1 ring-destructive' : ''}`} />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleChangePassword}
                disabled={changePasswordMutation.isPending || !pwdCurrent || !pwdNew}
              >
                {changePasswordMutation.isPending ? 'Updating…' : 'Update password'}
              </Button>
            </div>
          </div>
        </div>

        <Button
          className="bg-accent text-accent-foreground hover:bg-accent-hover"
          onClick={handleSave}
          disabled={updateProfileMutation.isPending || updateAddressMutation.isPending}
        >
          {(updateProfileMutation.isPending || updateAddressMutation.isPending) ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
