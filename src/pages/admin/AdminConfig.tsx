import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Check, Loader2, RotateCcw, Upload } from 'lucide-react';
import { toast } from '@/lib/inboxToast';
import { useAdminConfig, useAdminProducts, useUpdateConfig } from '@/hooks/useApi';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminApi } from '@/lib/api';
import { applyThemeColors, DEFAULT_THEME } from '@/lib/theme';
import { formatPrice } from '@/lib/formatters';

const DEFAULT_CONFIG = {
  storeName: 'ShopReturnGifts',
  logoUrl: '',
  heroImageUrl: '',
  heroTagline: 'White-label e-commerce, your way',
  footerText: '',
  primaryColor: DEFAULT_THEME.primaryColor,
  secondaryColor: DEFAULT_THEME.secondaryColor,
  accentColor: DEFAULT_THEME.accentColor,
  currency: 'USD',
  taxRate: 8.5,
  stripePublishableKey: '',
  enableRatings: false,
  enableComments: false,
  lowStockThreshold: 10,
  promoLabel: 'Limited Time Offer',
  promoHeadline: 'Up to 10% Off New Arrivals',
  promoSubtext: "Don't miss out on this season's best deals",
  promoBgImageUrl: '',
  whatsappUrl: '',
  instagramUrl: '',
  facebookUrl: '',
  instagramReelUrls: [] as string[],
  googleAnalyticsId: '',
  rewardsEnabled: false,
  rewardSpendThresholdCents: 10000, // $100
  rewardPointsPerThreshold: 10,     // 10 points per $100
  rewardPointValueCents: 10,        // 1 point = $0.10
  rewardEligibilityDays: 15,        // matches refund window
  deliveryZipCodesEnabled: false,
  deliveryZipCodes: [] as string[],
  stripeAutoTaxEnabled: true,       // Default: use Stripe Automatic Tax
  freeShippingMinOrderAmount: 50,
  shippingFee: 4.99,
  maxQtyPerProduct: 999,
  freebieEnabled: false,
  freebieMinOrderAmount: 50,
  freebieProductId: '',
  freebieStartsAt: '',
  freebieEndsAt: '',
  freebieLabel: 'Free gift on orders $50+',
};

// Sentinel returned by the backend in place of the real Stripe key.
const STRIPE_KEY_MASK = '__stripe_pk_set__';

function parseReelUrls(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeZipInput(zips: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of zips) {
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 5) continue;
    const z5 = digits.slice(0, 5);
    if (seen.has(z5)) continue;
    seen.add(z5);
    out.push(z5);
  }
  return out;
}

function mergeAdminConfig(
  server: Partial<typeof DEFAULT_CONFIG> & { freebieOffer?: unknown }
): typeof DEFAULT_CONFIG {
  const { freebieOffer: _ignored, ...serverFields } = server;
  const merged: typeof DEFAULT_CONFIG = {
    ...DEFAULT_CONFIG,
    ...serverFields,
    deliveryZipCodes: Array.isArray(server.deliveryZipCodes)
      ? normalizeZipInput(server.deliveryZipCodes.map(z => String(z)))
      : [],
    deliveryZipCodesEnabled: !!server.deliveryZipCodesEnabled,
  };
  if (merged.stripePublishableKey === STRIPE_KEY_MASK) {
    merged.stripePublishableKey = '';
  }
  return merged;
}

function buildConfigSavePayload(
  config: typeof DEFAULT_CONFIG,
  stripeKeyDraft: string
): Partial<typeof DEFAULT_CONFIG> & { stripePublishableKey?: string } {
  const { freebieOffer: _fo, stripePublishableKey: _mask, ...rest } = config as typeof config & {
    freebieOffer?: unknown;
    stripePublishableKey?: string;
  };
  const payload: Partial<typeof DEFAULT_CONFIG> & { stripePublishableKey?: string } = {
    ...rest,
    deliveryZipCodes: normalizeZipInput(config.deliveryZipCodes ?? []),
    deliveryZipCodesEnabled: !!config.deliveryZipCodesEnabled,
  };
  if (stripeKeyDraft.trim()) {
    payload.stripePublishableKey = stripeKeyDraft.trim();
  }
  return payload;
}

