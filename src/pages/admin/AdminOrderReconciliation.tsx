import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Loader2, RefreshCw, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDateTime, formatPrice } from '@/lib/formatters';
import { useAdminOrderReconciliation } from '@/hooks/useApi';
import type { OrderReconciliationRow } from '@/types';

type ReconSortKey = 'orderNumber' | 'createdAt';
type SortDir = 'asc' | 'desc';

function money(cents: number | undefined, currency = 'USD'): string {
  return formatPrice((cents ?? 0) / 100, currency || 'USD');
}

function parseSortTime(value: string | undefined): number {
  const t = Date.parse(value || '');
  return Number.isNaN(t) ? 0 : t;
}

function stripeLink(kind: 'payments' | 'balance', id?: string): string {
  return `https://dashboard.stripe.com/${kind}/${encodeURIComponent(id ?? '')}`;
}

function DifferenceBadge({ cents, currency }: { cents: number; currency: string }) {
  const ok = cents === 0;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ok ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
      {ok ? 'Matched' : money(cents, currency)}
    </span>
  );
}

function rowHasStripeData(row: OrderReconciliationRow): boolean {
  return Boolean(row.stripeChargeId || row.stripePaymentIntentId);
}

function SortableHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className = '',
}: {
  label: string;
  column: ReconSortKey;
  sortKey: ReconSortKey;
  sortDir: SortDir;
  onSort: (column: ReconSortKey) => void;
  className?: string;
}) {
  const active = sortKey === column;
  return (
    <th className={`px-2 py-3 text-left align-top ${className}`}>
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    </th>
  );
}

