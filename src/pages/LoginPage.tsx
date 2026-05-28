import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { API_BASE_URL } from '@/lib/api';
import {
  clearPendingVerificationEmail,
  clearVerifyPurpose,
  getPendingVerificationEmail,
  getVerifyPurpose,
  isEmailNotVerifiedError,
  parseAuthErrorResponse,
  rememberPendingVerificationEmail,
  requestForgotPassword,
  setVerifyPurpose,
  type ForgotPasswordResult,
  type VerifyPurpose,
} from '@/lib/authApi';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/lib/inboxToast';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import SocialLoginButtons from '@/components/auth/SocialLoginButtons';
import { EmailDeliveryHint, EMAIL_DELIVERY_TOAST_SUFFIX } from '@/components/auth/EmailDeliveryHint';
import { Alert, AlertDescription } from '@/components/ui/alert';

type LoginView = 'login' | 'verify' | 'forgot' | 'reset';

function safeReturnPath(searchParams: URLSearchParams): string {
  const next = searchParams.get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<LoginView>('login');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const afterLoginPath = useMemo(() => safeReturnPath(searchParams), [searchParams]);
  const sessionEnded = searchParams.get('reason') === 'session';

  const needsVerification = view === 'verify';
  const setNeedsVerification = (v: boolean) => setView(v ? 'verify' : 'login');
  const [verifyPurpose, setVerifyPurposeState] = useState<VerifyPurpose>(() => getVerifyPurpose());

  const beginEmailVerification = async (
    normalizedEmail: string,
    notify = true,
    purpose: VerifyPurpose = 'sign_in',
  ) => {
    rememberPendingVerificationEmail(normalizedEmail);
    setVerifyPurpose(purpose);
    setVerifyPurposeState(purpose);
    setEmail(normalizedEmail);
    setCode('');
    setNeedsVerification(true);

    const notifyMsg =
      purpose === 'reset_password'
        ? 'Enter the signup verification code from your email. After that we will send a password reset code.'
        : 'Please verify your email. A new code has been sent.';

    try {
      const resendRes = await fetch(`${API_BASE_URL}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (resendRes.ok) {
        if (notify) toast.info(notifyMsg);
        return;
      }
      const resendErr = await parseAuthErrorResponse(resendRes);
      if (resendErr.error === 'already_verified') {
        clearVerifyPurpose();
        setVerifyPurposeState('sign_in');
        if (purpose === 'reset_password') {
          await continueToPasswordResetAfterVerify(normalizedEmail);
          return;
        }
        toast.info(resendErr.message ?? 'Your email is already verified. Try signing in again.');
        setNeedsVerification(false);
        return;
      }
      if (notify) toast.info('Enter the verification code we sent to your email.');
    } catch {
      if (notify) toast.info('Enter the verification code we sent to your email.');
    }
  };

  const goToPasswordResetStep = () => {
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setView('reset');
  };

  const applyForgotPasswordOutcome = async (
    normalizedEmail: string,
    outcome: ForgotPasswordResult & { ok: boolean },
  ): Promise<boolean> => {
    if (!outcome.ok) {
      throw new Error(outcome.message || 'Failed to send reset code');
    }

    if (outcome.hint === 'verify_email_first') {
      toast.info(outcome.message);
      await beginEmailVerification(normalizedEmail, false, 'reset_password');
      return false;
    }

    if (outcome.hint === 'cognito_email_flag') {
      toast.error(outcome.message);
      return false;
    }

    if (outcome.hint === 'rate_limited' || outcome.hint === 'delivery_failed') {
      toast.error(outcome.message);
      return false;
    }

    if (outcome.delivered) {
      toast.success(`${outcome.message}${EMAIL_DELIVERY_TOAST_SUFFIX}`);
      goToPasswordResetStep();
      return true;
    }

    toast.info(outcome.message);
    if (outcome.hint === 'check_inbox') {
      goToPasswordResetStep();
    }
    return false;
  };

  const continueToPasswordResetAfterVerify = async (normalizedEmail: string) => {
    const outcome = await requestForgotPassword(normalizedEmail);
    await applyForgotPasswordOutcome(normalizedEmail, outcome);
  };

  useEffect(() => {
    const wantsVerify = searchParams.get('verify') === '1' || searchParams.get('verify') === 'true';
    const emailParam = searchParams.get('email')?.trim().toLowerCase() ?? '';
    const pending = getPendingVerificationEmail();

    if (emailParam) {
      setEmail(emailParam);
    } else if (pending) {
      setEmail(pending);
    }

    if (wantsVerify && (emailParam || pending)) {
      void beginEmailVerification(emailParam || pending, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when URL hints verification
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });

      if (!res.ok) {
        const err = await parseAuthErrorResponse(res);
        if (isEmailNotVerifiedError(err)) {
          await beginEmailVerification(normalizedEmail);
          return;
        }
        throw new Error(err.message || err.raw || 'Login failed');
      }

      const data = await res.json();
      clearPendingVerificationEmail();
      setAuth(data.user, data.token);
      toast.success('Welcome back!');
      navigate(afterLoginPath);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const finishSignInAfterVerification = async (normalizedEmail: string) => {
    if (!password.trim()) {
      toast.success('Email verified! Sign in with your password, or use Forgot password to set a new one.');
      setView('login');
      return;
    }

    const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });

    if (!loginRes.ok) {
      const err = await parseAuthErrorResponse(loginRes);
      if (isEmailNotVerifiedError(err)) {
        await beginEmailVerification(normalizedEmail, true, 'sign_in');
        return;
      }
      throw new Error(err.message || 'Login failed after verification');
    }

    const data = await loginRes.json();
    clearPendingVerificationEmail();
    setAuth(data.user, data.token);
    navigate(afterLoginPath);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const purpose = verifyPurpose;

    try {
      const confirmRes = await fetch(`${API_BASE_URL}/auth/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, code }),
      });

      let verified = confirmRes.ok;

      if (!confirmRes.ok) {
        const errText = await confirmRes.text();
        const lowerErr = errText.toLowerCase();

        if (
          lowerErr.includes('current status is confirmed') ||
          (lowerErr.includes('notauthorizedexception') && lowerErr.includes('confirmed'))
        ) {
          verified = true;
        } else if (lowerErr.includes('expired') || lowerErr.includes('invalid code')) {
          setCode('');
          await handleResendCode();
          toast.error('Code expired. A new code has been sent to your email.');
          return;
        } else {
          throw new Error(errText || 'Verification failed');
        }
      }

      if (!verified) {
        throw new Error('Verification failed');
      }

      clearPendingVerificationEmail();
      clearVerifyPurpose();
      setVerifyPurposeState('sign_in');
      setNeedsVerification(false);

      if (purpose === 'reset_password') {
        toast.success('Email verified! Sending password reset code...');
        await continueToPasswordResetAfterVerify(normalizedEmail);
        return;
      }

      toast.success('Email verified! Signing you in...');
      await finishSignInAfterVerification(normalizedEmail);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();

    try {
      const res = await fetch(`${API_BASE_URL}/auth/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      if (!res.ok) throw new Error('Failed to resend code');
      toast.success(`New verification code sent!${EMAIL_DELIVERY_TOAST_SUFFIX}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resend');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setFieldErrors(prev => ({ ...prev, email: true }));
      toast.error('Please enter your email address first');
      return;
    }
    setLoading(true);
    try {
      const outcome = await requestForgotPassword(normalizedEmail);
      await applyForgotPasswordOutcome(normalizedEmail, outcome);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setFieldErrors(prev => ({ ...prev, confirmPassword: true }));
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setFieldErrors(prev => ({ ...prev, newPassword: true }));
      toast.error('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/confirm-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Password reset failed');
      }
      toast.success('Password reset successfully! Please sign in.');
      setPassword('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setView('login');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  if (view === 'forgot') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <KeyRound className="h-6 w-6 text-accent" />
            </div>
            <h1 className="mt-3 text-xl font-bold text-foreground">Reset Password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter your account email. Verified accounts receive a reset code by email.
            </p>
          </div>

          <Alert className="mt-4 border-border bg-background-subtle text-left">
            <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Already verified?</strong> You will get a password reset code by email.
              <br />
              <strong className="text-foreground">Never finished signup?</strong> We will ask for your signup verification code first, then send a reset code.
            </AlertDescription>
          </Alert>

          <EmailDeliveryHint className="mt-3" />

          <form onSubmit={handleForgotPassword} className="mt-6 space-y-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: false })); }}
                className={`mt-1 ${fieldErrors.email ? 'border-destructive ring-1 ring-destructive' : ''}`}
                placeholder="you@example.com"
                required
              />
            </div>
            <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent-hover" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Code'}
            </Button>
          </form>

          <button
            type="button"
            onClick={() => setView('login')}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:underline"
          >
            ← Back to login
          </button>
        </div>
      </div>
    );
  }

  if (view === 'reset') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <KeyRound className="h-6 w-6 text-accent" />
            </div>
            <h1 className="mt-3 text-xl font-bold text-foreground">Enter Reset Code</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, enter the 6-digit reset code from your email.
            </p>
            <EmailDeliveryHint className="mt-3 text-left" />
            <p className="mt-3 text-xs text-muted-foreground">
              Signed up but never verified?{' '}
              <button
                type="button"
                className="font-medium text-accent hover:underline"
                onClick={() => void beginEmailVerification(email.trim().toLowerCase())}
              >
                Verify your email first
              </button>
            </p>
          </div>

          <form onSubmit={handleConfirmReset} className="mt-6 space-y-4">
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
            <div>
              <Label>New Password</Label>
              <div className="relative mt-1">
                <Input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setFieldErrors(prev => ({ ...prev, newPassword: false })); }}
                  className={`pr-10 ${fieldErrors.newPassword ? 'border-destructive ring-1 ring-destructive' : ''}`}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => setShowNewPassword(v => !v)}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <Label>Confirm Password</Label>
              <div className="relative mt-1">
                <Input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setFieldErrors(prev => ({ ...prev, confirmPassword: false })); }}
                  className={`pr-10 ${fieldErrors.confirmPassword ? 'border-destructive ring-1 ring-destructive' : ''}`}
                  placeholder="Re-enter new password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() => setShowConfirmPassword(v => !v)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent-hover"
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Didn&apos;t receive a code?{' '}
            <button
              type="button"
              onClick={() => void handleForgotPassword()}
              className="font-medium text-accent hover:underline"
              disabled={loading}
            >
              Resend code
            </button>
          </p>

          <button
            type="button"
            onClick={() => setView('login')}
            className="mt-2 w-full text-center text-sm text-muted-foreground hover:underline"
          >
            ← Back to login
          </button>
        </div>
      </div>
    );
  }

  if (needsVerification) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border p-8">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <Mail className="h-6 w-6 text-accent" />
            </div>
            <h1 className="mt-3 text-xl font-bold text-foreground">
              {verifyPurpose === 'reset_password' ? 'Verify Email to Reset Password' : 'Verify Your Email'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {verifyPurpose === 'reset_password' ? (
                <>
                  Enter the <strong className="font-medium text-foreground">signup</strong> verification code sent to{' '}
                  <span className="font-medium text-foreground">{email}</span>. After this step we will email a password reset code.
                </>
              ) : (
                <>
                  Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>
                </>
              )}
            </p>
            <EmailDeliveryHint className="mt-3 text-left" />
          </div>

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
              {loading
                ? 'Verifying...'
                : verifyPurpose === 'reset_password'
                  ? 'Verify & Continue'
                  : 'Verify & Sign In'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Didn&apos;t receive a code?{' '}
              <button type="button" onClick={handleResendCode} className="font-medium text-accent hover:underline" disabled={loading}>
                Resend code
              </button>
            </p>

            <button
              type="button"
              onClick={() => {
                clearVerifyPurpose();
                setVerifyPurposeState('sign_in');
                setNeedsVerification(false);
              }}
              className="w-full text-center text-sm text-muted-foreground hover:underline"
            >
              ← Back to login
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border p-8">
        {sessionEnded && (
          <Alert className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-100">
            <AlertDescription>Your session ended. Sign in again to continue where you left off.</AlertDescription>
          </Alert>
        )}
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-primary">
            <span className="text-sm font-bold text-primary-foreground">SR</span>
          </div>
          <h1 className="mt-4 text-xl font-bold text-foreground">Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">Welcome back to ShopReturnGifts</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" required /></div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Password</Label>
              <button
                type="button"
                onClick={() => setView('forgot')}
                className="text-xs font-medium text-accent hover:underline"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative mt-1">
              <Input
                type={showLoginPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="pr-10"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                onClick={() => setShowLoginPassword(v => !v)}
              >
                {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent-hover" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or continue with</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-4">
          <SocialLoginButtons mode="login" />
        </div>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          <button
            type="button"
            className="font-medium text-accent hover:underline"
            onClick={() => {
              const normalized = email.trim().toLowerCase();
              if (!normalized) {
                toast.error('Enter your email above, then tap verify email.');
                return;
              }
              void beginEmailVerification(normalized);
            }}
          >
            Need to verify your email?
          </button>
        </p>

        <p className="mt-2 text-center text-sm text-muted-foreground">
          Don't have an account? <Link to="/signup" className="font-medium text-accent hover:underline">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
