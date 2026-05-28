import type { CartItem, FreebieOffer, Product, StoreConfig } from '@/types';

export function freebieProductId(offer?: FreebieOffer | null): string | null {
  const id = offer?.product?.productId?.trim();
  return id || null;
}

export function isFreebieCartItem(item: CartItem, offer?: FreebieOffer | null): boolean {
  if (item.isFreebie) return true;
  const pid = freebieProductId(offer);
  return !!pid && item.product.productId === pid && item.product.price === 0;
}

export function paidMerchandiseSubtotal(items: CartItem[], offer?: FreebieOffer | null): number {
  return items.reduce((sum, i) => {
    if (isFreebieCartItem(i, offer)) return sum;
    return sum + i.product.price * i.quantity;
  }, 0);
}

export function qualifiesForFreebie(
  items: CartItem[],
  offer?: FreebieOffer | null
): boolean {
  if (!offer?.active || !offer.product) return false;
  const min = offer.minOrderAmount ?? 50;
  return paidMerchandiseSubtotal(items, offer) >= min;
}

export function amountUntilFreebie(items: CartItem[], offer?: FreebieOffer | null): number {
  if (!offer?.active) return 0;
  const min = offer.minOrderAmount ?? 50;
  return Math.max(0, min - paidMerchandiseSubtotal(items, offer));
}

export function freebieLabel(offer?: FreebieOffer | null, config?: StoreConfig | null): string {
  if (offer?.label?.trim()) return offer.label.trim();
  const min = offer?.minOrderAmount ?? config?.freebieMinOrderAmount ?? 50;
  return `Free gift on orders $${min}+`;
}

export function toFreebieCartProduct(product: Product): Product {
  return { ...product, price: 0 };
}
