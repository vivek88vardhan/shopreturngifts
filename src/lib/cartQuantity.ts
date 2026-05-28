import { getMaxQtyPerProduct } from '@/lib/orderLimits';

/** Per-line cap aligned with backend CreateOrder: min(store max per SKU, available stock). */
export function maxQtyForStock(stock: number): number {
  if (stock <= 0) return 0;
  return Math.min(getMaxQtyPerProduct(), stock);
}

export function clampCartQuantity(qty: number, stock: number): number {
  const max = maxQtyForStock(stock);
  if (max <= 0) return 0;
  return Math.min(Math.max(1, qty), max);
}

/**
 * Digits-only sanitiser for cart qty text inputs.
 * Caps the in-progress value at min(maxQtyPerProduct, stock) so the
 * user sees the correct hard limit while they are still typing.
 * stock is optional — pass it when available (cart line inputs) for
 * immediate per-product stock enforcement.
 */
export function sanitizeCartQtyInput(raw: string, stock?: number): string {
  const cap = stock != null && stock > 0 ? maxQtyForStock(stock) : getMaxQtyPerProduct();
  const d = raw.replace(/\D/g, '');
  if (d === '') return '';
  const n = parseInt(d, 10);
  if (Number.isNaN(n)) return '';
  if (n > cap) return String(cap);
  return d;
}
