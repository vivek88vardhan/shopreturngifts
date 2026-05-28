import type { StoreConfig } from '@/types';

export const DEFAULT_FREE_SHIPPING_MIN = 50;
export const DEFAULT_SHIPPING_FEE = 4.99;

export function effectiveShippingConfig(config?: Pick<StoreConfig, 'freeShippingMinOrderAmount' | 'shippingFee'> | null) {
  let freeShippingMinOrderAmount = DEFAULT_FREE_SHIPPING_MIN;
  let shippingFee = DEFAULT_SHIPPING_FEE;
  if (config) {
    if (config.freeShippingMinOrderAmount != null && config.freeShippingMinOrderAmount > 0) {
      freeShippingMinOrderAmount = config.freeShippingMinOrderAmount;
    }
    if (config.shippingFee != null && config.shippingFee > 0) {
      shippingFee = config.shippingFee;
    }
  }
  return { freeShippingMinOrderAmount, shippingFee };
}

/** Shipping charged on merchandise subtotal (after coupon at checkout). */
export function computeShippingFee(merchandiseSubtotal: number, config?: Pick<StoreConfig, 'freeShippingMinOrderAmount' | 'shippingFee'> | null): number {
  const { freeShippingMinOrderAmount, shippingFee } = effectiveShippingConfig(config);
  if (merchandiseSubtotal >= freeShippingMinOrderAmount) return 0;
  return shippingFee;
}

export function amountUntilFreeShipping(merchandiseSubtotal: number, freeShippingMinOrderAmount: number): number {
  return Math.max(0, freeShippingMinOrderAmount - merchandiseSubtotal);
}
