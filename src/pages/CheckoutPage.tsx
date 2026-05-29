import { useMemo, useState, useEffect } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { useNavigate } from 'react-router-dom';
import { cartLineKey } from '@/lib/customProduct';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { formatPrice } from '@/lib/formatters';
import { ProductPriceDisplay } from '@/components/store/ProductPriceDisplay';
import { useCreateOrder, useThemeConfig, useValidateCoupon, useBestCoupon } from '@/hooks/useApi';
import { useSyncCartPrices } from '@/hooks/useSyncCartPrices';
import { toast } from '@/lib/inboxToast';
import { AlertTriangle, Check, Loader2, MapPin, ShieldCheck, Sparkles, Tag, X } from 'lucide-react';
import type { Coupon, CreateOrderResponse } from '@/types';
import { AddressAutocomplete, US_STATES, type ParsedAddress } from '@/components/store/AddressAutocomplete';
import StripePaymentForm from '@/components/checkout/StripePaymentForm';
import ZeroAmountCheckout from '@/components/checkout/ZeroAmountCheckout';
import { getStripePromise } from '@/lib/stripe';
import {
  couponDiscountAmount,
  flatCouponRedemption,
  formatCouponDiscount,
  isFlatCoupon,
} from '@/lib/couponDiscount';
import CouponUnusedNotice from '@/components/store/CouponUnusedNotice';
import FreeShippingMessage from '@/components/store/FreeShippingMessage';
import { computeShippingFee } from '@/lib/shipping';
import { useSyncFreebie } from '@/hooks/useSyncFreebie';
import FreebiePromoBanner from '@/components/store/FreebiePromoBanner';
import { isFreebieCartItem, paidMerchandiseSubtotal } from '@/lib/freebie';

