import { loadStripe, type Stripe } from '@stripe/stripe-js';

const stripePromises = new Map<string, Promise<Stripe | null>>();

export function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  if (!publishableKey) {
    return Promise.resolve(null);
  }

  const existing = stripePromises.get(publishableKey);
  if (existing) {
    return existing;
  }

  const stripePromise = loadStripe(publishableKey);
  stripePromises.set(publishableKey, stripePromise);
  return stripePromise;
}