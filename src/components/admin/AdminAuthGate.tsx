import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { isJwtExpired } from '@/lib/jwtSession';

/**
 * Waits for persisted auth to hydrate, rejects expired tokens, and requires admin role.
 */
export default function AdminAuthGate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());
  const token = useAuthStore(s => s.token);
  const isAdmin = useAuthStore(s => s.isAdmin);
  const logout = useAuthStore(s => s.logout);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!token || isJwtExpired(token)) {
      logout();
      const next = `${location.pathname}${location.search}`;
      navigate(`/login?next=${encodeURIComponent(next)}&reason=session`, { replace: true });
    }
  }, [hydrated, token, logout, navigate, location.pathname, location.search]);

  if (!hydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    );
  }

  if (!token || isJwtExpired(token)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-label="Redirecting" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground">Access denied</p>
          <p className="mt-1 text-sm text-muted-foreground">You need administrator privileges for this area.</p>
          <Link to="/login?next=%2Fadmin" className="mt-4 inline-block text-sm text-accent hover:underline">
            Sign in as admin
          </Link>
          <p className="mt-2">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">Return to store</Link>
          </p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
