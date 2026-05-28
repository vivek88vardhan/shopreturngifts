import { useEffect } from 'react';
import StoreNavbar from '@/components/store/StoreNavbar';
import CartDrawer from '@/components/store/CartDrawer';
import { Outlet } from 'react-router-dom';
import { useThemeConfig } from '@/hooks/useApi';
import { applyThemeFromConfig, writeThemeSnapshot } from '@/lib/themeSnapshot';
import { resolveBrandLogoUrl } from '@/lib/storeBranding';
import { configureOrderLimits } from '@/lib/orderLimits';
import { useCartStore } from '@/stores/cartStore';

export default function StoreLayout() {
  const { data: theme } = useThemeConfig();

  useEffect(() => {
    if (!theme) return;
    applyThemeFromConfig(theme);
    writeThemeSnapshot(theme);
  }, [theme]);

  useEffect(() => {
    configureOrderLimits(theme);
    for (const item of useCartStore.getState().items) {
      useCartStore.getState().updateQuantity(item.product.productId, item.quantity);
    }
  }, [theme?.maxQtyPerProduct]);

  const storeName = theme?.storeName || 'ShopReturnGifts';
  const gaId = theme?.googleAnalyticsId;

  useEffect(() => {
    document.title = storeName;
  }, [storeName]);

  useEffect(() => {
    if (!gaId || !/^G-[A-Z0-9]+$/i.test(gaId)) return;

    const scriptId = 'ga-gtag-script';
    if (document.getElementById(scriptId)) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
    document.head.appendChild(script);

    const inline = document.createElement('script');
    inline.id = 'ga-gtag-inline';
    inline.textContent = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`;
    document.head.appendChild(inline);

    return () => {
      document.getElementById(scriptId)?.remove();
      document.getElementById('ga-gtag-inline')?.remove();
    };
  }, [gaId]);
  const logoUrl = resolveBrandLogoUrl(theme);
  const footerText = theme?.footerText || `© ${new Date().getFullYear()} ${storeName}. All rights reserved.`;

  return (
    <div className="flex min-h-screen min-w-0 flex-col">
      <StoreNavbar storeName={storeName} logoUrl={logoUrl} />
      <CartDrawer />
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
      <footer className="border-t bg-card py-8">
        <div className="sf-container">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              {logoUrl ? (
                <img src={logoUrl} alt={storeName} className="h-6 w-auto max-w-[100px] object-contain" decoding="async" />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
                  <span className="text-[10px] font-bold text-primary-foreground">{storeName.charAt(0)}</span>
                </div>
              )}
              <span className="text-sm font-medium text-muted-foreground">{storeName}</span>
            </div>
            <p className="text-xs text-muted-foreground">{footerText}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
