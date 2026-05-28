import { Truck } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import { amountUntilFreeShipping, computeShippingFee, effectiveShippingConfig } from '@/lib/shipping';
import type { StoreConfig } from '@/types';

export default function FreeShippingMessage({
  merchandiseSubtotal,
  config,
  className = '',
}: {
  merchandiseSubtotal: number;
  config?: Pick<StoreConfig, 'freeShippingMinOrderAmount' | 'shippingFee'> | null;
  className?: string;
}) {
  const { freeShippingMinOrderAmount, shippingFee } = effectiveShippingConfig(config);
  const fee = computeShippingFee(merchandiseSubtotal, config);
  const remaining = amountUntilFreeShipping(merchandiseSubtotal, freeShippingMinOrderAmount);

  if (shippingFee <= 0) return null;

  const qualified = fee === 0;

  return (
    <div
      className={`rounded-md border px-3 py-2.5 text-sm ${qualified ? 'border-green-200/80 bg-green-50/80 text-green-900 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-100' : 'border-border bg-muted/40 text-muted-foreground'} ${className}`}
    >
      <div className="flex items-start gap-2">
        <Truck className={`mt-0.5 h-4 w-4 shrink-0 ${qualified ? 'text-green-700 dark:text-green-400' : 'text-accent'}`} />
        <div>
          {qualified ? (
            <p className="font-medium">You&apos;ve qualified for free shipping!</p>
          ) : (
            <>
              <p>
                Add <span className="font-semibold text-foreground">{formatPrice(remaining)}</span> more for{' '}
                <span className="font-semibold text-foreground">free shipping</span>.
              </p>
              <p className="mt-1 text-xs">
                Orders under {formatPrice(freeShippingMinOrderAmount)} include a {formatPrice(shippingFee)} shipping fee.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
