import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, ChevronLeft, ChevronRight, Gift, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatDateTime, formatPrice } from '@/lib/formatters';
import { useAdminRewards, useAdminUserRewards } from '@/hooks/useApi';
import type { AdminRewardListItem, RewardLedgerEntry, RewardSummary } from '@/types';

const LIST_PAGE_SIZE = 20;
const HISTORY_PAGE_SIZE = 10;

function ledgerTypeLabel(t: string): string {
  if (t === 'earn') return 'Earned';
  if (t === 'redeem') return 'Redeemed';
  if (t === 'reverse') return 'Adjustment';
  return t || '—';
}

function statusLabel(status: string, eligibleAt?: string): string {
  const s = status || '—';
  if (s === 'pending' && eligibleAt?.trim()) {
    return `Pending until ${formatDateTime(eligibleAt)}`;
  }
  return s;
}

function shortUserId(userId: string): string {
  const id = userId.trim();
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}…`;
}

function customerDisplay(row: AdminRewardListItem): { title: string; subtitle: string } {
  const name = row.userName?.trim();
  const email = row.userEmail?.trim();

  if (row.profileMissing) {
    return {
      title: 'Deleted or missing account',
      subtitle: `Reward balance is stored for user ID ${shortUserId(row.userId)}. The customer profile is no longer in the system.`,
    };
  }
  if (name && email) {
    return { title: name, subtitle: email };
  }
  if (name) {
    return { title: name, subtitle: email || 'No email on file' };
  }
  if (email) {
    return { title: email, subtitle: 'Customer account' };
  }
  return {
    title: 'Customer',
    subtitle: `User ID ${shortUserId(row.userId)}`,
  };
}

function safePoints(entry: RewardLedgerEntry): number {
  const n = entry.points;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

function RewardHistorySheet({
  row,
  open,
  onOpenChange,
}: {
  row: AdminRewardListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [histPage, setHistPage] = useState(1);
  const detailQuery = useAdminUserRewards(open ? row?.userId : undefined);
  const customer = row ? customerDisplay(row) : null;

  useEffect(() => {
    if (open) setHistPage(1);
  }, [open, row?.userId]);

  const history = detailQuery.data?.history ?? [];
  const histTotalPages = Math.max(1, Math.ceil(history.length / HISTORY_PAGE_SIZE));
  const histSlice = history.slice((histPage - 1) * HISTORY_PAGE_SIZE, histPage * HISTORY_PAGE_SIZE);

  useEffect(() => {
    if (histPage > histTotalPages) setHistPage(histTotalPages);
  }, [histPage, histTotalPages]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden sm:max-w-xl md:max-w-2xl">
        <SheetHeader className="shrink-0 text-left">
          <SheetTitle>Reward history</SheetTitle>
          <SheetDescription className="text-left">
            {customer?.title}
            {customer?.subtitle ? ` — ${customer.subtitle}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pt-4">
          {detailQuery.isLoading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading history" />
            </div>
          )}

          {detailQuery.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Could not load reward history. Close and try again, or refresh the page.
            </div>
          )}

          {detailQuery.data && (
            <div className="space-y-4">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Available</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {(detailQuery.data.summary?.availablePoints ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {(detailQuery.data.summary?.pendingPoints ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Redeemed</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {(detailQuery.data.summary?.redeemedPoints ?? 0).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-md border bg-card p-3">
                  <p className="text-xs text-muted-foreground">Lifetime spend</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                    {formatPrice((detailQuery.data.summary?.lifetimeSpendCents ?? 0) / 100)}
                  </p>
                </div>
              </div>

              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No ledger entries yet for this customer.</p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-md border bg-card">
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
                        {histSlice.map((e, idx) => {
                          const pts = safePoints(e);
                          const key = e.entryId || `${e.createdAt}-${idx}`;
                          return (
                            <tr key={key}>
                              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                                {e.createdAt ? formatDateTime(e.createdAt) : '—'}
                              </td>
                              <td className="px-3 py-2 text-foreground">{ledgerTypeLabel(e.type)}</td>
                              <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                                {e.type === 'redeem' ? '−' : e.type === 'earn' ? '+' : ''}
                                {pts.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 capitalize text-muted-foreground">
                                {statusLabel(e.status, e.eligibleAt)}
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                                {e.orderId ? (
                                  <span title={e.orderId}>{e.orderId.slice(0, 12)}…</span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {history.length > HISTORY_PAGE_SIZE && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Entries {(histPage - 1) * HISTORY_PAGE_SIZE + 1}–
                        {Math.min(histPage * HISTORY_PAGE_SIZE, history.length)} of {history.length}
                      </span>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={histPage <= 1} onClick={() => setHistPage(p => p - 1)}>
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="flex items-center px-1">Page {histPage} of {histTotalPages}</span>
                        <Button type="button" variant="outline" size="sm" disabled={histPage >= histTotalPages} onClick={() => setHistPage(p => p + 1)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function AdminRewards() {
  const { data, isLoading, isError, error, refetch, isFetching } = useAdminRewards();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminRewardListItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const items = Array.isArray(data?.items) ? data.items : [];
  const config = data?.config;
  const ptValCents = config?.pointValueCents ?? 0;

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(row => {
      const { title, subtitle } = customerDisplay(row);
      return (
        title.toLowerCase().includes(q) ||
        subtitle.toLowerCase().includes(q) ||
        row.userId.toLowerCase().includes(q)
      );
    });
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openHistory = (row: AdminRewardListItem) => {
    setSelected(row);
    setSheetOpen(true);
  };

  const closeHistory = () => {
    setSheetOpen(false);
    setSelected(null);
  };

  return (
    <div className="min-h-[40vh]">
      <div className="flex items-start gap-3">
        <Gift className="mt-1 h-6 w-6 text-accent shrink-0" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Rewards</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            All registered users and their loyalty balances — customers and admins, including those with zero points.
          </p>
        </div>
      </div>

      {isError && (
        <div className="mt-6 flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Could not load rewards</p>
            <p className="mt-1 text-destructive/90">
              {error instanceof Error ? error.message : 'The rewards API may be unavailable. Deploy the latest API or try again.'}
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {!isError && config && !config.enabled && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          The rewards program is turned off in{' '}
          <Link to="/admin/config" className="font-medium underline hover:no-underline">
            Settings
          </Link>
          . Customers will not earn new points until it is enabled.
        </p>
      )}

      {!isError && config?.enabled && (
        <p className="mt-4 text-xs text-muted-foreground">
          {config.pointsPerThreshold} point{config.pointsPerThreshold !== 1 ? 's' : ''} per{' '}
          {formatPrice((config.spendThresholdCents || 0) / 100)} spent · each point worth{' '}
          {formatPrice(ptValCents / 100)} · {config.eligibilityDays} day eligibility after delivery
        </p>
      )}

      {isLoading && !data ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading rewards" />
        </div>
      ) : !isError ? (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <p className="text-sm text-muted-foreground">
              {filtered.length} registered user{filtered.length !== 1 ? 's' : ''}
              {search.trim() ? ` matching “${search.trim()}”` : ''}
              {isFetching ? ' · Updating…' : ''}
            </p>
            <div className="relative ml-auto w-full max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, email..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
          </div>

          <div className="mt-6 rounded-lg border bg-card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-background-subtle">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Available</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Pending</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Redeemed</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Lifetime earned</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      {search.trim() ? 'No customers match your search.' : 'No registered customers yet.'}
                    </td>
                  </tr>
                ) : (
                  paginated.map(row => {
                    const s: RewardSummary = row.summary ?? {
                      lifetimeSpendCents: 0,
                      lifetimePointsEarned: 0,
                      pendingPoints: 0,
                      availablePoints: 0,
                      redeemedPoints: 0,
                      reversedPoints: 0,
                    };
                    const avail = s.availablePoints ?? 0;
                    const pending = s.pendingPoints ?? 0;
                    const redeemed = s.redeemedPoints ?? 0;
                    const earned = s.lifetimePointsEarned ?? 0;
                    const customer = customerDisplay(row);
                    return (
                      <tr key={row.userId} className="hover:bg-background-subtle/50">
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-foreground">{customer.title}</p>
                            {row.userRole?.toLowerCase() === 'admin' && (
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                                Admin
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground max-w-xs">{customer.subtitle}</p>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">
                          {avail.toLocaleString()}
                          {ptValCents > 0 && (
                            <span className="block text-xs font-sans text-muted-foreground">
                              ≈ {formatPrice((avail * ptValCents) / 100)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {pending.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {redeemed.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {earned.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button type="button" variant="outline" size="sm" onClick={() => openHistory(row)}>
                            View history
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {filtered.length === 0
                ? 'No rows to show'
                : `Showing ${(page - 1) * LIST_PAGE_SIZE + 1}–${Math.min(page * LIST_PAGE_SIZE, filtered.length)} of ${filtered.length}`}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <span className="text-sm font-medium text-foreground">
                Page {page} of {totalPages}
              </span>
              <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      ) : null}

      <RewardHistorySheet
        row={selected}
        open={sheetOpen && !!selected}
        onOpenChange={open => {
          if (!open) closeHistory();
        }}
      />
    </div>
  );
}
