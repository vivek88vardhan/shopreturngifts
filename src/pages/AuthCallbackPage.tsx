import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { API_BASE_URL } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/inboxToast';

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      setError('No authorization code received.');
      return;
    }

    const exchangeCode = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/auth/oauth/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            redirectUri: window.location.origin + '/auth/callback',
          }),
        });

        if (!res.ok) {
          const errText = (await res.text()).trim();
          if (res.status === 409) {
            throw new Error(
              errText ||
                'This email is already used with email and password. Sign in with your password instead, or contact support if you need Google on the same account.'
            );
          }
          throw new Error(errText || 'Authentication failed');
        }

        const data = await res.json();
        setAuth(data.user, data.token);
        toast.success('Welcome!');
        navigate('/');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Authentication failed';
        setError(message);
        toast.error(message);
      }
    };

    exchangeCode();
  }, [searchParams, setAuth, navigate]);

  if (error) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border p-8 text-center">
          <h1 className="text-xl font-bold text-foreground">Sign In Failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="mt-4 text-sm font-medium text-accent hover:underline"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <p className="mt-3 text-sm text-muted-foreground">Signing you in...</p>
      </div>
    </div>
  );
}
