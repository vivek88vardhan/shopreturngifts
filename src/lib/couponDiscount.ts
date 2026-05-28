import type { Coupon } from '@/types';

export type CouponDiscountType = 'percent' | 'flat';

export function isFlatCoupon(coupon: Pick<Coupon, 'discountType' | 'discountAmount' | 'discountPercent'>): boolean {
  if (coupon.discountType === 'flat') return true;
  return (coupon.discountAmount ?? 0) > 0 && (coupon.discountPercent ?? 0) <= 0;
}

export interface FlatCouponRedemption {
  faceValue: number;
  applied: number;
  unused: number;
  merchandiseDiscount: number;
  shippingDiscount: number;
}

/** Flat coupons apply to merchandise + shipping (up to face value). */
export function flatCouponRedemption(
  merchandiseSubtotal: number,
  shippingFee: number,
  coupon: Pick<Coupon, 'discountAmount'>
): FlatCouponRedemption {
  const faceValue = coupon.discountAmount ?? 0;
  const eligible = Math.max(0, merchandiseSubtotal) + Math.max(0, shippingFee);
  if (faceValue <= 0 || eligible <= 0) {
    return {
      faceValue,
      applied: 0,
      unused: faceValue,
      merchandiseDiscount: 0,
      shippingDiscount: 0,
    };
  }
  const applied = Math.min(faceValue, eligible);
  const unused = Math.max(0, faceValue - applied);
  const merchandiseDiscount = Math.min(applied, merchandiseSubtotal);
  const shippingDiscount = applied - merchandiseDiscount;
  return { faceValue, applied, unused, merchandiseDiscount, shippingDiscount };
}

/**
 * Order discount in dollars. For flat coupons include estimated shipping so delivery can be covered.
 */
export function couponDiscountAmount(
  merchandiseSubtotal: number,
  shippingFee: number,
  coupon: Pick<Coupon, 'discountType' | 'discountAmount' | 'discountPercent'>
): number {
  if (isFlatCoupon(coupon)) {
    return flatCouponRedemption(merchandiseSubtotal, shippingFee, coupon).applied;
  }
  if (merchandiseSubtotal <= 0) return 0;
  const pct = coupon.discountPercent ?? 0;
  if (pct <= 0) return 0;
  return merchandiseSubtotal * pct / 100;
}

export function formatCouponDiscount(coupon: Pick<Coupon, 'discountType' | 'discountAmount' | 'discountPercent'>): string {
  if (isFlatCoupon(coupon)) {
    return `$${(coupon.discountAmount ?? 0).toFixed(2)} off`;
  }
  return `${coupon.discountPercent}% off`;
}

export function formatCouponUnusedMessage(redemption: FlatCouponRedemption): string {
  const { faceValue, applied, unused } = redemption;
  return (
    `This order uses ${formatMoney(applied)} of your $${faceValue.toFixed(2)} coupon` +
    (unused > 0.005
      ? ` ($${unused.toFixed(2)} will not carry over and cannot be used on a future order).`
      : '.')
  );
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
