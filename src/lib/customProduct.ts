import type { CartItem, Product } from '@/types';

/** Category name that triggers mandatory engraving personalization. */
export const CUSTOM_CATEGORY = 'Custom';

/** True when a product belongs to the "Custom" (engraving) category. */
export function isCustomProduct(product?: Pick<Product, 'category'> | null): boolean {
  return !!product && product.category?.trim().toLowerCase() === CUSTOM_CATEGORY.toLowerCase();
}

/** Stable key for a cart line — personalized lines use their unique lineId. */
export function cartLineKey(item: CartItem): string {
  return item.lineId ?? item.product.productId;
}
