import { useState, type FormEvent, useEffect } from 'react';
import { PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface StripePaymentFormProps {
  orderId: string;
}

export default function StripePaymentForm({ orderId }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  // true only when Stripe reports all required fields are filled and valid
  // (card number, expiry, CVC, billing country, ZIP, etc.)
  const [isComplete, setIsComplete] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Debug logging
  useEffect(() => {
    console.log('[StripePaymentForm] Stripe initialized:', !!stripe);
    console.log('[StripePaymentForm] Elements initialized:', !!elements);
    console.log('[StripePaymentForm] Order ID:', orderId);
  }, [stripe, elements, orderId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!stripe || !elements || !isReady || !isComplete) {
      console.warn('[StripePaymentForm] Submit blocked - stripe:', !!stripe, 'elements:', !!elements, 'isReady:', isReady, 'isComplete:', isComplete);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?orderId=${encodeURIComponent(orderId)}`,
      },
    });

    if (result.error) {
      const message = result.error.message || 'Payment authorization failed. Please try again.';
      console.error('[StripePaymentForm] Payment error:', result.error);
      setErrorMessage(message);
      navigate(`/checkout/failure?orderId=${encodeURIComponent(orderId)}&message=${encodeURIComponent(message)}`);
    }

    setIsSubmitting(false);
  };

  const handlePaymentElementReady = () => {
    console.log('[StripePaymentForm] Payment element ready');
    setIsReady(true);
  };

  const handlePaymentElementChange = (event: { complete: boolean; empty: boolean; value: { type: string } }) => {
    console.log('[StripePaymentForm] Payment element change:', event);
    // Stripe sets complete=true only when every required field (card number,
    // expiry, CVC, billing country, ZIP) is filled and passes validation.
    setIsComplete(event.complete);
    // Clear any prior error when the customer updates the form.
    if (event.complete) {
      setErrorMessage('');
    }
  };

  const handlePaymentElementError = (event: { elementType: 'payment'; error: { message?: string; type?: string } }) => {
    const error = event.error;
    console.error('[StripePaymentForm] Payment Element Error:', error);
    const message = error?.message || error?.type || 'Payment element failed to load. Please refresh the page and try again.';
    setErrorMessage(message);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          // applePay: 'auto' — Stripe automatically shows the Apple Pay button only on
          // supported devices: Safari on iOS/macOS (Touch ID / Face ID), Chrome on iOS.
          // On all other browsers/devices it is hidden automatically — no extra code needed.
          // googlePay: 'never' — not enabled in this store.
          wallets: { applePay: 'auto', googlePay: 'never' },
        }}
        onReady={handlePaymentElementReady}
        onChange={handlePaymentElementChange}
        onLoadError={handlePaymentElementError}
      />
      {errorMessage ? (
        <p data-testid="payment-error" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
        disabled={!stripe || !elements || !isReady || !isComplete || isSubmitting}
        data-testid="place-order-btn"
      >
        {isSubmitting ? 'Processing payment...' : 'Pay now'}
      </Button>
    </form>
  );
}