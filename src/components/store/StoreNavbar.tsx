import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, User, Menu, X, LogOut, Package, Settings, MessageCircle } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { useClientStoresHydrated } from '@/hooks/useClientStoresHydrated';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HeaderMenuButton } from '@/components/store/HeaderMenuButton';
import NotificationBell from '@/components/notifications/NotificationBell';
import { releaseDocumentScrollLock } from '@/lib/scrollLock';
import { useThemeConfig } from '@/hooks/useApi';
import { resolveBrandLogoUrl, resolveStoreName } from '@/lib/storeBranding';

interface StoreNavbarProps {
  storeName?: string;
  logoUrl?: string;
}

export default function StoreNavbar({ storeName: storeNameProp = 'ShopReturnGifts', logoUrl: logoUrlProp }: StoreNavbarProps) {
  const { data: theme } = useThemeConfig();
  const storeName = resolveStoreName(theme, storeNameProp);
  const logoUrl = resolveBrandLogoUrl(theme) ?? logoUrlProp?.trim() ?? undefined;
  const { itemCount, openCart } = useCartStore();
  const authHydrated = useClientStoresHydrated();
  const { isAuthenticated, isAdmin, user, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const navigate = useNavigate();

  const closeAccountMenu = () => {
    setAccountOpen(false);
    releaseDocumentScrollLock();
  };
  const count = itemCount();

  return (
    <nav className="sticky top-0 z-[55] border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pt-[env(safe-area-inset-top)]">
      <div className="sf-container flex h-14 min-w-0 items-center justify-between gap-2 sm:h-16">
        <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-8">
          <Link to="/" className="flex min-w-0 shrink items-center gap-2.5">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={storeName}
                className="h-8 w-auto max-w-[min(42vw,140px)] object-contain sm:h-10 sm:max-w-[180px]"
                decoding="async"
              />
            ) : (
              <span className="truncate text-base font-semibold text-foreground sm:text-lg">{storeName}</span>
            )}
          </Link>
          <div className="hidden items-center gap-6 md:flex">
            <Link to="/products" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Products
            </Link>
            <Link to="/categories" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Categories
            </Link>
            <Link to="/contact" className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Contact
            </Link>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {authHydrated && isAuthenticated && <NotificationBell />}
          <button
            onClick={openCart}
            className="relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Open cart"
          >
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                {count}
              </span>
            )}
          </button>

          {!authHydrated ? (
            <div className="h-9 w-[7.5rem] animate-pulse rounded-md bg-muted/60" aria-hidden />
          ) : isAuthenticated ? (
            <Popover
              modal={false}
              open={accountOpen}
              onOpenChange={open => {
                setAccountOpen(open);
                if (!open) releaseDocumentScrollLock();
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-label="Account menu"
                  aria-expanded={accountOpen}
                >
                  <span className="text-xs font-semibold">{user?.name?.charAt(0).toUpperCase()}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={8}
                className="w-48 p-1"
                onCloseAutoFocus={e => e.preventDefault()}
              >
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <div className="my-1 h-px bg-muted" />
                <HeaderMenuButton onClick={() => { closeAccountMenu(); navigate('/profile'); }}>
                  <User className="mr-2 h-4 w-4" /> Profile
                </HeaderMenuButton>
                <HeaderMenuButton onClick={() => { closeAccountMenu(); navigate('/orders'); }}>
                  <Package className="mr-2 h-4 w-4" /> Orders
                </HeaderMenuButton>
                <HeaderMenuButton onClick={() => { closeAccountMenu(); navigate('/contact'); }}>
                  <MessageCircle className="mr-2 h-4 w-4" /> Contact Us
                </HeaderMenuButton>
                {isAdmin && (
                  <>
                    <div className="my-1 h-px bg-muted" />
                    <HeaderMenuButton onClick={() => { closeAccountMenu(); navigate('/admin'); }}>
                      <Settings className="mr-2 h-4 w-4" /> Admin Panel
                    </HeaderMenuButton>
                  </>
                )}
                <div className="my-1 h-px bg-muted" />
                <HeaderMenuButton
                  onClick={() => {
                    closeAccountMenu();
                    logout();
                    navigate('/');
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" /> Logout
                </HeaderMenuButton>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm" onClick={() => navigate('/login')}>
                Sign In
              </Button>
              <Button size="sm" className="h-8 bg-accent px-2 text-xs text-accent-foreground hover:bg-accent-hover sm:h-9 sm:px-3 sm:text-sm" onClick={() => navigate('/signup')}>
                Join
              </Button>
            </div>
          )}

          <button
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-card px-4 py-3 md:hidden">
          <div className="flex flex-col gap-2">
            <Link to="/products" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary" onClick={() => setMobileOpen(false)}>Products</Link>
            <Link to="/categories" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary" onClick={() => setMobileOpen(false)}>Categories</Link>
            <Link to="/contact" className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary" onClick={() => setMobileOpen(false)}>Contact</Link>
          </div>
        </div>
      )}
    </nav>
  );
}
