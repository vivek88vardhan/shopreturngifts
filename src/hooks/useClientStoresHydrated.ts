import { useEffect, useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

/** True once persisted auth (and related client state) has finished rehydrating. */
export function useClientStoresHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    if (useAuthStore.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    return unsub;
  }, []);

  return hydrated;
}
