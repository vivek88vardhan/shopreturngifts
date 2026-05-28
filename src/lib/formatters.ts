export function formatPrice(dollars: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(dollars);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    Pending: 'sf-badge-pending',
    Paid: 'sf-badge-paid',
    Processing: 'sf-badge-processing',
    Shipped: 'sf-badge-shipped',
    Delivered: 'sf-badge-delivered',
    Cancelled: 'sf-badge-cancelled',
  };
  return map[status] || 'sf-badge-pending';
}
