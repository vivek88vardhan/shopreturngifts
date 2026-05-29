import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_BASE_URL } from '@/lib/api';
import {
  clearPendingVerificationEmail,
  getPendingVerificationEmail,
  parseAuthSuccessResponse,
  rememberPendingVerificationEmail,
} from '@/lib/authApi';
import { useAuthStore } from '@/stores/authStore';
import type { User } from '@/types';
import { toast } from '@/lib/inboxToast';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { CheckCircle2, Mail } from 'lucide-react';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import { EmailDeliveryHint, EMAIL_DELIVERY_TOAST_SUFFIX } from '@/components/auth/EmailDeliveryHint';

type Step = 'signup' | 'verify' | 'verified';

export default function SignupPage() {
  const [step, setStep] = useState<Step>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    const pending = getPendingVerificationEmail();
    if (pending) {
      setEmail(pending);
      setStep('verify');
    }
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Signup failed');
      }

      const data = await parseAuthSuccessResponse<{ token?: string; user?: User }>(res);
      if (data.token && data.user) {
        // Auto-verified (dev mode)
        setAuth(data.user, data.token);
        toast.success('Account created!');
        navigate('/');
      } else {
        rememberPendingVerificationEmail(email);
        toast.success(`Verification code sent to your email!${EMAIL_DELIVERY_TOAST_SUFFIX}`);
        setStep('verify');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        const errText = await res.text();
        const lowerErr = errText.toLowerCase();

        if (
          lowerErr.includes('current status is confirmed') ||
          (lowerErr.includes('notauthorizedexception') && lowerErr.includes('confirmed'))
        ) {
          toast.success('Your email is already verified.');
          setStep('verified');
          return;
        }

        if (lowerErr.includes('expired') || lowerErr.includes('invalid code')) {
          setCode('');
          await handleResendCode();
          toast.error('Code expired. A new code has been sent to your email.');
          return;
        }
        throw new Error(errText || 'Verification failed');
      }

      clearPendingVerificationEmail();
      toast.success('Email verified successfully!');
      setStep('verified');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || 'Failed to resend code');
      }

      toast.success(`New verification code sent!${EMAIL_DELIVERY_TOAST_SUFFIX}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginAfterVerify = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // If login fails, redirect to login page
        navigate('/login');
        return;
      }

      const data = await parseAuthSuccessResponse<{ token: string; user: User }>(res);
      setAuth(data.user, data.token);
      toast.success('Welcome to ShopReturnGifts!');
      navigate('/');
    } catch {
      navigate('/login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border p-8">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-bold text-primary-foreground">SR</span>
          </div>

          {step === 'signup' && (
            <>
              <h1 className="mt-4 text-xl font-bold text-foreground">Create Account</h1>
              <p className="mt-1 text-sm text-muted-foreground">Start shopping with ShopReturnGifts</p>
            </>
          )}

          {step === 'verify' && (
            <>
              <div className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
                <Mail className="h-6 w-6 text-accent" />
              </div>
              <h1 className="mt-3 text-xl font-bold text-foreground">Verify Your Email</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>
              </p>
              <EmailDeliveryHint className="mt-3 text-left" />
            </>
          )}

          {step === 'verified' && (
            <>
              <div className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="mt-3 text-xl font-bold text-foreground">Email Verified!</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account is ready. You can now sign in.
              </p>
            </>
          )}
        </div>

        {step === 'signup' && (
          <>
            <form onSubmit={handleSignup} className="mt-6 space-y-4">
              <div><Label>Full Name</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-1" required /></div>
              <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" required /></div>
              <div><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1" required minLength={8} /></div>
              <p className="text-xs text-muted-foreground">Minimum 8 characters, with uppercase, lowercase, and numbers</p>
              <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent-hover" disabled={loading}>
                {loading ? 'Creating...' : 'Create Account'}
              </Button>
            </form>

            <div className="mt-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or continue with</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <div className="mt-4">
              <SocialLoginButtons mode="signup" />
            </div>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account? <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link>
            </p>
          </>
        )}

        {step === 'verify' && (
          <form onSubmit={handleVerify} className="mt-6 space-y-5">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={code} onChange={setCode}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>

            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent-hover" disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Verify Email'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Didn&apos;t receive a code?{' '}
              <button
                type="button"
                onClick={handleResendCode}
                className="font-medium text-accent hover:underline disabled:opacity-50"
                disabled={loading}
              >
                Resend code
              </button>
            </p>
            <p className="text-center text-sm text-muted-foreground">
              Leaving this page?{' '}
              <Link
                to={`/login?verify=1&email=${encodeURIComponent(email.trim().toLowerCase())}`}
                className="font-medium text-accent hover:underline"
              >
                Verify on sign in
              </Link>
            </p>
          </form>
        )}

        {step === 'verified' && (
          <div className="mt-6 space-y-3">
            <Button
              onClick={handleLoginAfterVerify}
              className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Continue to Sign In'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
