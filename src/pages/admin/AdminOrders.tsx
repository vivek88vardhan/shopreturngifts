import { useState, useEffect } from 'react';
import { formatPrice, formatDateTime } from '@/lib/formatters';
import StatusBadge from '@/components/store/StatusBadge';
import {
  ORDER_DISPLAY_STATUSES,
  getOrderDisplayStatus,
  type OrderDisplayStatus,
} from '@/lib/orderDisplayStatus';
import { getApiErrorMessage } from '@/lib/apiError';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Loader2, ChevronLeft, ChevronRight, MapPin, CreditCard, Clock, User, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown, Download } from 'lucide-react';
import type { Order, OrderStatus, PaymentStatus } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/lib/inboxToast';
import { useAdminOrders, useUpdateOrderStatus, useRefundOrder, usePatchOrder } from '@/hooks/useApi';

const statuses = ORDER_DISPLAY_STATUSES;

const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  Pending: ['Paid'],
  Paid: ['Processing', 'Cancelled'],
  Processing: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered'],
  Delivered: [],
  Cancelled: [],
  Failed: [],
};

const ITEMS_PER_PAGE = 15;

type OrderSortKey = 'orderNumber' | 'customer' | 'assignee' | 'createdAt' | 'updatedAt';
type SortDir = 'asc' | 'desc';

