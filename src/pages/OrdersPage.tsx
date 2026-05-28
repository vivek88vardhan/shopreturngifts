import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { formatPrice, formatDate } from '@/lib/formatters';
import StatusBadge from '@/components/store/StatusBadge';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useOrders } from '@/hooks/useApi';

export default function OrdersPage() {
  const { isAuthenticated } = useAuthStore();
  const { data: ordersData, isLoading } = useOrders();
  const orders = ordersData?.items || [];

  if (!isAuthenticated) {
    return (
      <div className="sf-container flex flex-col items-center py-20">
        <p className="text-muted-foreground">Please sign in to view your orders</p>
        <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent-hover">
          <Link to="/login">Sign In</Link>
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="sf-container flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="sf-container py-8">
      <h1 className="text-2xl font-bold text-foreground">My Orders</h1>
      <p className="mt-1 text-sm text-muted-foreground">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>

      {orders.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">No orders yet</p>
          <Button asChild className="mt-4 bg-accent text-accent-foreground hover:bg-accent-hover">
            <Link to="/products">Start Shopping</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {orders.map(order => (
            <Link key={order.orderId} to={`/orders/${order.orderId}`} className="rounded-lg border p-5 transition-colors hover:bg-background-subtle">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm font-semibold text-foreground">{order.orderNumber}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <StatusBadge status={order.status} />
                  <span className="text-sm text-muted-foreground">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</span>
                  <span className="text-sm font-semibold text-foreground">{formatPrice(order.total)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
