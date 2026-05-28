import type { OrderStatus } from '@/types';
import type { OrderDisplayStatus } from '@/lib/orderDisplayStatus';

type BadgeStatus = OrderStatus | OrderDisplayStatus;

const styles: Record<string, string> = {
  Pending: 'bg-yellow-100 text-yellow-800',
  Paid: 'bg-blue-100 text-blue-800',
  Processing: 'bg-purple-100 text-purple-800',
  Shipped: 'bg-indigo-100 text-indigo-800',
  Delivered: 'bg-green-100 text-green-800',
  Cancelled: 'bg-red-100 text-red-800',
  Failed: 'bg-rose-100 text-rose-800',
  'Refund Partially': 'bg-amber-100 text-amber-800',
  'Refund Completely': 'bg-gray-100 text-gray-700',
};

export default function StatusBadge({ status }: { status: BadgeStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.Pending}`}>
      {status}
    </span>
  );
}
