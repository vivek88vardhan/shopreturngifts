import { useEffect, useMemo } from 'react';
import { useThemeConfig } from '@/hooks/useApi';
import { useCartStore } from '@/stores/cartStore';
import { paidMerchandiseSubtotal } from '@/lib/freebie';

/** Keeps the promotional free gift line in sync with cart subtotal and store config. */
export function useSyncFreebie() {
  const { data: themeConfig } = useThemeConfig();
  const offer = themeConfig?.freebieOffer;
  const items = useCartStore(s => s.items);
  const syncFreebie = useCartStore(s => s.syncFreebie);

  const paidSignature = useMemo(() => {
    const paid = paidMerchandiseSubtotal(items, offer);
    const ids = items
      .filter(i => !i.isFreebie)
      .map(i => `${i.product.productId}:${i.quantity}`)
      .join('|');
    return `${paid.toFixed(2)}|${ids}|${offer?.active ?? false}|${offer?.product?.productId ?? ''}`;
  }, [items, offer]);

  useEffect(() => {
    syncFreebie(offer);
  }, [offer, paidSignature, syncFreebie]);
}
