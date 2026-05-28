import type { Order } from '@/types';

/** Simplified status shown in admin orders list and filters. */
export type OrderDisplayStatus =
  | 'Paid'
  | 'Delivered'
  | 'Cancelled'
  | 'Refund Partially'
  | 'Refund Completely'
  | 'Failed';

export const ORDER_DISPLAY_STATUSES: (OrderDisplayStatus | 'All')[] = [
  'All',
  'Paid',
  'Delivered',
  'Cancelled',
  'Refund Partially',
  'Refund Completely',
  'Failed',
];

export function getOrderDisplayStatus(order: Order): OrderDisplayStatus {
  const ps = order.paymentStatus?.toLowerCase();
  if (ps === 'refunded') return 'Refund Completely';
  if (ps === 'partially_refunded') return 'Refund Partially';
  if (order.status === 'Failed' || ps === 'capture_failed') return 'Failed';
  if (order.status === 'Cancelled' || ps === 'cancelled') return 'Cancelled';
  if (order.status === 'Delivered') return 'Delivered';
  return 'Paid';
}
