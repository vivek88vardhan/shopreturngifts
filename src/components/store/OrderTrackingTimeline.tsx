import { Check } from 'lucide-react';
import { formatDateTime } from '@/lib/formatters';
import type { OrderStatus } from '@/types';

const STEPS: { key: string; label: string; description: string }[] = [
  { key: 'placed', label: 'Order placed', description: 'We received your order.' },
  { key: 'processing', label: 'Processing', description: 'We are preparing your items.' },
  { key: 'ready', label: 'Ready for delivery', description: 'Your order is on the way.' },
  { key: 'delivered', label: 'Delivered', description: 'Your order has arrived.' },
];

function stepIndexForStatus(status: OrderStatus): number {
  switch (status) {
    case 'Pending':
      return 0;
    case 'Paid':
    case 'Processing':
      return 1;
    case 'Shipped':
      return 2;
    case 'Delivered':
      return 3;
    default:
      return -1;
  }
}

function subtitleForStep(
  stepIdx: number,
  status: OrderStatus,
  paidAt?: string,
  deliveredAt?: string
): string | undefined {
  if (stepIdx === 0 && status === 'Pending') {
    return 'Complete payment to confirm your order.';
  }
  if (stepIdx === 0 && paidAt?.trim()) {
    return `Paid ${formatDateTime(paidAt)}`;
  }
  if (stepIdx === 3 && status === 'Delivered' && deliveredAt?.trim()) {
    return formatDateTime(deliveredAt);
  }
  return undefined;
}

export default function OrderTrackingTimeline({
  status,
  paidAt,
  deliveredAt,
}: {
  status: OrderStatus;
  paidAt?: string;
  deliveredAt?: string;
}) {
  if (status === 'Cancelled' || status === 'Failed') {
    return (
      <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-foreground">
        {status === 'Cancelled'
          ? 'This order was cancelled.'
          : 'This order could not be completed. Contact support if you need help.'}
      </div>
    );
  }

  const activeIdx = stepIndexForStatus(status);

  return (
    <div className="mt-8 rounded-lg border bg-card">
      <div className="border-b px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">Track your order</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Status updates appear here as we fulfill your order.</p>
      </div>
      <ol className="px-5 py-4">
        {STEPS.map((step, idx) => {
          const isComplete = idx < activeIdx;
          const isCurrent = idx === activeIdx;
          const subtitle = subtitleForStep(idx, status, paidAt, deliveredAt);

          return (
            <li key={step.key} className="relative flex gap-3 pb-6 last:pb-0">
              {idx < STEPS.length - 1 && (
                <div
                  className={`absolute left-[11px] top-7 bottom-0 w-px ${isComplete ? 'bg-accent' : 'bg-border'}`}
                  aria-hidden
                />
              )}
              <div
                className={`relative z-0 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium ${
                  isComplete
                    ? 'border-accent bg-accent text-accent-foreground'
                    : isCurrent
                      ? 'border-accent bg-background text-accent'
                      : 'border-muted-foreground/30 bg-muted/40 text-muted-foreground'
                }`}
              >
                {isComplete ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : idx + 1}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={`text-sm font-medium ${isCurrent || isComplete ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                {subtitle ? <p className="mt-1 text-xs font-medium text-foreground/80">{subtitle}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
