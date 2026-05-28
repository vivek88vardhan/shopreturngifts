import type { StoreConfig } from '@/types';
import { applyThemeColors } from '@/lib/theme';

const THEME_SNAPSHOT_KEY = 'shopreturngifts-theme-snapshot';

/** Persisted subset used to avoid a flash of default branding before `/config/theme` returns. */
export type ThemeSnapshot = Partial<
  Pick<
    StoreConfig,
    | 'storeName'
    | 'primaryColor'
    | 'secondaryColor'
    | 'accentColor'
    | 'heroTagline'
    | 'heroImageUrl'
    | 'logoUrl'
    | 'footerText'
    | 'promoLabel'
    | 'promoHeadline'
    | 'promoSubtext'
    | 'promoBgImageUrl'
  >
>;

export function readThemeSnapshot(): ThemeSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(THEME_SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ThemeSnapshot;
  } catch {
    return null;
  }
}

export function writeThemeSnapshot(config: StoreConfig): void {
  if (typeof window === 'undefined') return;
  const snap: ThemeSnapshot = {
    storeName: config.storeName,
    primaryColor: config.primaryColor,
    secondaryColor: config.secondaryColor,
    accentColor: config.accentColor,
    heroTagline: config.heroTagline,
    heroImageUrl: config.heroImageUrl,
    logoUrl: config.logoUrl,
    footerText: config.footerText,
    promoLabel: config.promoLabel,
    promoHeadline: config.promoHeadline,
    promoSubtext: config.promoSubtext,
    promoBgImageUrl: config.promoBgImageUrl,
  };
  try {
    localStorage.setItem(THEME_SNAPSHOT_KEY, JSON.stringify(snap));
  } catch {
    // quota / private mode
  }
}

/** Call before React mounts so the first paint uses the last known palette and title. */
export function applyStoredThemeBeforePaint(): void {
  const t = readThemeSnapshot();
  if (!t) return;
  applyThemeFromConfig(t);
}

/** Apply palette + document title from API config or snapshot (skips redundant DOM writes). */
export function applyThemeFromConfig(config: ThemeSnapshot | StoreConfig): void {
  if (config.primaryColor && config.secondaryColor && config.accentColor) {
    applyThemeColors(config.primaryColor, config.secondaryColor, config.accentColor);
  }
  if (config.storeName?.trim()) {
    document.title = config.storeName.trim();
  }
}
