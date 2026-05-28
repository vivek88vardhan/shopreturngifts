import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, Clock, Loader2, ShoppingBag, Truck, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ordersApi } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { formatDate } from '@/lib/formatters';
import type { Order } from '@/types';

export default function CheckoutSuccessPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const clearCart = useCartStore(state => state.clearCart);
  const [order, setOrder] = useState<Order | null>(null);
  // 'loading' → confirming with backend
  // 'ready'   → payment succeeded, order confirmed
  // 'pending' → Stripe payment accepted but async (e.g. ACH); awaiting capture
  // 'error'   → payment failed or missing params
  const [status, setStatus] = useState<'loading' | 'ready' | 'pending' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [isDownloadingReceipt, setIsDownloadingReceipt] = useState(false);

  const orderId = params.get('orderId') || '';
  const paymentIntentId = params.get('payment_intent') || '';

  useEffect(() => {
    let active = true;

    const confirmPayment = async () => {
      if (!orderId) {
        if (active) {
          setStatus('error');
          setErrorMessage('Missing order reference.');
        }
        return;
      }

      // $0 orders (e.g. 100% coupon) are marked paid at creation — no Stripe PI.
      if (!paymentIntentId) {
        try {
          const freshOrder = await ordersApi.getOrder(orderId);
          if (!active) return;
          if (freshOrder.paymentStatus === 'paid') {
            clearCart();
            setOrder(freshOrder);
            setStatus('ready');
            return;
          }
          setStatus('error');
          setErrorMessage('Payment confirmation is still pending for this order.');
        } catch (error) {
          if (!active) return;
          const message = error instanceof Error ? error.message : 'We could not load your order.';
          setStatus('error');
          setErrorMessage(message);
        }
        return;
      }

      try {
        const confirmation = await ordersApi.confirmPayment(orderId, paymentIntentId);
        if (!active) return;
        clearCart();
        // Backend returns status "pending" when Stripe has accepted the payment
        // method but funds have not yet been captured (async payment methods).
        // Do NOT show the success screen — show a "pending" holding page instead
        // so the customer knows their order is not yet confirmed.
        if (confirmation?.status === 'pending') {
          setStatus('pending');
          return;
        }
        const freshOrder = await ordersApi.getOrder(orderId);
        if (!active) return;
        setOrder(freshOrder);
        setStatus('ready');
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'We could not confirm your payment.';
        setStatus('error');
        setErrorMessage(message);
        navigate(`/checkout/failure?orderId=${encodeURIComponent(orderId)}&message=${encodeURIComponent(message)}`, { replace: true });
      }
    };

    void confirmPayment();

    return () => {
      active = false;
    };
  }, [clearCart, navigate, orderId, paymentIntentId]);

  const estimatedDelivery = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 2);
    return formatDate(date.toISOString());
  }, []);

  const canViewReceipt = Boolean(order?.invoiceS3Key || order?.paymentStatus === 'paid');

  const handleReceiptDownload = async () => {
    if (!order || !canViewReceipt) {
      setErrorMessage('Receipt is not yet available.');
      return;
    }
    setIsDownloadingReceipt(true);
    try {
      const result = await ordersApi.getInvoice(order.orderId);
      if (result?.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open receipt.';
      setErrorMessage(message);
    } finally {
      setIsDownloadingReceipt(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="sf-container flex flex-col items-center py-20 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Confirming your payment…</p>
      </div>
    );
  }

  // Stripe has accepted the payment method but funds are not yet captured
  // (e.g. ACH, bank transfers). Show a clear holding state — NOT a success screen.
  if (status === 'pending') {
    return (
      <div className="sf-container flex flex-col items-center py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
          <Clock className="h-8 w-8 text-yellow-600" />
        </div>
        <h1 className="mt-6 text-2xl font-bold text-foreground">Payment pending</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Your payment is being processed by your bank. We will confirm your order by email once
          the payment clears — this usually takes 1–3 business days.
        </p>
        {orderId && (
          <div className="mt-6 rounded-lg border bg-background-subtle px-6 py-4">
            <p className="text-xs text-muted-foreground">Order Reference</p>
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{orderId}</p>
          </div>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent-hover">
            <Link to="/orders"><ShoppingBag className="mr-2 h-4 w-4" /> View My Orders</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/">Continue Shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'error' || !order) {
    return (
      <div className="sf-container flex flex-col items-center py-20 text-center">
        <p className="text-muted-foreground">{errorMessage || 'Unable to confirm your payment.'}</p>
        <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent-hover">
          <Link to="/checkout/failure">View failure details</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="sf-container flex flex-col items-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10" data-testid="success-icon">
        <CheckCircle className="h-8 w-8 text-accent" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-foreground">Payment authorized</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Your order is confirmed and payment has been authorized.
      </p>
      <div className="mt-6 rounded-lg border bg-background-subtle px-6 py-4">
        <p className="text-xs text-muted-foreground">Order Number</p>
        <p className="mt-1 text-lg font-mono font-bold text-foreground" data-testid="order-id">{order.orderNumber}</p>
      </div>
      <div className="mt-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm text-muted-foreground" data-testid="estimated-delivery">
        <Truck className="h-4 w-4 text-accent" /> Estimated delivery: {estimatedDelivery}
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button variant="outline" asChild>
          <Link to={`/orders/${order.orderId}`} data-testid="track-order-btn"><FileText className="mr-2 h-4 w-4" /> Track Order</Link>
        </Button>
        <Button variant="outline" onClick={handleReceiptDownload} disabled={isDownloadingReceipt || !canViewReceipt} data-testid="receipt-download-btn">
          <FileText className="mr-2 h-4 w-4" /> {isDownloadingReceipt ? 'Opening Receipt…' : 'View Receipt'}
        </Button>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent-hover">
          <Link to="/" data-testid="continue-shopping-btn"><ShoppingBag className="mr-2 h-4 w-4" /> Continue Shopping</Link>
        </Button>
      </div>
      {!canViewReceipt ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Receipt will be available shortly.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-3 text-sm text-destructive">{errorMessage}</p>
      ) : null}
    </div>
  );
}
