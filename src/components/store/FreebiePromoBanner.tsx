import { Gift } from 'lucide-react';
import { formatPrice } from '@/lib/formatters';
import {
  amountUntilFreebie,
  freebieLabel,
  qualifiesForFreebie,
} from '@/lib/freebie';
import type { CartItem, FreebieOffer, StoreConfig } from '@/types';

type Props = {
  items: CartItem[];
  offer?: FreebieOffer | null;
  config?: StoreConfig | null;
  className?: string;
};

export default function FreebiePromoBanner({ items, offer, config, className = '' }: Props) {
  if (!offer?.active || !offer.product) return null;

  const qualified = qualifiesForFreebie(items, offer);
  const remaining = amountUntilFreebie(items, offer);
  const label = freebieLabel(offer, config);

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        qualified
          ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900'
          : 'border-amber-200 bg-amber-50/60 text-amber-950'
      } ${className}`}
    >
      <div className="flex gap-3">
        <Gift className={`h-5 w-5 shrink-0 ${qualified ? 'text-emerald-600' : 'text-amber-600'}`} />
        <div>
          <p className="font-medium">{label}</p>
          {qualified ? (
            <p className="mt-0.5 text-xs opacity-90">
              <span className="font-semibold">{offer.product.name}</span> added to your cart at{' '}
              <span className="font-semibold">$0.00</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs opacity-90">
              Add {formatPrice(remaining)} more to unlock{' '}
              <span className="font-semibold">{offer.product.name}</span> free
            </p>
          )}
          {offer.endsAt && (
            <p className="mt-1 text-[10px] opacity-75">Offer ends {new Date(offer.endsAt).toLocaleString()}</p>
          )}
        </div>
      </div>
    </div>
  );
}
