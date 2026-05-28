import type { QueryClient } from '@tanstack/react-query';
import { publicApi } from '@/lib/api';
import {
  applyStoredThemeBeforePaint,
  applyThemeFromConfig,
  readThemeSnapshot,
  writeThemeSnapshot,
} from '@/lib/themeSnapshot';
import type { StoreConfig } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { useNotificationInboxStore } from '@/stores/notificationInboxStore';

const THEME_QUERY_KEY = ['theme'] as const;
const THEME_FETCH_TIMEOUT_MS = 4000;

type PersistedStore = {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (fn: () => void) => () => void;
  };
};

function waitForStoreHydration(store: PersistedStore): Promise<void> {
  return new Promise(resolve => {
    if (store.persist.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = store.persist.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

/** Seed React Query before first render so hooks see the cached theme immediately. */
export function seedThemeQueryCache(client: QueryClient): void {
  const snap = readThemeSnapshot();
  if (!snap) return;
  if (client.getQueryData(THEME_QUERY_KEY)) return;
  client.setQueryData(THEME_QUERY_KEY, { ...snap } as StoreConfig);
}

/**
 * Load live theme from API before showing the app so we never flash stale localStorage colors.
 */
export async function loadThemeBeforeReveal(client: QueryClient): Promise<void> {
  applyStoredThemeBeforePaint();

  // Always hit the network — do not seed the query cache first or fetchQuery may skip the request.
  const fetchTheme = client
    .fetchQuery({
      queryKey: THEME_QUERY_KEY,
      queryFn: publicApi.getTheme,
      staleTime: 0,
    })
    .then(theme => {
      if (!theme) return;
      client.setQueryData(THEME_QUERY_KEY, theme);
      applyThemeFromConfig(theme);
      writeThemeSnapshot(theme);
    })
    .catch(() => {
      seedThemeQueryCache(client);
    });

  const timeout = new Promise<void>(resolve => {
    window.setTimeout(resolve, THEME_FETCH_TIMEOUT_MS);
  });

  await Promise.race([fetchTheme, timeout]);
}

export function waitForClientStoresHydrated(): Promise<void> {
  return Promise.all([
    waitForStoreHydration(useAuthStore as unknown as PersistedStore),
    waitForStoreHydration(useCartStore as unknown as PersistedStore),
    waitForStoreHydration(useNotificationInboxStore as unknown as PersistedStore),
  ]).then(() => undefined);
}

export function revealAppRoot(): void {
  document.documentElement.classList.remove('boot-pending');
  document.documentElement.classList.add('app-ready');
  // Recalculate carousel / viewport layouts after hidden → visible (mobile browsers).
  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

export function runBeforeReactPaint(): void {
  applyStoredThemeBeforePaint();
}
