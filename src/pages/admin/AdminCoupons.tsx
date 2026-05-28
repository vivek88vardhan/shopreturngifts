import { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Percent, Check, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatCouponDiscount, isFlatCoupon } from '@/lib/couponDiscount';
import type { CouponDiscountType } from '@/lib/couponDiscount';
import {
  useAdminCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  useAdminUsers,
} from '@/hooks/useApi';
import { toast } from '@/lib/inboxToast';
import type { Coupon } from '@/types';

const emptyCoupon = {
  code: '',
  description: '',
  discountType: 'percent' as CouponDiscountType,
  discountPercent: 10,
  discountAmount: 0,
  isActive: true,
  oneTimePerUser: true,
  allowedUserIds: [] as string[],
  expiresAt: '',
};

function toDatetimeLocal(iso: string): string {
  if (!iso?.trim()) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fromDatetimeLocal(local: string): string {
  if (!local?.trim()) return '';
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function isCouponExpired(c: Coupon): boolean {
  if (!c.expiresAt?.trim()) return false;
  const d = new Date(c.expiresAt);
  if (Number.isNaN(d.getTime())) return true;
  return d.getTime() <= Date.now();
}

function formatExpiresShort(iso: string): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const ITEMS_PER_PAGE = 15;

export default function AdminCoupons() {
  const { data, isLoading } = useAdminCoupons();
  const { data: usersData } = useAdminUsers();
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(emptyCoupon);
  const [userSearch, setUserSearch] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [page, setPage] = useState(1);

  const coupons: Coupon[] = data?.items || [];
  const users = usersData?.items || [];

  const filteredCoupons = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return coupons;
    return coupons.filter(
      c =>
        c.code.toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q) ||
        c.couponId.toLowerCase().includes(q)
    );
  }, [coupons, tableSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredCoupons.length / ITEMS_PER_PAGE));
  const paginatedCoupons = filteredCoupons.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users.slice(0, 50);
    return users
      .filter(u => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q))
      .slice(0, 50);
  }, [users, userSearch]);

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyCoupon, allowedUserIds: [] });
    setUserSearch('');
    setDialogOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description,
      discountType: isFlatCoupon(c) ? 'flat' : 'percent',
      discountPercent: c.discountPercent ?? 0,
      discountAmount: c.discountAmount ?? 0,
      isActive: c.isActive,
      oneTimePerUser: c.oneTimePerUser ?? false,
      allowedUserIds: c.allowedUserIds || [],
      expiresAt: c.expiresAt || '',
    });
    setUserSearch('');
    setDialogOpen(true);
  };

  const toggleUser = (userId: string) => {
    const has = form.allowedUserIds.includes(userId);
    setForm({
      ...form,
      allowedUserIds: has
        ? form.allowedUserIds.filter(id => id !== userId)
        : [...form.allowedUserIds, userId],
    });
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('Coupon code is required'); return; }
    if (form.discountType === 'flat') {
      if (form.discountAmount <= 0) { toast.error('Flat discount must be greater than $0'); return; }
    } else if (form.discountPercent <= 0 || form.discountPercent > 100) {
      toast.error('Discount must be 1-100%');
      return;
    }
    const payload = {
      ...form,
      expiresAt: form.expiresAt.trim(),
      discountType: form.discountType,
      discountPercent: form.discountType === 'percent' ? form.discountPercent : 0,
      discountAmount: form.discountType === 'flat' ? form.discountAmount : 0,
    };
    try {
      if (editing) {
        await updateCoupon.mutateAsync({
          couponId: editing.couponId,
          data: payload,
        });
        toast.success('Coupon updated');
      } else {
        await createCoupon.mutateAsync(payload);
        toast.success('Coupon created');
      }
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save coupon');
    }
  };

  const handleDelete = async (couponId: string) => {
    if (!confirm('Delete this coupon?')) return;
    try {
      await deleteCoupon.mutateAsync(couponId);
      toast.success('Coupon deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const handleToggle = async (c: Coupon) => {
    try {
      await updateCoupon.mutateAsync({ couponId: c.couponId, data: { isActive: !c.isActive } });
      toast.success(c.isActive ? 'Coupon disabled' : 'Coupon enabled');
    } catch {
      toast.error('Failed to toggle coupon');
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Coupons</h1>
          <p className="text-sm text-muted-foreground">
            Manage discount coupons. Only one coupon applies per order — the best one is auto-picked.
          </p>
        </div>
        <Button onClick={openNew} className="w-full shrink-0 bg-accent text-accent-foreground hover:bg-accent-hover sm:w-auto">
          <Plus className="mr-2 h-4 w-4" /> Add Coupon
        </Button>
      </div>

      {isLoading ? (
        <div className="mt-8 text-sm text-muted-foreground">Loading...</div>
      ) : coupons.length === 0 ? (
        <div className="mt-12 flex flex-col items-center text-center">
          <Percent className="h-12 w-12 text-muted-foreground/30" />
          <p className="mt-4 text-sm text-muted-foreground">No coupons yet. Create one to offer discounts.</p>
        </div>
      ) : (
        <>
          <div className="mt-6 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by code, description, or coupon ID…"
              value={tableSearch}
              onChange={e => {
                setTableSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-secondary/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Code</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Discount</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Rules</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Expires</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCoupons.map(c => (
                  <tr key={c.couponId} className="border-b last:border-0">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{c.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.description || '—'}</td>
                    <td className="px-4 py-3 text-center font-medium">{formatCouponDiscount(c)}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {c.oneTimePerUser && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">1× per user</span>
                        )}
                        {(c.allowedUserIds?.length || 0) > 0 && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                            {c.allowedUserIds?.length} user{(c.allowedUserIds?.length || 0) > 1 ? 's' : ''}
                          </span>
                        )}
                        {!c.oneTimePerUser && !(c.allowedUserIds?.length) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                      <div>{formatExpiresShort(c.expiresAt || '')}</div>
                      {isCouponExpired(c) && (
                        <span className="mt-1 inline-block rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-medium text-destructive">Expired</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={c.isActive} onCheckedChange={() => handleToggle(c)} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.couponId)} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paginatedCoupons.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No coupons match your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredCoupons.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filteredCoupons.length)} of {filteredCoupons.length}
                {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Coupon' : 'Create Coupon'}</DialogTitle>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div>
              <Label>Coupon Code</Label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" className="mt-1 font-mono" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" className="mt-1" />
            </div>
            <div>
              <Label>Discount type</Label>
              <Select
                value={form.discountType}
                onValueChange={(v: CouponDiscountType) =>
                  setForm({
                    ...form,
                    discountType: v,
                    discountPercent: v === 'percent' ? (form.discountPercent || 10) : 0,
                    discountAmount: v === 'flat' ? (form.discountAmount || 5) : 0,
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage off</SelectItem>
                  <SelectItem value="flat">Flat amount ($)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.discountType === 'flat' ? (
              <div>
                <Label>Flat discount amount ($)</Label>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={form.discountAmount || ''}
                  onChange={e => setForm({ ...form, discountAmount: Number(e.target.value) })}
                  placeholder="e.g. 5.00"
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Applies to merchandise and shipping on one order (up to this amount). Any unused balance is forfeited and cannot be used later.
                </p>
              </div>
            ) : (
              <div>
                <Label>Discount percentage (%)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={form.discountPercent}
                  onChange={e => setForm({ ...form, discountPercent: Number(e.target.value) })}
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>Expires (optional)</Label>
              <Input
                type="datetime-local"
                value={toDatetimeLocal(form.expiresAt)}
                onChange={e => setForm({ ...form, expiresAt: fromDatetimeLocal(e.target.value) })}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Coupon is rejected at checkout after this moment (your local time is converted to UTC). Leave empty for no expiry.
              </p>
              {form.expiresAt ? (
                <Button type="button" variant="ghost" size="sm" className="mt-1 h-8 px-2 text-xs" onClick={() => setForm({ ...form, expiresAt: '' })}>
                  Clear expiry
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
              <Label>Active</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.oneTimePerUser} onCheckedChange={v => setForm({ ...form, oneTimePerUser: v })} />
              <div>
                <Label>One-time use per customer</Label>
                <p className="text-xs text-muted-foreground">Each user can redeem this code only once.</p>
              </div>
            </div>

            <div className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <Label>Restrict to specific users</Label>
                  <p className="text-xs text-muted-foreground">
                    Leave empty to allow everyone. Selected: {form.allowedUserIds.length}
                  </p>
                </div>
                {form.allowedUserIds.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, allowedUserIds: [] })}>
                    Clear
                  </Button>
                )}
              </div>
              <Input
                placeholder="Search users by name or email…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching users</p>
                ) : (
                  filteredUsers.map(u => {
                    const selected = form.allowedUserIds.includes(u.userId);
                    return (
                      <button
                        key={u.userId}
                        type="button"
                        onClick={() => toggleUser(u.userId)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors ${selected ? 'bg-accent/15 text-accent-foreground' : 'hover:bg-secondary'}`}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{u.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">{u.email}</span>
                        </span>
                        {selected && <Check className="ml-2 h-4 w-4 text-accent" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} className="bg-accent text-accent-foreground hover:bg-accent-hover" disabled={createCoupon.isPending || updateCoupon.isPending}>
              {editing ? 'Update' : 'Create'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
