import type { StoreConfig } from '@/types';
import { readThemeSnapshot } from '@/lib/themeSnapshot';

/** Resolve logo URL from live theme, then persisted snapshot (never the letter fallback). */
export function resolveBrandLogoUrl(theme?: StoreConfig | null): string | undefined {
  const fromTheme = theme?.logoUrl?.trim();
  if (fromTheme) return fromTheme;
  const fromSnapshot = readThemeSnapshot()?.logoUrl?.trim();
  return fromSnapshot || undefined;
}

export function resolveStoreName(theme?: StoreConfig | null, fallback = 'ShopReturnGifts'): string {
  return theme?.storeName?.trim() || readThemeSnapshot()?.storeName?.trim() || fallback;
}