export default function AdminOrderReconciliation() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [limit, setLimit] = useState(200);
  const [sortKey, setSortKey] = useState<ReconSortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const queryParams = useMemo(
    () => ({
      from: dateFrom || undefined,
      to: dateTo || undefined,
      limit,
    }),
    [dateFrom, dateTo, limit],
  );
  const { data, isLoading, isFetching, error, refetch } = useAdminOrderReconciliation(queryParams);
  const rows = data?.items ?? [];

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'orderNumber':
          cmp = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true, sensitivity: 'base' });
          break;
        case 'createdAt':
          cmp = parseSortTime(a.createdAt) - parseSortTime(b.createdAt);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortDir, sortKey]);

  const handleSort = (column: ReconSortKey) => {
    if (sortKey === column) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column);
      setSortDir('desc');
    }
  };

  const totals = useMemo(() => {
    return sortedRows.reduce(
      (acc, row) => {
        acc.order += row.orderTotalCents;
        acc.tax += row.orderTaxCents;
        acc.stripeCaptured += row.stripeCapturedCents ?? 0;
        acc.stripeFees += row.stripeFeeCents ?? 0;
        acc.stripeNet += row.stripeNetCents ?? 0;
        acc.refunded += row.stripeRefundedCents ?? row.orderRefundedCents;
        acc.discrepancy += row.discrepancyCents ?? 0;
        return acc;
      },
      { order: 0, tax: 0, stripeCaptured: 0, stripeFees: 0, stripeNet: 0, refunded: 0, discrepancy: 0 },
    );
  }, [sortedRows]);

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const summaryCurrency = rows[0]?.currency || 'USD';

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Order Reconciliation</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compare ShopReturnGifts order totals with Stripe charge, fee, and balance transaction amounts.
            This page is read-only and does not change orders or payments.
          </p>
        </div>
        <Button type="button" variant="outline" className="gap-2" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      <div className="mt-6 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="recon-from" className="text-xs">From date</Label>
            <Input id="recon-from" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 w-[10rem]" />
          </div>
          <div>
            <Label htmlFor="recon-to" className="text-xs">To date</Label>
            <Input id="recon-to" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 w-[10rem]" />
          </div>
          <div>
            <Label htmlFor="recon-limit" className="text-xs">Max orders</Label>
            <Input
              id="recon-limit"
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={e => setLimit(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
              className="mt-1 w-[8rem]"
            />
          </div>
          {(dateFrom || dateTo) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
              Clear dates
            </Button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Date filters use order created date. Rows without Stripe IDs are included so pending/cancelled-before-capture orders are visible.
        </p>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />
          {error instanceof Error ? error.message : 'Failed to load reconciliation data'}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard label="Order Total" value={money(totals.order, summaryCurrency)} />
        <SummaryCard label="Tax Collected" value={money(totals.tax, summaryCurrency)} />
        <SummaryCard label="Stripe Captured" value={money(totals.stripeCaptured, summaryCurrency)} />
        <SummaryCard label="Stripe Fees" value={money(totals.stripeFees, summaryCurrency)} />
        <SummaryCard label="Stripe Net Credit" value={money(totals.stripeNet, summaryCurrency)} />
        <SummaryCard label="Difference" value={money(totals.discrepancy, summaryCurrency)} />
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border bg-background-subtle p-4 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
        <p>
          <strong className="text-foreground">Stripe Captured</strong> is the gross amount Stripe successfully charged the customer.
          This should usually match the order total.
        </p>
        <p>
          <strong className="text-foreground">Stripe Fees</strong> are Stripe&apos;s processing fees for that charge.
          Fees are deducted by Stripe before funds reach your balance.
        </p>
        <p>
          <strong className="text-foreground">Stripe Net Credit</strong> is what Stripe credits to your Stripe balance for the charge:
          captured amount minus Stripe fees.
        </p>
        <p>
          <strong className="text-foreground">Refunded</strong> is money returned to the customer. Refunds may appear as separate Stripe
          balance transactions, so this page shows charge-side refund totals.
        </p>
        <p>
          <strong className="text-foreground">Difference</strong> compares ShopReturnGifts order total vs Stripe captured amount.
          Matched means the customer was charged the expected order total.
        </p>
        <p>
          <strong className="text-foreground">Tax Collected</strong> is the tax portion stored on the order. It is included inside the
          order total and Stripe captured amount.
        </p>
      </div>

      <div className="mt-6 space-y-4 md:hidden">
        {sortedRows.map(row => (
          <MobileReconciliationCard key={row.orderId} row={row} />
        ))}
        {sortedRows.length === 0 && (
          <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
            No orders found for this range.
          </div>
        )}
      </div>

      <div className="mt-6 hidden rounded-lg border bg-card md:block">
        <table className="w-full table-fixed text-[11px] leading-snug">
          <thead className="border-b bg-background-subtle">
            <tr>
              <SortableHeader label="Order #" column="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[8%]" />
              <SortableHeader label="Timestamp" column="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-[8%]" />
              <th className="w-[7%] px-2 py-3 text-left align-top font-medium text-muted-foreground">Customer</th>
              <th className="w-[7%] px-2 py-3 text-left align-top font-medium text-muted-foreground">Status</th>
              <th className="w-[6%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Subtotal</th>
              <th className="w-[5%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Tax</th>
              <th className="w-[7%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Order Total</th>
              <th className="w-[7%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Stripe Captured</th>
              <th className="w-[6%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Refunded</th>
              <th className="w-[6%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Stripe Fee</th>
              <th className="w-[6%] px-2 py-3 text-right align-top font-medium text-muted-foreground">Net Credit</th>
              <th className="w-[7%] px-2 py-3 text-left align-top font-medium text-muted-foreground">Difference</th>
              <th className="w-[11%] px-2 py-3 text-left align-top font-medium text-muted-foreground">Stripe IDs</th>
              <th className="w-[9%] px-2 py-3 text-left align-top font-medium text-muted-foreground">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedRows.map(row => (
              <tr key={row.orderId} className={`align-top ${!rowHasStripeData(row) ? 'bg-muted/20' : ''}`}>
                <td className="break-words px-2 py-3">
                  <p className="font-mono text-xs font-semibold">{row.orderNumber}</p>
                </td>
                <td className="break-words px-2 py-3 text-[10px] text-muted-foreground">
                  {formatDateTime(row.createdAt)}
                </td>
                <td className="break-words px-2 py-3">
                  <p className="font-medium">{row.customerName || 'Customer unavailable'}</p>
                </td>
                <td className="break-words px-2 py-3">
                  <p>{row.status}</p>
                  <p className="text-xs text-muted-foreground">{row.paymentStatus || '-'}</p>
                </td>
                <td className="break-words px-2 py-3 text-right">{money(row.orderSubtotalCents, row.currency)}</td>
                <td className="break-words px-2 py-3 text-right">{money(row.orderTaxCents, row.currency)}</td>
                <td className="break-words px-2 py-3 text-right font-medium">{money(row.orderTotalCents, row.currency)}</td>
                <td className="break-words px-2 py-3 text-right">{money(row.stripeCapturedCents, row.currency)}</td>
                <td className="break-words px-2 py-3 text-right">{money(row.stripeRefundedCents ?? row.orderRefundedCents, row.currency)}</td>
                <td className="break-words px-2 py-3 text-right text-amber-700">{money(row.stripeFeeCents, row.currency)}</td>
                <td className="break-words px-2 py-3 text-right text-sf-success">{money(row.stripeNetCents, row.currency)}</td>
                <td className="px-2 py-3"><DifferenceBadge cents={row.discrepancyCents} currency={row.currency} /></td>
                <td className="break-all px-2 py-3 text-[9px] leading-relaxed">
                  {row.stripeChargeId ? (
                    <a
                      className="block font-mono text-accent hover:underline"
                      href={stripeLink('payments', row.stripeChargeId)}
                      title={row.stripeChargeId}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.stripeChargeId}
                    </a>
                  ) : row.stripePaymentIntentId ? (
                    <span className="block font-mono text-muted-foreground" title={row.stripePaymentIntentId}>
                      {row.stripePaymentIntentId}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                  {row.stripeBalanceTransactionId && (
                    <a
                      className="mt-1 block font-mono text-accent hover:underline"
                      href={stripeLink('balance', row.stripeBalanceTransactionId)}
                      title={row.stripeBalanceTransactionId}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {row.stripeBalanceTransactionId}
                    </a>
                  )}
                </td>
                <td className="break-words px-2 py-3 text-[10px] text-muted-foreground">
                  {row.notes || (row.stripeAvailableOn ? `Available ${formatDateTime(row.stripeAvailableOn)}` : '-')}
                </td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-muted-foreground">
                  No orders found for this range.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StripeIdBlock({ row }: { row: OrderReconciliationRow }) {
  return (
    <div className="break-all font-mono text-[10px] leading-relaxed">
      {row.stripeChargeId ? (
        <a
          className="block text-accent hover:underline"
          href={stripeLink('payments', row.stripeChargeId)}
          title={row.stripeChargeId}
          target="_blank"
          rel="noreferrer"
        >
          {row.stripeChargeId}
        </a>
      ) : row.stripePaymentIntentId ? (
        <span className="block text-muted-foreground" title={row.stripePaymentIntentId}>
          {row.stripePaymentIntentId}
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      )}
      {row.stripeBalanceTransactionId && (
        <a
          className="mt-1 block text-accent hover:underline"
          href={stripeLink('balance', row.stripeBalanceTransactionId)}
          title={row.stripeBalanceTransactionId}
          target="_blank"
          rel="noreferrer"
        >
          {row.stripeBalanceTransactionId}
        </a>
      )}
    </div>
  );
}

function MobileAmountRow({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right font-medium ${className}`}>{value}</span>
    </div>
  );
}

function MobileReconciliationCard({ row }: { row: OrderReconciliationRow }) {
  return (
    <div className={`rounded-lg border bg-card p-4 ${!rowHasStripeData(row) ? 'bg-muted/20' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-semibold">{row.orderNumber}</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
        </div>
        <DifferenceBadge cents={row.discrepancyCents} currency={row.currency} />
      </div>

      <div className="mt-3 grid gap-1 text-xs">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Customer</span>
          <span className="text-right font-medium">{row.customerName || 'Customer unavailable'}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Status</span>
          <span className="text-right font-medium">{row.status} / {row.paymentStatus || '-'}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 rounded-md bg-background-subtle p-3 text-xs">
        <MobileAmountRow label="Subtotal" value={money(row.orderSubtotalCents, row.currency)} />
        <MobileAmountRow label="Tax" value={money(row.orderTaxCents, row.currency)} />
        <MobileAmountRow label="Order Total" value={money(row.orderTotalCents, row.currency)} />
        <MobileAmountRow label="Stripe Captured" value={money(row.stripeCapturedCents, row.currency)} />
        <MobileAmountRow label="Refunded" value={money(row.stripeRefundedCents ?? row.orderRefundedCents, row.currency)} />
        <MobileAmountRow label="Stripe Fee" value={money(row.stripeFeeCents, row.currency)} className="text-amber-700" />
        <MobileAmountRow label="Net Credit" value={money(row.stripeNetCents, row.currency)} className="text-sf-success" />
      </div>

      <div className="mt-4 space-y-1 text-xs">
        <p className="font-medium text-muted-foreground">Stripe IDs</p>
        <StripeIdBlock row={row} />
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Notes: </span>
        {row.notes || (row.stripeAvailableOn ? `Available ${formatDateTime(row.stripeAvailableOn)}` : '-')}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Scale className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
