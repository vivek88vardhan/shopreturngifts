import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/stores/cartStore';

type ZeroAmountCheckoutProps = {
  orderId: string;
};

export default function ZeroAmountCheckout({ orderId }: ZeroAmountCheckoutProps) {
  const navigate = useNavigate();
  const clearCart = useCartStore(s => s.clearCart);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleComplete = () => {
    setIsSubmitting(true);
    clearCart();
    navigate(`/checkout/success?orderId=${encodeURIComponent(orderId)}`, { replace: true });
  };

  return (
    <div className="mt-6 space-y-4 rounded-md border border-accent/30 bg-accent/5 p-6">
      <p className="text-sm text-foreground">
        Your order total is <span className="font-semibold">$0.00</span> after discounts. No card payment is required.
      </p>
      <Button
        type="button"
        className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
        disabled={isSubmitting}
        onClick={handleComplete}
        data-testid="complete-free-order-btn"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Completing order…
          </>
        ) : (
          'Complete order'
        )}
      </Button>
    </div>
  );
}
