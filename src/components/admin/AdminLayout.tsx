import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Settings,
  ArrowLeft,
  Tag,
  Bell,
  Percent,
  Truck,
  ClipboardList,
  Gift,
  Menu,
  Scale,
} from 'lucide-react';
import NotificationBell from '@/components/notifications/NotificationBell';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

const navItems = [
  { label: 'Dashboard', path: '/admin', icon: LayoutDashboard },
  { label: 'Categories', path: '/admin/categories', icon: Tag },
  { label: 'Products', path: '/admin/products', icon: Package },
  { label: 'Orders', path: '/admin/orders', icon: ShoppingCart },
  { label: 'Order Reconciliation', path: '/admin/order-reconciliation', icon: Scale },
  { label: 'Coupons', path: '/admin/coupons', icon: Percent },
  { label: 'Rewards', path: '/admin/rewards', icon: Gift },
  { label: 'Dealers', path: '/admin/dealers', icon: Truck },
  { label: 'Users', path: '/admin/users', icon: Users },
  { label: 'Notifications', path: '/admin/notifications', icon: Bell },
  { label: 'Audit Log', path: '/admin/audit-log', icon: ClipboardList },
  { label: 'Settings', path: '/admin/config', icon: Settings },
];

function AdminNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(item => {
          const active =
            item.path === '/admin'
              ? location.pathname === '/admin'
              : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="shrink-0 border-t p-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" /> Back to Store
        </Link>
      </div>
    </>
  );
}

function AdminBrand() {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary">
        <span className="text-[10px] font-bold text-primary-foreground">KB</span>
      </div>
      <span className="text-sm font-semibold">Admin Panel</span>
    </div>
  );
}

export default function AdminLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <div className="flex min-h-screen min-w-0">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r bg-card lg:flex">
        <AdminBrand />
        <AdminNavLinks />
      </aside>

      {/* Mobile nav drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="flex w-[min(100vw-3rem,14rem)] flex-col gap-0 p-0 sm:max-w-xs">
          <SheetTitle className="sr-only">Admin navigation</SheetTitle>
          <AdminBrand />
          <AdminNavLinks onNavigate={closeMobileNav} />
        </SheetContent>
      </Sheet>

      <main className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-56">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Open admin menu"
              onClick={() => setMobileNavOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="truncate text-sm font-semibold">Admin Panel</span>
          </div>
          <div className="hidden flex-1 lg:block" aria-hidden />
          <NotificationBell />
        </header>
        <div className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