export default function AdminConfig() {
  const { data: configData, isLoading } = useAdminConfig();
  const { data: productsData } = useAdminProducts();
  const updateConfig = useUpdateConfig();

  const [config, setConfig] = useState({ ...DEFAULT_CONFIG });
  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingPromoBg, setUploadingPromoBg] = useState(false);
  // Stripe key is write-only: never shown, tracked separately from main config.
  const [stripeKeyDraft, setStripeKeyDraft] = useState('');
  const [stripeKeyIsSet, setStripeKeyIsSet] = useState(false);
  // Snapshot of the last-persisted config — used to detect unsaved changes.
  const [savedConfig, setSavedConfig] = useState({ ...DEFAULT_CONFIG });
  const [savedRecently, setSavedRecently] = useState(false);
  const configHydrated = useRef(false);
  /** Raw textarea text so users can add new ZIP lines (trailing newline preserved while typing). */
  const [zipCodesDraft, setZipCodesDraft] = useState('');
  /** Raw textarea text for Instagram reel links (one per line). */
  const [reelsDraft, setReelsDraft] = useState('');

  useEffect(() => {
    if (!configData || configHydrated.current) return;
    configHydrated.current = true;
    const merged = mergeAdminConfig(configData);
    setConfig(merged);
    setSavedConfig(merged);
    setZipCodesDraft((merged.deliveryZipCodes ?? []).join('\n'));
    setReelsDraft((merged.instagramReelUrls ?? []).join('\n'));
    if (configData.stripePublishableKey) {
      setStripeKeyIsSet(true);
    }
  }, [configData]);

  const handleSave = async () => {
    try {
      const payload = buildConfigSavePayload(config, stripeKeyDraft);
      const updated = await updateConfig.mutateAsync(payload);
      const merged = mergeAdminConfig(updated);
      setConfig(merged);
      setSavedConfig(merged);
      setZipCodesDraft((merged.deliveryZipCodes ?? []).join('\n'));
      setReelsDraft((merged.instagramReelUrls ?? []).join('\n'));
      if (stripeKeyDraft.trim()) {
        setStripeKeyDraft('');
        setStripeKeyIsSet(true);
      }
      setSavedRecently(true);
      setTimeout(() => setSavedRecently(false), 2500);
      applyThemeColors(merged.primaryColor, merged.secondaryColor, merged.accentColor);
      toast.success('Store configuration saved and theme applied');
    } catch {
      toast.error('Failed to save configuration');
    }
  };

  const handleDiscard = () => {
    setConfig({ ...savedConfig });
    setZipCodesDraft((savedConfig.deliveryZipCodes ?? []).join('\n'));
    setReelsDraft((savedConfig.instagramReelUrls ?? []).join('\n'));
    setStripeKeyDraft('');
  };

  const handleRestoreDefaults = async () => {
    if (!confirm('Restore all settings to defaults? This will reset branding, colors, and feature toggles.')) return;
    try {
      await updateConfig.mutateAsync(DEFAULT_CONFIG);
      setConfig({ ...DEFAULT_CONFIG });
      setStripeKeyDraft('');
      applyThemeColors(DEFAULT_CONFIG.primaryColor, DEFAULT_CONFIG.secondaryColor, DEFAULT_CONFIG.accentColor);
      toast.success('Settings restored to defaults');
    } catch {
      toast.error('Failed to restore defaults');
    }
  };

  const handleLogoUpload = async (file: File) => {
    try {
      const { uploadUrl, logoUrl } = await adminApi.getLogoUploadUrl();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setConfig({ ...config, logoUrl });
      toast.success('Logo uploaded');
    } catch {
      toast.error('Failed to upload logo');
    }
  };

  const handleHeroImageUpload = async (file: File) => {
    setUploadingHero(true);
    try {
      const { uploadUrl, imageUrl } = await adminApi.getHeroImageUploadUrl();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setConfig({ ...config, heroImageUrl: imageUrl });
      toast.success('Hero background image uploaded');
    } catch {
      toast.error('Failed to upload hero image');
    } finally {
      setUploadingHero(false);
    }
  };

  const handlePromoBgImageUpload = async (file: File) => {
    setUploadingPromoBg(true);
    try {
      const { uploadUrl, imageUrl } = await adminApi.getPromoBgImageUploadUrl();
      await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setConfig({ ...config, promoBgImageUrl: imageUrl });
      toast.success('Promotional banner background uploaded');
    } catch {
      toast.error('Failed to upload promo background image');
    } finally {
      setUploadingPromoBg(false);
    }
  };

  const isDirty = JSON.stringify(config) !== JSON.stringify(savedConfig) || stripeKeyDraft !== '';

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Store Configuration</h1>
          <p className="mt-1 text-sm text-muted-foreground">Configure your store's branding, commerce, and feature settings</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRestoreDefaults} className="gap-2">
          <RotateCcw className="h-4 w-4" /> Restore Defaults
        </Button>
      </div>



      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Branding */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Branding</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Store Name</Label>
              <Input value={config.storeName} onChange={e => setConfig({ ...config, storeName: e.target.value })} className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">Shown in navbar, hero section, and footer</p>
            </div>
            <div>
              <Label>Logo</Label>
              <div className="mt-1 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border-2 border-dashed bg-background-subtle overflow-hidden">
                  {config.logoUrl ? <img src={config.logoUrl} alt="Logo" className="h-full w-full object-contain" /> : <span className="text-xs text-muted-foreground">No logo</span>}
                </div>
                <div className="space-y-1">
                  <input type="file" accept="image/*" id="logo-upload" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); }} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('logo-upload')?.click()}>Upload Logo</Button>
                  {config.logoUrl && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfig({ ...config, logoUrl: '' })}>Remove</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Section */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Hero Section</h2>
          <p className="mt-1 text-xs text-muted-foreground">Customize the homepage welcome banner</p>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Tagline</Label>
              <Input
                value={config.heroTagline}
                onChange={e => setConfig({ ...config, heroTagline: e.target.value })}
                className="mt-1"
                placeholder="White-label e-commerce, your way"
              />
              <p className="mt-1 text-xs text-muted-foreground">Shown in the hero pill badge on the homepage</p>
            </div>
            <div>
              <Label>Background Image</Label>
              <div className="mt-2 flex items-start gap-4">
                <div className="flex h-24 w-40 items-center justify-center rounded-lg border-2 border-dashed bg-background-subtle overflow-hidden">
                  {config.heroImageUrl ? (
                    <img src={config.heroImageUrl} alt="Hero background" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground text-center px-2">No image</span>
                  )}
                </div>
                <div className="space-y-1">
                  <input type="file" accept="image/*" id="hero-upload" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handleHeroImageUpload(file); }} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('hero-upload')?.click()} disabled={uploadingHero}>
                    {uploadingHero ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="mr-2 h-4 w-4" /> Upload Image</>}
                  </Button>
                  {config.heroImageUrl && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfig({ ...config, heroImageUrl: '' })}>Remove</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Theme Colors */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Theme Colors</h2>
          <p className="mt-1 text-xs text-muted-foreground">Applied across the entire storefront</p>
          <div className="mt-4 space-y-4">
            {([
              { key: 'primaryColor', label: 'Primary Color' },
              { key: 'secondaryColor', label: 'Secondary Color' },
              { key: 'accentColor', label: 'Accent Color' },
            ] as const).map(({ key, label }) => (
              <div key={key}>
                <Label>{label}</Label>
                <div className="mt-1 flex items-center gap-2">
                  <input type="color" value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} className="h-9 w-9 cursor-pointer rounded border-0" />
                  <Input value={config[key]} onChange={e => setConfig({ ...config, [key]: e.target.value })} className="flex-1" />
                </div>
              </div>
            ))}
            <div className="rounded-md border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Preview</p>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded" style={{ backgroundColor: config.primaryColor }} />
                <div className="h-8 w-8 rounded" style={{ backgroundColor: config.secondaryColor }} />
                <div className="h-8 w-8 rounded" style={{ backgroundColor: config.accentColor }} />
                <button className="rounded-md px-4 py-2 text-xs font-medium text-white" style={{ backgroundColor: config.accentColor }}>Sample Button</button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Footer</h2>
          <p className="mt-1 text-xs text-muted-foreground">Customize the copyright text in the store footer</p>
          <div className="mt-4">
            <Label>Footer Copyright Text</Label>
            <Input
              value={config.footerText}
              onChange={e => setConfig({ ...config, footerText: e.target.value })}
              className="mt-1"
              placeholder={`© ${new Date().getFullYear()} ${config.storeName}. All rights reserved.`}
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave empty to use default: "© {new Date().getFullYear()} {config.storeName}. All rights reserved."</p>
          </div>
        </div>

        {/* Commerce Settings */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Commerce Settings</h2>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Currency</Label>
              <Input value={config.currency} onChange={e => setConfig({ ...config, currency: e.target.value })} className="mt-1" />
            </div>

            {/* Tax Configuration — toggle and custom rate are mutually exclusive */}
            <div className="rounded-md border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Stripe Automatic Tax</p>
                  <p className="text-xs text-muted-foreground">
                    Let Stripe compute the correct tax for each order based on the customer's address.
                    Disable this to set a fixed custom tax rate instead.
                  </p>
                </div>
                <Switch
                  checked={config.stripeAutoTaxEnabled ?? true}
                  onCheckedChange={v => setConfig({ ...config, stripeAutoTaxEnabled: v })}
                />
              </div>

              <div className={(config.stripeAutoTaxEnabled ?? true) ? 'opacity-50 pointer-events-none' : ''}>
                <Label htmlFor="custom-tax-rate">Custom Tax Rate (%)</Label>
                <Input
                  id="custom-tax-rate"
                  type="number"
                  step="0.1"
                  min={0}
                  value={config.taxRate}
                  onChange={e => setConfig({ ...config, taxRate: Number(e.target.value) })}
                  className="mt-1"
                  disabled={config.stripeAutoTaxEnabled ?? true}
                  aria-disabled={config.stripeAutoTaxEnabled ?? true}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  {(config.stripeAutoTaxEnabled ?? true)
                    ? 'Custom rate is inactive — tax is managed automatically by Stripe.'
                    : 'Applied to all taxable order items at checkout.'}
                </p>
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-4">
              <div>
                <p className="text-sm font-medium">Shipping</p>
                <p className="text-xs text-muted-foreground">
                  Orders below the minimum merchandise amount (after discounts) are charged the flat shipping fee.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="free-shipping-min">Free shipping minimum ($)</Label>
                  <Input
                    id="free-shipping-min"
                    type="number"
                    step="0.01"
                    min={0}
                    value={config.freeShippingMinOrderAmount ?? 50}
                    onChange={e => setConfig({ ...config, freeShippingMinOrderAmount: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="shipping-fee">Shipping fee ($)</Label>
                  <Input
                    id="shipping-fee"
                    type="number"
                    step="0.01"
                    min={0}
                    value={config.shippingFee ?? 4.99}
                    onChange={e => setConfig({ ...config, shippingFee: Number(e.target.value) })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="max-qty-per-product">Max quantity per product (per order)</Label>
                <Input
                  id="max-qty-per-product"
                  type="number"
                  step="1"
                  min={1}
                  value={config.maxQtyPerProduct ?? 999}
                  onChange={e => setConfig({ ...config, maxQtyPerProduct: Number(e.target.value) })}
                  className="mt-1 max-w-xs"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Customers cannot add more than this many units of the same item in one order (default 999 — effectively limited by available stock).
                </p>
              </div>
            </div>

            <div>
              <Label>Stripe Publishable Key</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={stripeKeyDraft}
                onChange={e => setStripeKeyDraft(e.target.value)}
                className="mt-1"
                placeholder={stripeKeyIsSet && !stripeKeyDraft ? 'Saved — enter a new value to replace' : 'pk_live_...'}
              />
              {stripeKeyIsSet && !stripeKeyDraft && (
                <p className="mt-1 text-xs text-green-600 dark:text-green-500">A key is already saved. Type a new value above to replace it.</p>
              )}
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Feature Toggles</h2>
          <p className="mt-1 text-xs text-muted-foreground">Enable or disable store-wide features</p>
          <div className="mt-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Product Ratings</p>
                <p className="text-xs text-muted-foreground">Allow users to rate products (1–5 stars)</p>
              </div>
              <Switch checked={config.enableRatings} onCheckedChange={v => setConfig({ ...config, enableRatings: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Product Comments</p>
                <p className="text-xs text-muted-foreground">Allow users to leave comments on products</p>
              </div>
              <Switch checked={config.enableComments} onCheckedChange={v => setConfig({ ...config, enableComments: v })} />
            </div>
          </div>
        </div>

        {/* Free gift promotion */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Free gift promotion</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            When a customer&apos;s paid cart subtotal meets the minimum, the free item is added at $0 (limited time optional).
          </p>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable free gift offer</p>
                <p className="text-xs text-muted-foreground">Shown in cart and applied at checkout</p>
              </div>
              <Switch
                checked={!!config.freebieEnabled}
                onCheckedChange={v => setConfig({ ...config, freebieEnabled: v })}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="freebie-min">Minimum order amount ($)</Label>
                <Input
                  id="freebie-min"
                  type="number"
                  step="0.01"
                  min={0}
                  value={config.freebieMinOrderAmount ?? 50}
                  onChange={e => setConfig({ ...config, freebieMinOrderAmount: Number(e.target.value) })}
                  className="mt-1"
                  disabled={!config.freebieEnabled}
                />
              </div>
              <div>
                <Label htmlFor="freebie-product">Free gift product</Label>
                <Select
                  value={config.freebieProductId || ''}
                  onValueChange={v => setConfig({ ...config, freebieProductId: v })}
                  disabled={!config.freebieEnabled}
                >
                  <SelectTrigger id="freebie-product" className="mt-1">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsData?.items ?? [])
                      .filter(p => p.isActive)
                      .map(p => (
                        <SelectItem key={p.productId} value={p.productId}>
                          {p.name} ({formatPrice(p.price)})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="freebie-label">Customer message</Label>
              <Input
                id="freebie-label"
                value={config.freebieLabel ?? ''}
                onChange={e => setConfig({ ...config, freebieLabel: e.target.value })}
                className="mt-1"
                placeholder="Free gift on orders $50+"
                disabled={!config.freebieEnabled}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="freebie-starts">Starts (optional)</Label>
                <Input
                  id="freebie-starts"
                  type="datetime-local"
                  value={config.freebieStartsAt ? config.freebieStartsAt.slice(0, 16) : ''}
                  onChange={e =>
                    setConfig({
                      ...config,
                      freebieStartsAt: e.target.value ? new Date(e.target.value).toISOString() : '',
                    })
                  }
                  className="mt-1"
                  disabled={!config.freebieEnabled}
                />
              </div>
              <div>
                <Label htmlFor="freebie-ends">Ends (optional)</Label>
                <Input
                  id="freebie-ends"
                  type="datetime-local"
                  value={config.freebieEndsAt ? config.freebieEndsAt.slice(0, 16) : ''}
                  onChange={e =>
                    setConfig({
                      ...config,
                      freebieEndsAt: e.target.value ? new Date(e.target.value).toISOString() : '',
                    })
                  }
                  className="mt-1"
                  disabled={!config.freebieEnabled}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Promotional Banner */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Promotional Banner</h2>
          <p className="mt-1 text-xs text-muted-foreground">Customize the promotional banner on the homepage</p>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Label</Label>
              <Input value={config.promoLabel} onChange={e => setConfig({ ...config, promoLabel: e.target.value })} className="mt-1" placeholder="Limited Time Offer" />
            </div>
            <div>
              <Label>Headline</Label>
              <Input value={config.promoHeadline} onChange={e => setConfig({ ...config, promoHeadline: e.target.value })} className="mt-1" placeholder="Up to 10% Off New Arrivals" />
            </div>
            <div>
              <Label>Subtext</Label>
              <Input value={config.promoSubtext} onChange={e => setConfig({ ...config, promoSubtext: e.target.value })} className="mt-1" placeholder="Don't miss out on this season's best deals" />
            </div>
            <div>
              <Label>Background Image</Label>
              <div className="mt-2 flex items-start gap-4">
                <div className="flex h-24 w-40 items-center justify-center rounded-lg border-2 border-dashed bg-background-subtle overflow-hidden">
                  {config.promoBgImageUrl ? (
                    <img src={config.promoBgImageUrl} alt="Promo background" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xs text-muted-foreground text-center px-2">No image</span>
                  )}
                </div>
                <div className="space-y-1">
                  <input type="file" accept="image/*" id="promo-bg-upload" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) handlePromoBgImageUpload(file); }} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('promo-bg-upload')?.click()} disabled={uploadingPromoBg}>
                    {uploadingPromoBg ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...</> : <><Upload className="mr-2 h-4 w-4" /> Upload Image</>}
                  </Button>
                  {config.promoBgImageUrl && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfig({ ...config, promoBgImageUrl: '' })}>Remove</Button>
                  )}
                </div>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Optional background image for the promotional banner section</p>
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Social Links</h2>
          <p className="mt-1 text-xs text-muted-foreground">Shown in the Community section on the homepage. Leave a field blank to hide that card.</p>
          <div className="mt-4 space-y-4">
            <div>
              <Label>WhatsApp URL</Label>
              <Input
                value={config.whatsappUrl}
                onChange={e => setConfig({ ...config, whatsappUrl: e.target.value })}
                className="mt-1"
                placeholder="https://chat.whatsapp.com/..."
                type="url"
              />
            </div>
            <div>
              <Label>Instagram URL</Label>
              <Input
                value={config.instagramUrl}
                onChange={e => setConfig({ ...config, instagramUrl: e.target.value })}
                className="mt-1"
                placeholder="https://instagram.com/yourhandle"
                type="url"
              />
            </div>
            <div>
              <Label>Facebook URL</Label>
              <Input
                value={config.facebookUrl}
                onChange={e => setConfig({ ...config, facebookUrl: e.target.value })}
                className="mt-1"
                placeholder="https://facebook.com/yourpage"
                type="url"
              />
            </div>
          </div>
        </div>

        {/* Homepage Reels */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Homepage Reels — "Real Party Moments"</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Paste Instagram reel or post links, one per line. The homepage embeds these in order. Leave empty to show the default curated showcase.
          </p>
          <div className="mt-4">
            <Label htmlFor="reel-urls">Instagram reel links</Label>
            <textarea
              id="reel-urls"
              value={reelsDraft}
              onChange={e => {
                setReelsDraft(e.target.value);
                setConfig({ ...config, instagramReelUrls: parseReelUrls(e.target.value) });
              }}
              rows={6}
              spellCheck={false}
              placeholder={"https://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/reel/XYZ789/"}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {parseReelUrls(reelsDraft).length} reel{parseReelUrls(reelsDraft).length === 1 ? '' : 's'} configured. Supports /reel/, /p/, and /tv/ links.
            </p>
          </div>
        </div>

        {/* Analytics & Tracking */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Analytics & Tracking</h2>
          <p className="mt-1 text-xs text-muted-foreground">Connect Google Analytics to track visitor behavior across all pages</p>
          <div className="mt-4">
            <Label>Google Analytics Measurement ID</Label>
            <Input
              value={config.googleAnalyticsId}
              onChange={e => setConfig({ ...config, googleAnalyticsId: e.target.value.trim() })}
              className="mt-1"
              placeholder="G-XXXXXXXXXX"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Enter your GA4 Measurement ID (starts with G-). Leave empty to disable tracking.
            </p>
          </div>
        </div>

        {/* Rewards Program */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Rewards Program</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Customers earn points on delivered orders. Points become available after the eligibility window
            and can be redeemed at checkout for a discount.
          </p>
          <div className="mt-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Enable Rewards</p>
                <p className="text-xs text-muted-foreground">Turn the loyalty program on or off store-wide</p>
              </div>
              <Switch
                checked={!!config.rewardsEnabled}
                onCheckedChange={v => setConfig({ ...config, rewardsEnabled: v })}
              />
            </div>

            <div className={config.rewardsEnabled ? '' : 'opacity-60 pointer-events-none'}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Spend Threshold ({config.currency})</Label>
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={(config.rewardSpendThresholdCents ?? 0) / 100}
                    onChange={e =>
                      setConfig({ ...config, rewardSpendThresholdCents: Math.round(Number(e.target.value) * 100) })
                    }
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Amount a customer must spend to earn the points below</p>
                </div>
                <div>
                  <Label>Points Earned per Threshold</Label>
                  <Input
                    type="number"
                    min={1}
                    value={config.rewardPointsPerThreshold ?? 0}
                    onChange={e => setConfig({ ...config, rewardPointsPerThreshold: Number(e.target.value) })}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Points credited each time a customer hits the threshold</p>
                </div>
                <div>
                  <Label>Point Value ({config.currency})</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={(config.rewardPointValueCents ?? 0) / 100}
                    onChange={e =>
                      setConfig({ ...config, rewardPointValueCents: Math.round(Number(e.target.value) * 100) })
                    }
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">How much one point is worth at redemption</p>
                </div>
                <div>
                  <Label>Eligibility Window (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={config.rewardEligibilityDays ?? 0}
                    onChange={e => setConfig({ ...config, rewardEligibilityDays: Number(e.target.value) })}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">Days after delivery before earned points become redeemable</p>
                </div>
              </div>

              <div className="mt-4 rounded-md border bg-background-subtle p-4">
                <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
                <p className="text-sm">
                  Customers earn{' '}
                  <span className="font-semibold">{config.rewardPointsPerThreshold ?? 0} points</span>{' '}
                  for every{' '}
                  <span className="font-semibold">
                    {formatPrice((config.rewardSpendThresholdCents ?? 0) / 100, config.currency)}
                  </span>{' '}
                  spent. Each point is worth{' '}
                  <span className="font-semibold">
                    {formatPrice((config.rewardPointValueCents ?? 0) / 100, config.currency)}
                  </span>{' '}
                  at checkout, available {config.rewardEligibilityDays ?? 0} days after delivery.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Stock Alert Settings</h2>
          <p className="mt-1 text-xs text-muted-foreground">Configure when to receive low stock notifications</p>
          <div className="mt-4 max-w-xs">
            <Label>Low Stock Threshold (units)</Label>
            <Input
              type="number"
              value={config.lowStockThreshold}
              onChange={e => setConfig({ ...config, lowStockThreshold: Number(e.target.value) })}
              className="mt-1"
              min={1}
            />
            <p className="mt-1 text-xs text-muted-foreground">Products with stock at or below this number will trigger alerts</p>
          </div>
        </div>

        {/* Delivery Zones */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-sm font-semibold">Delivery Zones</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Restrict delivery to specific ZIP codes. Customers with addresses outside the allowed list will be blocked at checkout.
          </p>
          <div className="mt-4 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Restrict by ZIP Code</p>
                <p className="text-xs text-muted-foreground">Only allow delivery to the ZIPs listed below</p>
              </div>
              <Switch
                checked={!!config.deliveryZipCodesEnabled}
                onCheckedChange={v => setConfig({ ...config, deliveryZipCodesEnabled: v })}
              />
            </div>
            <div className={config.deliveryZipCodesEnabled ? '' : 'opacity-80'}>
              <Label>Allowed ZIP Codes</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                rows={8}
                placeholder={"85001\n85002\n85003"}
                value={zipCodesDraft}
                onChange={e => {
                  setZipCodesDraft(e.target.value);
                  const normalized = normalizeZipInput(
                    e.target.value.split('\n').map(z => z.trim()).filter(Boolean),
                  );
                  setConfig({ ...config, deliveryZipCodes: normalized });
                }}
                onBlur={() => {
                  const normalized = normalizeZipInput(
                    zipCodesDraft.split('\n').map(z => z.trim()).filter(Boolean),
                  );
                  setConfig({ ...config, deliveryZipCodes: normalized });
                  setZipCodesDraft(normalized.join('\n'));
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Enter one ZIP code per line (5 digits; ZIP+4 is shortened to 5 digits on save).{' '}
                {(config.deliveryZipCodes ?? []).length} ZIP{(config.deliveryZipCodes ?? []).length !== 1 ? 's' : ''} configured.
                {!config.deliveryZipCodesEnabled && (config.deliveryZipCodes ?? []).length > 0 && (
                  <span className="block mt-1 text-amber-700 dark:text-amber-400">
                    Turn on &quot;Restrict by ZIP Code&quot; above for these ZIPs to apply at checkout.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent-hover gap-2"
          onClick={handleSave}
          disabled={updateConfig.isPending || (!isDirty && !savedRecently)}
        >
          {updateConfig.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
          ) : savedRecently && !isDirty ? (
            <><Check className="h-4 w-4" /> Saved</>
          ) : (
            'Save Configuration'
          )}
        </Button>
      </div>
    </div>
  );
}
