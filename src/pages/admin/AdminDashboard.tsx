import { Package, ShoppingCart, DollarSign, Users, AlertTriangle, Loader2, TrendingDown } from 'lucide-react';
import { formatPrice, formatDate } from '@/lib/formatters';
import StatusBadge from '@/components/store/StatusBadge';
import { getOrderDisplayStatus } from '@/lib/orderDisplayStatus';
import { Link } from 'react-router-dom';
import { useAdminDashboard } from '@/hooks/useApi';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

const chartConfig = {
  gross: { label: 'Gross revenue', color: 'hsl(var(--chart-1))' },
  refunds: { label: 'Refunds', color: 'hsl(var(--chart-2))' },
  net: { label: 'Net revenue', color: 'hsl(var(--chart-3))' },
};

export default function AdminDashboard() {
  const { data, isLoading } = useAdminDashboard();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
        <p className="text-lg font-semibold text-foreground">Failed to load dashboard</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The admin API may be unreachable or returned an error. Check the browser console for details.
        </p>
      </div>
    );
  }

  const todayGross = data.todayGrossRevenue ?? data.todayRevenue ?? 0;
  const todayRefunds = data.todayRefunds ?? 0;
  const todayNet = data.todayNetRevenue ?? todayGross - todayRefunds;
  const totalGross = data.totalGrossRevenue ?? 0;
  const totalRefunds = data.totalRefunds ?? 0;
  const totalNet = data.totalNetRevenue ?? totalGross - totalRefunds;

  const trend = (data.revenueTrend ?? []).map(d => ({
    ...d,
    label: d.date.slice(5),
  }));

  const stats = [
    { label: "Today's Orders", value: data.todayOrders.toString(), icon: ShoppingCart, color: 'text-accent' },
    { label: "Today's Gross", value: formatPrice(todayGross), icon: DollarSign, color: 'text-sf-success' },
    { label: "Today's Refunds", value: formatPrice(todayRefunds), icon: TrendingDown, color: 'text-amber-600' },
    { label: "Today's Net", value: formatPrice(todayNet), icon: DollarSign, color: 'text-sf-info' },
    { label: 'Active Products', value: data.activeProducts.toString(), icon: Package, color: 'text-sf-info' },
    { label: 'Registered Users', value: data.totalUsers.toString(), icon: Users, color: 'text-sf-warning' },
  ];

  return (
    <div>
      <h1 className="text-xl font-bold text-foreground sm:text-2xl">Dashboard</h1>
      <p className="mt-1 text-sm text-muted-foreground">Revenue reporting includes captured payments and refunds</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {stats.map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">All-time gross revenue</p>
          <p className="mt-2 text-xl font-bold">{formatPrice(totalGross)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Captured order totals</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">All-time refunds</p>
          <p className="mt-2 text-xl font-bold text-amber-700">{formatPrice(totalRefunds)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Returned to customers</p>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <p className="text-xs font-medium text-muted-foreground">All-time net revenue</p>
          <p className="mt-2 text-xl font-bold text-sf-success">{formatPrice(totalNet)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Gross minus refunds</p>
        </div>
      </div>

      <div className="mt-8 rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Revenue — last 30 days</h2>
        <p className="mt-1 text-xs text-muted-foreground">Daily gross, refunds, and net (captured payments only)</p>
        <ChartContainer config={chartConfig} className="mt-4 h-[280px] w-full">
          <BarChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={v => `$${v}`} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="gross" fill="var(--color-gross)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="refunds" fill="var(--color-refunds)" radius={[2, 2, 0, 0]} />
            <Bar dataKey="net" fill="var(--color-net)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-sm font-semibold">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs text-accent hover:underline">View all</Link>
          </div>
          <div className="divide-y">
            {(data.recentOrders ?? []).slice(0, 5).map(order => (
              <div key={order.orderId} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-mono text-xs font-medium">{order.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={getOrderDisplayStatus(order)} />
                  <span className="text-sm font-medium">{formatPrice(order.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-sm font-semibold">Low Stock Alerts</h2>
            <AlertTriangle className="h-4 w-4 text-sf-warning" />
          </div>
          {(!data.lowStockProducts || data.lowStockProducts.length === 0) ? (
            <div className="p-5 text-center text-sm text-muted-foreground">No low stock items</div>
          ) : (
            <div className="divide-y">
              {(data.lowStockProducts ?? []).map(p => (
                <div key={p.productId} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-destructive">{p.stock} left</span>
                    {p.updatedAt && (
                      <p className="text-[10px] text-muted-foreground">{formatDate(p.updatedAt)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
