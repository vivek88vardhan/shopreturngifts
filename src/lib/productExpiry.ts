const MS_PER_DAY = 86_400_000;

/** Parse YYYY-MM-DD as UTC midnight. */
export function parseISODateOnly(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Days from today until expiry (negative = already expired). */
export function daysUntilExpiry(expiryDate: string, from: Date = new Date()): number | null {
  const exp = parseISODateOnly(expiryDate);
  if (!exp) return null;
  const diff = startOfUTCDay(exp).getTime() - startOfUTCDay(from).getTime();
  return Math.round(diff / MS_PER_DAY);
}

/** True when expiry is set and falls on or before today + withinDays. */
export function isExpiringWithinDays(expiryDate: string | undefined, withinDays: number, from: Date = new Date()): boolean {
  if (!expiryDate?.trim()) return false;
  const days = daysUntilExpiry(expiryDate, from);
  if (days === null) return false;
  return days <= withinDays;
}

export type ExpirySeverity = 'expired' | 'critical' | 'warning';

export function expirySeverity(expiryDate: string): ExpirySeverity | null {
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return null;
  if (days < 0) return 'expired';
  if (days <= 3) return 'critical';
  if (days <= 7) return 'warning';
  return null;
}

export function formatExpiryCountdown(expiryDate: string): string {
  const days = daysUntilExpiry(expiryDate);
  if (days === null) return '';
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

/** Display YYYY-MM-DD for admin tables (UTC, no timezone shift). */
export function formatExpiryDate(expiryDate: string): string {
  const d = parseISODateOnly(expiryDate);
  if (!d) return expiryDate;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const EXPIRY_ALERT_WITHIN_DAYS = 7;
