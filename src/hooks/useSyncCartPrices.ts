import { useEffect, useMemo } from 'react';
import { useCartStore } from '@/stores/cartStore';
import { publicApi } from '@/lib/api';
import { clampCartQuantity, maxQtyForStock } from '@/lib/cartQuantity';
import { isFreebieCartItem } from '@/lib/freebie';

/**
 * Syncs cart line quantities to stock, and product price/metadata from the API.
 */
export function useSyncCartPrices() {
  const items = useCartStore((s) => s.items);
  const cartSignature = useMemo(
    () => items.map(i => `${i.product.productId}:${i.quantity}`).join('|'),
    [items]
  );

  useEffect(() => {
    if (items.length === 0) return;

    let cancelled = false;

    async function sync() {
      try {
        const response = await publicApi.getProducts({ limit: 200 });
        const productsMap = new Map(response.items.map((p) => [p.productId, p]));

        if (cancelled) return;

        const { items: currentItems } = useCartStore.getState();
        let hasChanges = false;

        const updatedItems = currentItems.map((cartItem) => {
          const latest = productsMap.get(cartItem.product.productId);
          if (!latest) return cartItem;

          if (cartItem.isFreebie) {
            const product = { ...cartItem.product, ...latest, price: 0 };
            const metaChanged =
              latest.name !== cartItem.product.name ||
              (latest.images?.[0] ?? '') !== (cartItem.product.images?.[0] ?? '') ||
              latest.stock !== cartItem.product.stock;
            if (metaChanged) {
              hasChanges = true;
              if (latest.stock < 1) {
                return { ...cartItem, quantity: 0, product };
              }
              return { ...cartItem, quantity: 1, product };
            }
            return cartItem;
          }

          const cap = maxQtyForStock(latest.stock);
          let nextQty = cartItem.quantity;
          if (cap <= 0) {
            if (nextQty > 0) hasChanges = true;
            nextQty = 0;
          } else if (nextQty > cap) {
            hasChanges = true;
            nextQty = cap;
          }

          const product = { ...cartItem.product, ...latest };
          const priceChanged = latest.price !== cartItem.product.price;
          const metaChanged =
            latest.name !== cartItem.product.name ||
            (latest.images?.[0] ?? '') !== (cartItem.product.images?.[0] ?? '') ||
            latest.stock !== cartItem.product.stock ||
            (latest.compareAtPrice ?? 0) !== (cartItem.product.compareAtPrice ?? 0);

          if (priceChanged || metaChanged || nextQty !== cartItem.quantity) {
            hasChanges = true;
            if (nextQty <= 0) {
              return { ...cartItem, quantity: 0, product };
            }
            return {
              ...cartItem,
              quantity: clampCartQuantity(nextQty, latest.stock),
              product,
            };
          }
          return cartItem;
        });

        const filtered = updatedItems.filter((i) => i.quantity > 0);

        if (hasChanges) {
          useCartStore.setState({ items: filtered });
        }
      } catch {
        // silently fail – cart still works with cached prices
      }
    }

    sync();
    return () => { cancelled = true; };
  }, [cartSignature]);
}
