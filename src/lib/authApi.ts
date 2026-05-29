import { API_BASE_URL } from '@/lib/api';

const PENDING_VERIFY_KEY = 'kb_pending_verification_email';
const VERIFY_PURPOSE_KEY = 'kb_verify_purpose';

export type AuthApiError = {
  error?: string;
  message?: string;
};

export type VerifyPurpose = 'sign_in' | 'reset_password';

/** Parse login/auth error bodies (JSON or plain text). */
export async function parseAuthErrorResponse(res: Response): Promise<AuthApiError & { raw: string }> {
  const raw = await res.text();
  try {
    const parsed = JSON.parse(raw) as AuthApiError;
    if (parsed && typeof parsed === 'object') {
      return { ...parsed, raw };
    }
  } catch {
    /* plain text */
  }
  return { raw, message: raw };
}

/**
 * Parse a successful (2xx) auth response body as JSON.
 * Unlike res.json(), this never throws the cryptic WebKit error
 * ("The string did not match the expected pattern.") when the body is
 * empty or HTML. Instead it raises a clear, actionable error — which
 * almost always means API_BASE_URL is pointing at the SPA/CloudFront
 * instead of the API, or a proxy returned an HTML error page.
 */
export async function parseAuthSuccessResponse<T>(res: Response): Promise<T> {
  const raw = (await res.text()).trim();
  if (!raw) {
    throw new Error('Server returned an empty response. Please try again.');
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    const looksLikeHtml = raw.startsWith('<');
    throw new Error(
      looksLikeHtml
        ? 'Unexpected response from the server (received a web page, not data). The API address may be misconfigured.'
        : 'Unexpected response from the server. Please try again.'
    );
  }
}

export function isEmailNotVerifiedError(err: AuthApiError & { raw?: string }): boolean {
  if (err.error === 'email_not_verified') return true;
  const text = `${err.raw ?? ''} ${err.message ?? ''}`.toLowerCase();
  return text.includes('email_not_verified') ||
    text.includes('not confirmed') ||
    text.includes('usernotconfirmed');
}

export function rememberPendingVerificationEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized) {
    sessionStorage.setItem(PENDING_VERIFY_KEY, normalized);
  }
}

export function clearPendingVerificationEmail() {
  sessionStorage.removeItem(PENDING_VERIFY_KEY);
}

export function getPendingVerificationEmail(): string {
  return sessionStorage.getItem(PENDING_VERIFY_KEY) ?? '';
}

export function setVerifyPurpose(purpose: VerifyPurpose) {
  sessionStorage.setItem(VERIFY_PURPOSE_KEY, purpose);
}

export function getVerifyPurpose(): VerifyPurpose {
  const v = sessionStorage.getItem(VERIFY_PURPOSE_KEY);
  return v === 'reset_password' ? 'reset_password' : 'sign_in';
}

export function clearVerifyPurpose() {
  sessionStorage.removeItem(VERIFY_PURPOSE_KEY);
}

export type ForgotPasswordResult = {
  message: string;
  hint?: string;
  delivered: boolean;
  accountState?: string;
};

export async function parseForgotPasswordResponse(res: Response): Promise<ForgotPasswordResult> {
  const raw = await res.text();
  try {
    const data = JSON.parse(raw) as ForgotPasswordResult;
    if (data && typeof data.message === 'string') {
      return {
        message: data.message,
        hint: data.hint,
        delivered: Boolean(data.delivered),
        accountState: data.accountState,
      };
    }
  } catch {
    /* plain text fallback */
  }
  return { message: raw || 'Request failed', delivered: false };
}

/** Request a Cognito password-reset code. */
export async function requestForgotPassword(email: string): Promise<ForgotPasswordResult & { ok: boolean }> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
  const outcome = await parseForgotPasswordResponse(res);
  return { ...outcome, ok: res.ok };
}
