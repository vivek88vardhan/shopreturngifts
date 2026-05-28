import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, RotateCcw, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CheckoutFailurePage() {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const message = params.get('message') || 'Payment was not completed.';

  return (
    <div className="sf-container flex flex-col items-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-foreground">Payment failed</h1>
      <p className="mt-2 max-w-xl text-muted-foreground" data-testid="payment-error">{message}</p>
      {orderId ? (
        <div className="mt-6 rounded-lg border bg-background-subtle px-6 py-4">
          <p className="text-xs text-muted-foreground">Order Reference</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{orderId}</p>
        </div>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent-hover">
          <Link to="/checkout"><RotateCcw className="mr-2 h-4 w-4" /> Try Again</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/cart"><ShoppingCart className="mr-2 h-4 w-4" /> Back to Cart</Link>
        </Button>
      </div>
    </div>
  );
}