function parseSortTime(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function customerSortValue(o: Order): string {
  return (o.userName || o.userEmail || o.userId || '').trim();
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function formatExportMoney(value: number | undefined): string {
  return (value ?? 0).toFixed(2);
}

function formatExportCents(cents: number | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2);
}

function exportOrdersCsv(orders: Order[], filename: string) {
  const headers = [
    'Order #',
    'Order ID',
    'Status',
    'Display Status',
    'Payment Status',
    'Customer Name',
    'Customer Email',
    'Customer ID',
    'Assignee',
    'Items Count',
    'Items',
    'Subtotal',
    'Shipping',
    'Tax',
    'Total',
    'Refunded',
    'Currency',
    'Coupon Code',
    'Coupon Discount',
    'Tracking Number',
    'Cancel Reason',
    'Created At',
    'Updated At',
    'Paid At',
    'Delivered At',
    'Cancelled At',
    'Shipping Line 1',
    'Shipping Line 2',
    'Shipping City',
    'Shipping State',
    'Shipping Zip',
    'Shipping Country',
    'Stripe Payment Intent ID',
    'Stripe Charge ID',
  ];

  const rows = orders.map(o => [
    o.orderNumber,
    o.orderId,
    o.status,
    getOrderDisplayStatus(o),
    o.paymentStatus ?? '',
    o.userName ?? '',
    o.userEmail ?? '',
    o.userId,
    o.assignee ?? '',
    o.items?.length ?? 0,
    (o.items ?? []).map(item => `${item.name} x${item.qty} @ ${formatExportMoney(item.unitPrice)} = ${formatExportMoney(item.lineTotal)}`).join('; '),
    formatExportMoney(o.subtotal),
    formatExportMoney(o.shippingFee),
    formatExportMoney(o.tax),
    formatExportMoney(o.total),
    formatExportCents(o.refundedAmountCents),
    o.currency,
    o.couponCode ?? '',
    formatExportCents(o.couponDiscountCents),
    o.trackingNumber ?? '',
    o.cancelReason ?? '',
    o.createdAt,
    o.updatedAt,
    o.paidAt ?? '',
    o.deliveredAt ?? '',
    o.cancelledAt ?? '',
    o.shippingAddress?.line1 ?? '',
    o.shippingAddress?.line2 ?? '',
    o.shippingAddress?.city ?? '',
    o.shippingAddress?.state ?? '',
    o.shippingAddress?.zip ?? '',
    o.shippingAddress?.country ?? '',
    o.stripePaymentIntentId ?? '',
    o.stripeChargeId ?? '',
  ]);

  const csv = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function SortableHeader({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  column: OrderSortKey;
  sortKey: OrderSortKey;
  sortDir: SortDir;
  onSort: (column: OrderSortKey) => void;
}) {
  const active = sortKey === column;
  return (
    <th className="px-4 py-3 text-left">
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

export default function AdminOrders() {
  const [statusFilter, setStatusFilter] = useState<OrderDisplayStatus | 'All'>('All');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<Order | null>(null);
  const [page, setPage] = useState(1);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundType, setRefundType] = useState<'full' | 'partial' | ''>('');
  const [refundAmountStr, setRefundAmountStr] = useState('');
  const [refundReason, setRefundReason] = useState<'duplicate' | 'fraudulent' | 'requested_by_customer'>('requested_by_customer');
  const [refundComments, setRefundComments] = useState('');
  const [sortKey, setSortKey] = useState<OrderSortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { data: ordersData, isLoading } = useAdminOrders({
    from: dateFrom || undefined,
    to: dateTo || undefined,
  });
  const updateStatus = useUpdateOrderStatus();
  const patchOrder = usePatchOrder();
  const refundOrder = useRefundOrder();

  const allOrders = ordersData?.items || [];
  const orders = (ordersData?.items || []).filter(o => o.status !== 'Pending');

  function refundWindowStartMs(o: Order): number | null {
    for (const s of [o.paidAt, o.createdAt]) {
      if (!s?.trim()) continue;
      const t = Date.parse(s);
      if (!Number.isNaN(t)) return t;
    }
    return null;
  }

  function remainingRefundableCents(o: Order): number {
    return Math.max(0, Math.round(o.total * 100) - (o.refundedAmountCents ?? 0));
  }

  function remainingRefundable(o: Order): number {
    return remainingRefundableCents(o) / 100;
  }

  const filtered = orders.filter(o => {
    if (statusFilter !== 'All' && getOrderDisplayStatus(o) !== statusFilter) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !o.orderNumber.toLowerCase().includes(q) &&
        !(o.userName || '').toLowerCase().includes(q) &&
        !(o.userEmail || '').toLowerCase().includes(q) &&
        !o.orderId.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'orderNumber':
        cmp = a.orderNumber.localeCompare(b.orderNumber, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'customer':
        cmp = customerSortValue(a).localeCompare(customerSortValue(b), undefined, { sensitivity: 'base' });
        break;
      case 'assignee':
        cmp = (a.assignee || '').localeCompare(b.assignee || '', undefined, { sensitivity: 'base' });
        break;
      case 'createdAt':
        cmp = parseSortTime(a.createdAt) - parseSortTime(b.createdAt);
        break;
      case 'updatedAt':
        cmp = parseSortTime(a.updatedAt) - parseSortTime(b.updatedAt);
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = (column: OrderSortKey) => {
    if (sortKey === column) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(column);
      setSortDir(column === 'customer' || column === 'assignee' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const handleExportOrders = () => {
    if (allOrders.length === 0) {
      toast.error('No orders to export');
      return;
    }
    const dateLabel = new Date().toISOString().slice(0, 10);
    const rangeLabel = dateFrom || dateTo ? `-${dateFrom || 'start'}-to-${dateTo || 'today'}` : '';
    exportOrdersCsv(allOrders, `shopreturngifts-orders${rangeLabel}-${dateLabel}.csv`);
    toast.success(`Exported ${allOrders.length} order${allOrders.length === 1 ? '' : 's'} to CSV`);
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const paginated = sorted.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openOrderDetail = (order: Order) => {
    setSelected(order);
    setAssigneeDraft(order.assignee ?? '');
    setCancelOpen(false);
    setCancelReason('');
    setRefundOpen(false);
    setRefundType('');
  };

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus, reason?: string) => {
    try {
      const updated = await updateStatus.mutateAsync({
        orderId,
        status: newStatus,
        ...(newStatus === 'Cancelled' ? { cancelReason: reason } : {}),
      });
      if (selected?.orderId === orderId) {
        setSelected(updated);
        setCancelOpen(false);
        setCancelReason('');
      }
      toast.success(`Order status updated to ${newStatus}`);
    } catch (err) {
      toast.error(
        getApiErrorMessage(err, newStatus === 'Cancelled' ? 'Failed to cancel order' : 'Failed to update status')
      );
    }
  };

  const handleCancelConfirm = async () => {
    if (!selected) return;
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error('Please enter a reason for cancellation');
      return;
    }
    await handleStatusChange(selected.orderId, 'Cancelled', reason);
  };

  const handleAssigneeSave = async () => {
    if (!selected) return;
    try {
      const updated = await patchOrder.mutateAsync({
        orderId: selected.orderId,
        assignee: assigneeDraft.trim(),
      });
      setSelected(updated);
      toast.success('Assignee updated');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to update assignee'));
    }
  };

  const applyRefundType = (type: 'full' | 'partial', order: Order) => {
    setRefundType(type);
    if (type === 'full') {
      setRefundAmountStr(remainingRefundable(order).toFixed(2));
    } else {
      setRefundAmountStr('');
    }
  };

  const handleRefund = async () => {
    if (!selected) return;
    let amountCents = 0;
    let type: 'full' | 'partial' = 'full';

    if (selected.paymentStatus === 'authorized') {
      amountCents = 0;
    } else {
      if (!refundType) {
        toast.error('Select a refund type');
        return;
      }
      type = refundType;
      const amount = parseFloat(refundAmountStr);
      if (isNaN(amount) || amount <= 0) {
        toast.error('Enter a valid refund amount');
        return;
      }
      const remainingCents = remainingRefundableCents(selected);
      amountCents = Math.round(amount * 100);
      if (type === 'partial' && amountCents > Math.round(selected.subtotal * 100)) {
        toast.error(`Partial refund cannot exceed subtotal (${formatPrice(selected.subtotal)})`);
        return;
      }
      if (amountCents > remainingCents) {
        toast.error(`Refund cannot exceed remaining refundable amount (${formatPrice(remainingCents / 100)})`);
        return;
      }
    }

    try {
      const result = await refundOrder.mutateAsync({
        orderId: selected.orderId,
        refundType: selected.paymentStatus === 'authorized' ? 'full' : type,
        amountCents,
        reason: refundReason,
        comments: refundComments,
      });
      const newRefundedCents = (selected.refundedAmountCents ?? 0) + result.refunded_amount_cents;
      setSelected({
        ...selected,
        paymentStatus: result.payment_status as PaymentStatus,
        refundedAmountCents: newRefundedCents,
        status: result.payment_status === 'cancelled' ? 'Cancelled' : selected.status,
      });
      toast.success(
        result.payment_status === 'cancelled'
          ? 'Payment authorization cancelled'
          : `${type === 'full' ? 'Full' : 'Partial'} refund of ${formatPrice(result.refunded_amount_cents / 100)} processed`
      );
      setRefundOpen(false);
      setRefundType('');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Refund failed. Please try again.'));
    }
  };

  const openRefundForm = (order: Order) => {
    setRefundType('');
    setRefundAmountStr('');
    setRefundReason('requested_by_customer');
    setRefundComments('');
    setRefundOpen(true);
  };

  const paymentStatusLabel: Record<string, { label: string; className: string }> = {
    authorized: { label: 'Authorized', className: 'bg-blue-100 text-blue-700' },
    paid: { label: 'Paid', className: 'bg-green-100 text-green-700' },
    partially_refunded: { label: 'Partially Refunded', className: 'bg-amber-100 text-amber-700' },
    refunded: { label: 'Refunded', className: 'bg-gray-100 text-gray-600' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-600' },
    capture_failed: { label: 'Payment Failed', className: 'bg-rose-100 text-rose-700' },
    disputed: { label: 'Disputed', className: 'bg-orange-100 text-orange-700' },
    pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {orders.length} orders
        {(ordersData?.items ?? []).some(o => o.status === 'Pending') && (
          <span className="text-muted-foreground"> — pending checkout orders are hidden</span>
        )}
      </p>
      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleExportOrders}
          disabled={allOrders.length === 0}
        >
          <Download className="h-4 w-4" />
          Export CSV ({allOrders.length})
        </Button>
        <p className="mt-1 text-xs text-muted-foreground">
          Exports all fetched orders, including pending checkout and every status. Date filters apply when selected.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-1.5">
          {statuses.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === s ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="orders-from" className="sr-only">From date</Label>
          <Input
            id="orders-from"
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="w-[9.5rem] text-xs"
            title="From date"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Label htmlFor="orders-to" className="sr-only">To date</Label>
          <Input
            id="orders-to"
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="w-[9.5rem] text-xs"
            title="To date"
          />
          {(dateFrom || dateTo) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}
            >
              Clear dates
            </Button>
          )}
        </div>
        <div className="relative w-full sm:ml-auto sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search order #, order ID, name, email..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b bg-background-subtle">
            <tr>
              <SortableHeader label="Order #" column="orderNumber" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Customer" column="customer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Assignee" column="assignee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Created" column="createdAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Updated" column="updatedAt" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Items</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginated.map(o => (
              <tr key={o.orderId} className="cursor-pointer hover:bg-background-subtle/50" onClick={() => openOrderDetail(o)}>
                <td className="px-4 py-3 font-mono text-xs font-medium">{o.orderNumber}</td>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{o.userName || o.userId}</p>
                    {o.userEmail && <p className="text-xs text-muted-foreground">{o.userEmail}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{o.assignee || '—'}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(o.createdAt)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateTime(o.updatedAt)}</td>
                <td className="px-4 py-3">{o.items?.length || 0}</td>
                <td className="px-4 py-3 font-medium">{formatPrice(o.total)}</td>
                <td className="px-4 py-3"><StatusBadge status={getOrderDisplayStatus(o)} /></td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No orders found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">Page {page} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Order Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) { setSelected(null); setRefundOpen(false); setRefundType(''); setCancelOpen(false); setCancelReason(''); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Order {selected?.orderNumber}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-6">
              {/* Status & timestamps */}
              <div className="flex flex-wrap items-center gap-4">
                <StatusBadge status={getOrderDisplayStatus(selected)} />
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Created: {formatDateTime(selected.createdAt)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Updated: {formatDateTime(selected.updatedAt)}
                </div>
                {selected.lastModifiedBy && (
                  <div className="text-xs text-muted-foreground">
                    Modified by: {selected.lastModifiedBy}
                  </div>
                )}
              </div>

              {/* Customer details */}
              <div className="rounded-md border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <User className="h-4 w-4" /> Customer Details
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-muted-foreground">Name:</span> {selected.userName || selected.userId}</div>
                  {selected.userEmail && <div><span className="text-muted-foreground">Email:</span> {selected.userEmail}</div>}
                </div>
              </div>

              {/* Shipping address */}
              <div className="rounded-md border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <MapPin className="h-4 w-4" /> Shipping Address
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{selected.shippingAddress.line1}</p>
                  {selected.shippingAddress.line2 && <p>{selected.shippingAddress.line2}</p>}
                  <p>{selected.shippingAddress.city}, {selected.shippingAddress.state} {selected.shippingAddress.zip}</p>
                  <p>{selected.shippingAddress.country}</p>
                </div>
              </div>

              {/* Order items */}
              <div>
                <Label className="mb-2 block">Order Items</Label>
                <div className="divide-y rounded-md border">
                  {(selected.items || []).map(item => (
                    <div key={item.productId} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">Qty: {item.qty} × {formatPrice(item.unitPrice)}</p>
                      </div>
                      <span className="font-medium">{formatPrice(item.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="rounded-md border p-4 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(selected.subtotal)}</span></div>
                {(selected.shippingFee ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{formatPrice(selected.shippingFee!)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatPrice(selected.tax)}</span></div>
                <Separator className="my-2" />
                <div className="flex justify-between font-bold text-base"><span>Total</span><span>{formatPrice(selected.total)}</span></div>
              </div>

              {/* Payment details */}
              <div className="rounded-md border p-4">
                <div className="flex items-center gap-2 text-sm font-semibold mb-3">
                  <CreditCard className="h-4 w-4" /> Payment Details
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Currency:</span> {selected.currency}
                    {selected.paymentStatus && (() => {
                      const ps = paymentStatusLabel[selected.paymentStatus];
                      return ps ? (
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${ps.className}`}>{ps.label}</span>
                      ) : null;
                    })()}
                  </div>
                  {selected.stripePaymentIntentId && (
                    <div><span className="text-muted-foreground">Stripe Payment ID:</span> <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">{selected.stripePaymentIntentId}</code></div>
                  )}
                  {(selected.refundedAmountCents ?? 0) > 0 && (
                    <div><span className="text-muted-foreground">Refunded:</span> <span className="text-amber-600 font-medium">{formatPrice((selected.refundedAmountCents ?? 0) / 100)}</span></div>
                  )}
                  {selected.trackingNumber && (
                    <div><span className="text-muted-foreground">Tracking:</span> {selected.trackingNumber}</div>
                  )}
                </div>
              </div>

              {/* Assignee */}
              <div className="rounded-md border p-4">
                <Label htmlFor="order-assignee" className="text-sm font-semibold">Assignee</Label>
                <p className="mt-1 text-xs text-muted-foreground">Person responsible for fulfilling this order</p>
                <div className="mt-3 flex gap-2">
                  <Input
                    id="order-assignee"
                    value={assigneeDraft}
                    onChange={e => setAssigneeDraft(e.target.value)}
                    placeholder="e.g. Raj, Priya, warehouse team…"
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAssigneeSave}
                    disabled={patchOrder.isPending || assigneeDraft.trim() === (selected.assignee ?? '')}
                  >
                    {patchOrder.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                    Save
                  </Button>
                </div>
              </div>

              {/* Cancellation reason */}
              {selected.status === 'Cancelled' && selected.cancelReason && (
                <div className="rounded-md border border-red-200 bg-red-50/50 p-4">
                  <p className="text-sm font-semibold text-red-800">Cancellation reason</p>
                  <p className="mt-1 text-sm text-red-900/90">{selected.cancelReason}</p>
                  {selected.cancelledAt && (
                    <p className="mt-2 text-xs text-muted-foreground">Cancelled: {formatDateTime(selected.cancelledAt)}</p>
                  )}
                </div>
              )}

              {/* Admin notes */}
              {selected.adminNotes && (
                <div className="rounded-md border p-4 bg-secondary/30">
                  <p className="text-sm font-semibold mb-1">Admin Notes</p>
                  <p className="text-sm text-muted-foreground">{selected.adminNotes}</p>
                </div>
              )}

              {/* Status transitions */}
              {validTransitions[selected.status].length > 0 && (
                <div>
                  <Label>Update Status</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {validTransitions[selected.status]
                      .filter(s => s !== 'Cancelled')
                      .map(s => (
                        <Button
                          key={s}
                          size="sm"
                          className="bg-accent text-accent-foreground hover:bg-accent-hover"
                          onClick={() => handleStatusChange(selected.orderId, s)}
                          disabled={updateStatus.isPending || cancelOpen}
                        >
                          {s}
                        </Button>
                      ))}
                    {validTransitions[selected.status].includes('Cancelled') && !cancelOpen && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => { setCancelOpen(true); setCancelReason(''); }}
                        disabled={updateStatus.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                  {cancelOpen && validTransitions[selected.status].includes('Cancelled') && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50/50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-red-800">Cancel order</p>
                      <div className="space-y-1">
                        <Label htmlFor="cancel-reason" className="text-xs">
                          Reason for cancellation <span className="text-red-600">*</span>
                        </Label>
                        <Textarea
                          id="cancel-reason"
                          value={cancelReason}
                          onChange={e => setCancelReason(e.target.value)}
                          placeholder="e.g. Customer requested cancellation, out of stock, payment issue…"
                          className="text-sm min-h-[80px] resize-none"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleCancelConfirm}
                          disabled={updateStatus.isPending || !cancelReason.trim()}
                        >
                          {updateStatus.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Confirm cancellation
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setCancelOpen(false); setCancelReason(''); }}
                          disabled={updateStatus.isPending}
                        >
                          Back
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Refund section */}
              {(() => {
                const isAuthorized = selected.paymentStatus === 'authorized';
                const isCaptured = selected.paymentStatus === 'paid' || selected.paymentStatus === 'partially_refunded';
                const anchorMs = refundWindowStartMs(selected);
                const within15Days =
                  anchorMs != null && Date.now() - anchorMs <= 15 * 24 * 60 * 60 * 1000;
                const refundAllowed = isAuthorized || (isCaptured && within15Days);
                if (!isAuthorized && !isCaptured) return null;
                return (
                  <div>
                    <Separator className="mb-4" />
                    {!refundAllowed && isCaptured && (
                      <p className="mb-3 text-xs text-muted-foreground">
                        {anchorMs == null
                          ? 'This order has no payment timestamp; refunds cannot be validated.'
                          : 'The 15-day refund window from payment has passed.'}
                      </p>
                    )}
                    {!refundOpen ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => openRefundForm(selected)}
                        disabled={!refundAllowed}
                      >
                        <RotateCcw className="h-4 w-4" />
                        {isAuthorized ? 'Cancel Payment' : 'Issue Refund'}
                      </Button>
                    ) : (
                    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                      <p className="text-sm font-semibold text-amber-800">
                        {selected.paymentStatus === 'authorized' ? 'Cancel Authorized Payment' : 'Issue Refund'}
                      </p>
                      {selected.paymentStatus !== 'authorized' && (
                        <>
                          <div className="space-y-1">
                            <Label htmlFor="refund-type" className="text-xs">
                              Refund type <span className="text-red-600">*</span>
                            </Label>
                            <Select
                              value={refundType}
                              onValueChange={v => applyRefundType(v as 'full' | 'partial', selected)}
                            >
                              <SelectTrigger id="refund-type" className="h-8 text-sm">
                                <SelectValue placeholder="Select refund type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="full">Full refund</SelectItem>
                                <SelectItem value="partial">Partial refund</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {refundType && (
                            <div className="space-y-1">
                              <Label htmlFor="refund-amount" className="text-xs">Amount (USD)</Label>
                              <Input
                                id="refund-amount"
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={refundAmountStr}
                                onChange={e => setRefundAmountStr(e.target.value)}
                                readOnly={refundType === 'full'}
                                className={`h-8 text-sm ${refundType === 'full' ? 'bg-muted' : ''}`}
                              />
                              <p className="text-xs text-muted-foreground">
                                {refundType === 'partial'
                                  ? `Max subtotal: ${formatPrice(selected.subtotal)} · Remaining refundable: ${formatPrice(remainingRefundable(selected))}`
                                  : `Order total (remaining): ${formatPrice(remainingRefundable(selected))}`}
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      {selected.paymentStatus !== 'authorized' && (
                        <div className="space-y-1">
                          <Label htmlFor="refund-reason" className="text-xs">Reason</Label>
                          <Select
                            value={refundReason}
                            onValueChange={v => setRefundReason(v as typeof refundReason)}
                          >
                            <SelectTrigger id="refund-reason" className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="requested_by_customer">Requested by customer</SelectItem>
                              <SelectItem value="duplicate">Duplicate</SelectItem>
                              <SelectItem value="fraudulent">Fraudulent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className="space-y-1">
                          <Label htmlFor="refund-comments" className="text-xs">Comments <span className="text-muted-foreground">(optional)</span></Label>
                          <Textarea
                            id="refund-comments"
                            value={refundComments}
                            onChange={e => setRefundComments(e.target.value)}
                            placeholder="e.g. Customer reported wrong item delivered…"
                            className="text-sm min-h-[64px] resize-none"
                          />
                        </div>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleRefund}
                          disabled={
                            refundOrder.isPending ||
                            (selected.paymentStatus !== 'authorized' && !refundType)
                          }
                        >
                          {refundOrder.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          {selected.paymentStatus === 'authorized' ? 'Confirm Cancellation' : 'Confirm Refund'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setRefundOpen(false); setRefundType(''); }}
                          disabled={refundOrder.isPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
