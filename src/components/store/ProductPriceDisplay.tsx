import type { Product } from '@/types';
import { formatPrice } from '@/lib/formatters';

function showCompareAt(product: Product): boolean {
  const c = product.compareAtPrice;
  return typeof c === 'number' && c > product.price + 0.0001;
}

type Props = {
  product: Product;
  /** When set (e.g. cart qty), both list and sale amounts are multiplied for display. */
  quantity?: number;
  /** outer wrapper */
  className?: string;
  /** struck-through compare-at price */
  compareClassName?: string;
  /** current sale price */
  saleClassName?: string;
};

/**
 * Renders list (compare-at) price struck through when it is above the current price.
 */
export function ProductPriceDisplay({
  product,
  quantity = 1,
  className = '',
  compareClassName = 'text-sm text-muted-foreground line-through decoration-muted-foreground',
  saleClassName = 'font-bold text-foreground',
}: Props) {
  const q = quantity > 0 ? quantity : 1;
  const sale = showCompareAt(product);
  const compareTotal = sale ? (product.compareAtPrice! * q) : 0;
  const priceTotal = product.price * q;
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 gap-y-0 ${className}`}>
      {sale && (
        <span className={compareClassName} aria-label={`Was ${formatPrice(compareTotal)}`}>
          {formatPrice(compareTotal)}
        </span>
      )}
      <span className={saleClassName}>{formatPrice(priceTotal)}</span>
    </span>
  );
}
