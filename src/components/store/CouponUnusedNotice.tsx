import { Info } from 'lucide-react';
import { formatCouponUnusedMessage, type FlatCouponRedemption } from '@/lib/couponDiscount';

export default function CouponUnusedNotice({ redemption }: { redemption: FlatCouponRedemption }) {
  if (redemption.unused <= 0.005) return null;

  return (
    <div className="rounded-md border border-amber-200/80 bg-amber-50/80 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{formatCouponUnusedMessage(redemption)}</p>
      </div>
    </div>
  );
}
