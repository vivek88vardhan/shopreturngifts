import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatPrice, formatDate } from '@/lib/formatters';
import StatusBadge from '@/components/store/StatusBadge';
import OrderTrackingTimeline from '@/components/store/OrderTrackingTimeline';
import { useOrder, useCancelOrder } from '@/hooks/useApi';
import { ordersApi } from '@/lib/api';
import { toast } from '@/lib/inboxToast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function OrderDetailPage() {
  const { orderId } = useParams();
  const { data: order, isLoading, isError } = useOrder(orderId);
  const cancelOrder = useCancelOrder();
  const [reason, setReason] = useState('');

  const handleDownloadInvoice = async () => {
    if (!orderId) return;
    if (!order?.invoiceS3Key && order?.paymentStatus !== 'paid') {
      toast.error('Receipt is not yet available');
      return;
    }
    try {
      const { url } = await ordersApi.getInvoice(orderId);
      window.open(url, '_blank');
    } catch {
      toast.error('Failed to get invoice');
    }
  };

  const handleCancel = async () => {
    if (!orderId) return;
    try {
      await cancelOrder.mutateAsync({ orderId, reason });
      toast.success('Order cancelled');
    } catch {
      toast.error('Failed to cancel order');
    }
  };

  if (isLoading) {
    return <div className="sf-container flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (isError || !order) {
    return (
      <div className="sf-container py-20 text-center">
        <p className="text-muted-foreground">Order not found</p>
        <Button asChild variant="outline" className="mt-4"><Link to="/orders">Back to Orders</Link></Button>
      </div>
    );
  }

  const canCancel = order.status === 'Pending';

  return (
    <div className="sf-container py-8">
      <Link to="/orders" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Orders
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold font-mono text-foreground">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          <Button variant="outline" size="sm" onClick={handleDownloadInvoice} disabled={!order.invoiceS3Key && order.paymentStatus !== 'paid'}>
            <Download className="mr-2 h-4 w-4" /> Invoice
          </Button>
          {canCancel && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <X className="mr-2 h-4 w-4" /> Cancel Order
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pending orders can be cancelled before payment is captured. Once cancelled, this cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="cancel-reason" className="text-sm">Reason (optional)</Label>
                  <Textarea
                    id="cancel-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Tell us why you're cancelling…"
                    rows={3}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={cancelOrder.isPending}>Keep Order</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancel}
                    disabled={cancelOrder.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {cancelOrder.isPending ? 'Cancelling…' : 'Cancel Order'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {!order.invoiceS3Key && order.paymentStatus !== 'paid' ? (
        <p className="mt-3 text-sm text-muted-foreground">Receipt will be available shortly.</p>
      ) : null}

      <OrderTrackingTimeline status={order.status} paidAt={order.paidAt} deliveredAt={order.deliveredAt} />

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-lg border">
            <div className="border-b px-6 py-3">
              <h3 className="text-sm font-semibold">Items</h3>
            </div>
            {order.items.map((item, idx) => (
              <div key={item.productId} className={`flex items-center justify-between px-6 py-4 ${idx > 0 ? 'border-t' : ''}`}>
                <div>
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.qty} × {formatPrice(item.unitPrice)}</p>
                </div>
                <span className="text-sm font-medium">{formatPrice(item.lineTotal)}</span>
              </div>
            ))}
          </div>

          {order.trackingNumber && (
            <div className="mt-4 rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Tracking Number</p>
              <p className="mt-1 font-mono text-sm font-medium">{order.trackingNumber}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border p-5">
            <h3 className="text-sm font-semibold">Order Summary</h3>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(order.subtotal)}</span></div>
              {(order.shippingFee ?? 0) > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Shipping</span><span>{formatPrice(order.shippingFee!)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatPrice(order.tax)}</span></div>
              <div className="my-1 border-t" />
              <div className="flex justify-between font-bold"><span>Total</span><span>{formatPrice(order.total)}</span></div>
            </div>
          </div>

          <div className="rounded-lg border p-5">
            <h3 className="text-sm font-semibold">Shipping Address</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {order.shippingAddress.line1}<br />
              {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.zip}<br />
              {order.shippingAddress.country}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