function CheckoutUnauthenticated() {
  const { items, subtotal } = useCartStore();
  const navigate = useNavigate();

  return (
    <div className="sf-container py-8">
      <h1 className="text-2xl font-bold text-foreground">Checkout</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="divide-y rounded-lg border">
            {items.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Your cart is empty</div>
            ) : (
              items.map(item => (
                <div key={cartLineKey(item)} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-4">
                    {item.engraving?.imageUrl ? (
                      <img src={item.engraving.imageUrl} alt={item.product.name} className="h-14 w-14 rounded-md object-cover" />
                    ) : item.product.images?.[0] ? (
                      <img src={item.product.images[0]} alt={item.product.name} className="h-14 w-14 rounded-md object-cover" />
                    ) : (
                      <div className="h-14 w-14 rounded-md bg-secondary" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      {item.engraving && (
                        <p className="text-xs text-accent">Personalized: {item.engraving.name}</p>
                      )}
                    </div>
                  </div>
                  <ProductPriceDisplay product={item.product} quantity={item.quantity} saleClassName="text-sm font-medium text-foreground" />
                </div>
              ))
            )}
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="rounded-lg border p-6 text-center">
            <h3 className="text-sm font-semibold">Order Summary</h3>
            <div className="mt-4 flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal ({items.length} items)</span>
              <span>{formatPrice(subtotal())}</span>
            </div>
            <div className="my-4 border-t" />
            <p className="mb-4 text-sm text-muted-foreground">Please log in to proceed with checkout.</p>
            <Button className="w-full bg-accent text-accent-foreground hover:bg-accent-hover" onClick={() => navigate('/login')}>
              Log in to Checkout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = ['Shipping', 'Coupon', 'Review', 'Payment'] as const;

function isValidUSZipPattern(zip: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(zip.trim());
}

/** First five digits for delivery-zone comparison (accepts ZIP+4 input). */
function zipTo5Digits(zip: string): string {
  const d = zip.replace(/\D/g, '');
  return d.length >= 5 ? d.slice(0, 5) : '';
}

/**
 * Soft address verification via Nominatim (OpenStreetMap).
 * Returns true if at least one result matches the given ZIP and US state.
 * Returns true on network failure so the user is never hard-blocked by an outage.
 */
async function verifyAddressWithNominatim(
  line1: string, city: string, state: string, zip5: string,
): Promise<{ found: boolean }> {
  try {
    const query = `${line1}, ${city}, ${state} ${zip5}, USA`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=us&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return { found: true }; // network issue → don't block
    const data: Array<{ address?: { postcode?: string; state?: string } }> = await res.json();
    if (!data.length) return { found: false };
    const found = data.some(r => {
      const pc = (r.address?.postcode || '').replace(/\D/g, '').slice(0, 5);
      const st = (r.address?.state || '').toLowerCase();
      const zipMatch = pc === zip5;
      const stateMatch = st.includes(state.toLowerCase()) || st.startsWith(state.toLowerCase());
      return zipMatch || stateMatch; // at least one dimension must match
    });
    return { found };
  } catch {
    return { found: true }; // any error → soft pass
  }
}

export default function CheckoutPage() {
  useSyncCartPrices();
  useSyncFreebie();
  const items = useCartStore(s => s.items);
  const { user, token, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const createOrder = useCreateOrder();
  const validateCoupon = useValidateCoupon();
  const { data: themeConfig, isLoading: isThemeConfigLoading } = useThemeConfig();
  const offer = themeConfig?.freebieOffer;
  const lineSubtotal = useMemo(
    () => paidMerchandiseSubtotal(items, offer),
    [items, offer]
  );
  const { data: bestCoupon } = useBestCoupon(lineSubtotal, isAuthenticated);

  const [step, setStep] = useState(1);
  const [paymentSession, setPaymentSession] = useState<CreateOrderResponse | null>(null);
  const [address, setAddress] = useState({
    fullName: user?.name || '',
    line1: user?.address?.line1 || '',
    line2: user?.address?.line2 || '',
    city: user?.address?.city || '',
    state: user?.address?.state || '',
    zip: user?.address?.zip || '',
    country: user?.address?.country || 'US',
  });

  const [couponCode, setCouponCode] = useState('');
  const [zipCodeError, setZipCodeError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [isValidatingAddress, setIsValidatingAddress] = useState(false);
  const [addressWarning, setAddressWarning] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

  const cartSignature = useMemo(
    () => items.map(i => `${i.product.productId}:${i.quantity}`).join('|'),
    [items]
  );

  useEffect(() => {
    setPaymentSession(null);
  }, [cartSignature]);

  const stripePublishableKey = useMemo(() => {
    const configKey = themeConfig?.stripePublishableKey?.trim();
    if (configKey) return configKey;

    const envKey = (import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || import.meta.env.STRIPE_PUBLISHABLE_KEY || '').trim();
    return envKey || '';
  }, [themeConfig?.stripePublishableKey]);

  const stripePromise = useMemo(() => {
    if (!stripePublishableKey) return null;
    return getStripePromise(stripePublishableKey);
  }, [stripePublishableKey]);

  if (!isAuthenticated || !token) return <CheckoutUnauthenticated />;

  if (items.length === 0) {
    navigate('/cart');
    return null;
  }

  // Read tax mode from store config. Defaults to true (Stripe Automatic Tax enabled) for
  // backward compatibility with old configs that don't have this field set explicitly.
  // When true: Stripe computes tax; we show base amount here, Stripe adds tax on top.
  // When false: use custom backend tax rate defined in store config.
  const useStripeTax = themeConfig?.stripeAutoTaxEnabled ?? true;
  const taxRate = useStripeTax ? 0 : (themeConfig?.taxRate ?? 0);
  const sub = lineSubtotal;
  const percentDiscount =
    appliedCoupon && !isFlatCoupon(appliedCoupon)
      ? couponDiscountAmount(sub, 0, appliedCoupon)
      : 0;
  const merchandiseAfterPercent = sub - percentDiscount;
  const shippingPreCoupon = computeShippingFee(
    appliedCoupon && isFlatCoupon(appliedCoupon) ? sub : merchandiseAfterPercent,
    themeConfig
  );
  const flatRedemption =
    appliedCoupon && isFlatCoupon(appliedCoupon)
      ? flatCouponRedemption(sub, shippingPreCoupon, appliedCoupon)
      : null;
  const discountAmount =
    paymentSession?.discount ??
    (flatRedemption ? flatRedemption.applied : percentDiscount);
  const merchandiseAfterDiscount = sub - (flatRedemption?.merchandiseDiscount ?? percentDiscount);
  const estimatedShipping =
    paymentSession?.shippingFee ??
    (flatRedemption
      ? Math.max(0, shippingPreCoupon - flatRedemption.shippingDiscount)
      : computeShippingFee(merchandiseAfterPercent, themeConfig));
  const estimatedTax = merchandiseAfterDiscount * taxRate / 100;
  const estimatedTotal = merchandiseAfterDiscount + estimatedShipping + estimatedTax;
  const couponUnusedFromSession = paymentSession?.couponUnusedAmount ?? 0;
  const flatUnusedPreview = flatRedemption && flatRedemption.unused > 0.005 ? flatRedemption : null;

  const handleApplyCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { toast.error('Please enter a coupon code'); return; }
    try {
      const coupon = await validateCoupon.mutateAsync(code);
      setAppliedCoupon(coupon);
      if (isFlatCoupon(coupon)) {
        const ship = computeShippingFee(sub, themeConfig);
        const red = flatCouponRedemption(sub, ship, coupon);
        toast.success(
          red.unused > 0.005
            ? `Coupon applied — ${formatPrice(red.applied)} off this order`
            : `Coupon applied! ${formatCouponDiscount(coupon)}`,
        );
      } else {
        toast.success(`Applied ${code}`, { description: formatCouponDiscount(coupon) });
      }
    } catch {
      toast.error('Invalid or expired coupon code');
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
  };

  const handleInitializePayment = async () => {
    if (!address.fullName || !address.line1 || !address.city || !address.state || !address.zip) {
      toast.error('Please complete the shipping address before continuing to payment');
      setStep(1);
      return;
    }

    if (paymentSession) {
      setStep(4);
      return;
    }

    setStep(4);

    try {
      const result = await createOrder.mutateAsync({
        items: items.map(i => ({
          productId: i.product.productId,
          qty: i.quantity,
          ...(i.engraving ? { engraving: i.engraving } : {}),
        })),
        shippingAddress: {
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          zip: address.zip,
          country: address.country,
        },
        couponCode: appliedCoupon?.code,
      });
      setPaymentSession(result);
      if (result.noPaymentRequired || result.amountCents === 0) {
        toast.success('No payment required', {
          description: 'Your order total is $0.00. Click Complete order to finish.',
        });
      } else {
        toast.success('Payment session ready', {
          description: 'Complete your secure payment with Stripe.',
        });
      }
    } catch (err) {
      setStep(3);
      toast.error(err instanceof Error ? err.message : 'Failed to place order');
    }
  };

  return (
    <div className="sf-container py-8">
      <h1 className="text-2xl font-bold text-foreground">Checkout</h1>

      {/* Steps */}
      <div className="mt-6 flex items-center gap-2 text-sm">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${step > i + 1 ? 'bg-sf-success text-sf-success-foreground' : step === i + 1 ? 'bg-accent text-accent-foreground' : 'bg-secondary text-muted-foreground'}`}>
              {step > i + 1 ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            <span className={step === i + 1 ? 'font-medium text-foreground' : 'text-muted-foreground'}>{s}</span>
            {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {/* Step 1: Shipping */}
          {step === 1 && (
            <div className="rounded-lg border p-6">
              <h2 className="text-lg font-semibold">Shipping Address</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Full Name</Label><Input value={address.fullName} onChange={e => { setAddress({ ...address, fullName: e.target.value }); setFieldErrors(prev => ({ ...prev, fullName: false })); }} className={`mt-1 ${fieldErrors.fullName ? 'border-destructive ring-1 ring-destructive' : ''}`} /></div>
                <div className="sm:col-span-2">
                  <Label>Address Line 1</Label>
                  <AddressAutocomplete
                    value={address.line1}
                    onChange={val => { setAddress({ ...address, line1: val }); setFieldErrors(prev => ({ ...prev, line1: false })); setAddressWarning(null); }}
                    onSelect={(parsed: ParsedAddress) => { setAddress(prev => ({ ...prev, line1: parsed.line1, city: parsed.city, state: parsed.state, zip: parsed.zip, country: parsed.country })); setFieldErrors(prev => ({ ...prev, line1: false, city: false, state: false, zip: false })); setAddressWarning(null); }}
                    className={`mt-1 ${fieldErrors.line1 ? 'border-destructive ring-1 ring-destructive' : ''}`}
                  />
                </div>
                <div className="sm:col-span-2"><Label>Address Line 2</Label><Input value={address.line2} onChange={e => setAddress({ ...address, line2: e.target.value })} className="mt-1" /></div>
                <div><Label>City</Label><Input value={address.city} onChange={e => { setAddress({ ...address, city: e.target.value }); setFieldErrors(prev => ({ ...prev, city: false })); setAddressWarning(null); }} className={`mt-1 ${fieldErrors.city ? 'border-destructive ring-1 ring-destructive' : ''}`} /></div>
                <div>
                  <Label>State</Label>
                  <select
                    value={address.state}
                    onChange={e => { setAddress({ ...address, state: e.target.value }); setFieldErrors(prev => ({ ...prev, state: false })); setAddressWarning(null); }}
                    className={`mt-1 flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${fieldErrors.state ? 'border-destructive ring-1 ring-destructive' : 'border-input'}`}
                  >
                    <option value="">Select state</option>
                    {US_STATES.map(s => (
                      <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                    ))}
                  </select>
                </div>
                <div><Label>ZIP Code</Label><Input value={address.zip} onChange={e => { setAddress({ ...address, zip: e.target.value }); setFieldErrors(prev => ({ ...prev, zip: false })); setZipCodeError(null); setAddressWarning(null); }} className={`mt-1 ${fieldErrors.zip || zipCodeError ? 'border-destructive ring-1 ring-destructive' : ''}`} /></div>
                <div><Label>Country</Label><Input value={address.country} onChange={e => setAddress({ ...address, country: e.target.value })} className="mt-1" /></div>
              </div>

              {zipCodeError && (
                <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                      <MapPin className="h-5 w-5 text-destructive" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-destructive">Delivery Not Available</p>
                      <p className="mt-1 text-sm text-muted-foreground">{zipCodeError}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Please try a different shipping address within our delivery area, or contact us for assistance.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {addressWarning && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-600/50 dark:bg-amber-900/20 dark:text-amber-300">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <span>{addressWarning}</span>
                </div>
              )}

              <Button
                className="mt-6 bg-accent text-accent-foreground hover:bg-accent-hover"
                disabled={isValidatingAddress}
                onClick={async () => {
                  setZipCodeError(null);
                  setFieldErrors({});
                  // User already saw the warning and clicked Continue again → trust and proceed
                  if (addressWarning) {
                    setAddressWarning(null);
                    setStep(2);
                    return;
                  }
                  const name = address.fullName.trim();
                  const line1 = address.line1.trim();
                  const city = address.city.trim();
                  const state = address.state.trim();
                  const zipRaw = address.zip.trim();
                  if (!name) {
                    setFieldErrors(prev => ({ ...prev, fullName: true }));
                    toast.error('Please enter your full name');
                    return;
                  }
                  if (!line1) {
                    setFieldErrors(prev => ({ ...prev, line1: true }));
                    toast.error('Please enter address line 1');
                    return;
                  }
                  if (!city) {
                    setFieldErrors(prev => ({ ...prev, city: true }));
                    toast.error('Please enter city');
                    return;
                  }
                  if (!state) {
                    setFieldErrors(prev => ({ ...prev, state: true }));
                    toast.error('Please select state');
                    return;
                  }
                  if (!zipRaw) {
                    setFieldErrors(prev => ({ ...prev, zip: true }));
                    toast.error('Please enter ZIP code');
                    return;
                  }
                  if (!isValidUSZipPattern(zipRaw)) {
                    setFieldErrors(prev => ({ ...prev, zip: true }));
                    toast.error('Enter a valid US ZIP code (5 digits or ZIP+4, e.g. 85001 or 85001-1234).');
                    return;
                  }
                  const z5 = zipTo5Digits(zipRaw);
                  if (z5.length !== 5) {
                    setFieldErrors(prev => ({ ...prev, zip: true }));
                    toast.error('Enter a valid US ZIP code.');
                    return;
                  }
                  if (themeConfig?.deliveryZipCodesEnabled && (themeConfig.deliveryZipCodes || []).length > 0) {
                    const allowed = (themeConfig.deliveryZipCodes || []).map((z: string) => zipTo5Digits(z.trim())).filter(Boolean);
                    if (!allowed.includes(z5)) {
                      setFieldErrors(prev => ({ ...prev, zip: true }));
                      setZipCodeError(
                        `We're sorry, but we currently don't deliver to ZIP code "${z5}". Our delivery service is available only in select areas.`
                      );
                      return;
                    }
                  }
                  // Soft address verification via Nominatim
                  setIsValidatingAddress(true);
                  const { found } = await verifyAddressWithNominatim(line1, city, state, z5);
                  setIsValidatingAddress(false);
                  if (!found) {
                    setAddressWarning('Unable to validate address — click Continue to proceed anyway.');
                    return;
                  }
                  setStep(2);
                }}
              >
                {isValidatingAddress ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</> : 'Continue'}
              </Button>
            </div>
          )}

          {/* Step 2: Coupon / Rewards */}
          {step === 2 && (
            <div className="rounded-lg border p-6">
              <h2 className="text-lg font-semibold">Coupon / Rewards</h2>
              <p className="mt-1 text-sm text-muted-foreground">Have a coupon code or rewards to redeem? Enter it below, or skip this step.</p>

              {appliedCoupon ? (
                <div className="mt-4 flex items-center justify-between rounded-md border border-sf-success/30 bg-sf-success/10 p-4">
                  <div className="flex items-center gap-3">
                    <Tag className="h-5 w-5 text-sf-success" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {appliedCoupon.code} — {formatCouponDiscount(appliedCoupon)}
                      </p>
                      {appliedCoupon.description && (
                        <p className="text-xs text-muted-foreground">{appliedCoupon.description}</p>
                      )}
                      <p className="text-xs font-medium text-sf-success">You save {formatPrice(discountAmount)} on this order</p>
                    </div>
                  </div>
                  {flatUnusedPreview ? (
                    <div className="mt-3">
                      <CouponUnusedNotice redemption={flatUnusedPreview} />
                    </div>
                  ) : null}
                  <button onClick={removeCoupon} className="text-muted-foreground hover:text-destructive">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  {bestCoupon && (
                    <div className="mt-4 flex items-center justify-between rounded-md border border-accent/30 bg-accent/10 p-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-accent" />
                        <p className="text-sm">
                          <span className="font-semibold">Best deal for you:</span>{' '}
                          <span className="font-mono">{bestCoupon.code}</span> ({formatCouponDiscount(bestCoupon)})
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAppliedCoupon(bestCoupon);
                          setCouponCode(bestCoupon.code);
                          toast.success(`Applied ${bestCoupon.code}`, {
                            description: formatCouponDiscount(bestCoupon),
                          });
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Input
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Enter coupon code"
                      className="font-mono"
                    />
                    <Button
                      onClick={handleApplyCoupon}
                      disabled={validateCoupon.isPending}
                      className="bg-accent text-accent-foreground hover:bg-accent-hover"
                    >
                      {validateCoupon.isPending ? 'Validating...' : 'Apply'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">Only one coupon can be used per order.</p>
                </>
              )}

              <div className="mt-6 flex gap-3">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="bg-accent text-accent-foreground hover:bg-accent-hover" onClick={() => setStep(3)}>
                  {appliedCoupon ? 'Continue to Review' : 'Skip & Continue'}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="rounded-lg border p-6">
              <h2 className="text-lg font-semibold">Order Review</h2>
              <div className="mt-4 divide-y">
                {items.map(item => (
                  <div key={cartLineKey(item)} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{item.product.name}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      {item.engraving && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <p><span className="font-medium text-foreground">Engrave:</span> {item.engraving.name}</p>
                          <p className="line-clamp-2"><span className="font-medium text-foreground">Message:</span> {item.engraving.message}</p>
                        </div>
                      )}
                    </div>
                    <ProductPriceDisplay product={item.product} quantity={item.quantity} saleClassName="text-sm font-medium text-foreground" />
                  </div>
                ))}
              </div>
              {appliedCoupon && (
                <div className="mt-3 flex items-center justify-between rounded-md bg-sf-success/10 px-3 py-2 text-sm">
                  <span className="text-sf-success font-medium">Coupon: {appliedCoupon.code} ({formatCouponDiscount(appliedCoupon)})</span>
                  <span className="text-sf-success font-medium">-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="mt-4 rounded-md bg-background-subtle p-4 text-sm">
                <p className="font-medium">Shipping to:</p>
                <p className="text-muted-foreground">{address.fullName}, {address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.zip}</p>
              </div>
              <div className="mt-4 flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button className="bg-accent text-accent-foreground hover:bg-accent-hover" onClick={handleInitializePayment}>
                  Continue to Payment
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Payment */}
          {step === 4 && (
            <div className="rounded-lg border p-6">
              <h2 className="text-lg font-semibold">Payment</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your payment will be processed securely via Stripe.
              </p>
              <div className="mt-4 rounded-lg border bg-background-subtle p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" />
                  <div>
                    <p className="font-medium text-foreground">Secure Stripe checkout</p>
                    <p>Payments are handled directly by Stripe.</p>
                  </div>
                </div>
              </div>

              {!isThemeConfigLoading && !stripePublishableKey ? (
                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                  Add a Stripe publishable key in store configuration or set VITE_STRIPE_PUBLISHABLE_KEY for deployment and local builds.
                </div>
              ) : null}

              {createOrder.isPending && !paymentSession ? (
                <div className="mt-6 flex flex-col items-center justify-center rounded-md border border-dashed p-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <p className="mt-3 text-sm text-muted-foreground">Preparing your Stripe payment session…</p>
                </div>
              ) : null}

              {paymentSession?.noPaymentRequired || paymentSession?.amountCents === 0 ? (
                <ZeroAmountCheckout orderId={paymentSession.orderId} />
              ) : null}

              {paymentSession && !paymentSession.noPaymentRequired && paymentSession.amountCents > 0 && stripePromise && paymentSession.clientSecret ? (
                <div className="mt-6">
                  <Elements stripe={stripePromise} options={{ clientSecret: paymentSession.clientSecret }}>
                    <StripePaymentForm orderId={paymentSession.orderId} />
                  </Elements>
                </div>
              ) : null}

              {!createOrder.isPending && !paymentSession && stripePublishableKey ? (
                <div className="mt-6 rounded-md border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">Secure payment session is not ready yet.</p>
                  <Button className="mt-4 bg-accent text-accent-foreground hover:bg-accent-hover" onClick={handleInitializePayment}>
                    Initialize payment
                  </Button>
                </div>
              ) : null}

              <div className="mt-4 flex gap-3">
                <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                {paymentSession ? (
                  <span className="inline-flex items-center rounded-md bg-background-subtle px-3 text-sm text-muted-foreground">
                    Payment amount: {formatPrice(paymentSession.amountCents / 100, paymentSession.currency.toUpperCase())}
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>

        {/* Order Summary Sidebar */}
        <div className="lg:col-span-1">
          <div className="sticky top-20 rounded-lg border p-6">
            <h3 className="text-sm font-semibold">Order Summary</h3>
            <FreebiePromoBanner items={items} offer={offer} config={themeConfig} className="mt-4" />
            <FreeShippingMessage merchandiseSubtotal={merchandiseAfterDiscount} config={themeConfig} className="mt-4" />
            <div className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal ({items.length} items)</span>
                <span>{formatPrice(sub)}</span>
              </div>
              {appliedCoupon && (
                <>
                  <div className="flex justify-between text-sf-success">
                    <span>Discount ({formatCouponDiscount(appliedCoupon)})</span>
                    <span>-{formatPrice(discountAmount)}</span>
                  </div>
                  {(flatUnusedPreview || couponUnusedFromSession > 0.005) && (
                    <div className="pt-1">
                      <CouponUnusedNotice
                        redemption={
                          flatUnusedPreview ?? {
                            faceValue: appliedCoupon.discountAmount ?? 0,
                            applied: discountAmount,
                            unused: couponUnusedFromSession,
                            merchandiseDiscount: 0,
                            shippingDiscount: 0,
                          }
                        }
                      />
                    </div>
                  )}
                </>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>
                  {(paymentSession?.shippingFee ?? estimatedShipping) > 0
                    ? formatPrice(paymentSession?.shippingFee ?? estimatedShipping)
                    : 'Free'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                {paymentSession?.tax != null ? (
                  <span>{formatPrice(paymentSession.tax)}</span>
                ) : useStripeTax ? (
                  <span className="text-xs text-muted-foreground">Calculated at checkout</span>
                ) : taxRate > 0 ? (
                  <span>Est. {taxRate}% &rarr; {formatPrice(estimatedTax)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not configured</span>
                )}
              </div>
              <div className="my-2 border-t" />
              <div className="flex justify-between text-base font-bold">
                <span>{paymentSession ? 'Total' : 'Est. Total'}</span>
                <span>{formatPrice((paymentSession?.total ?? estimatedTotal), paymentSession?.currency?.toUpperCase())}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
