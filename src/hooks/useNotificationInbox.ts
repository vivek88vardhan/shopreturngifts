import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { notificationsApi } from '@/lib/api';
import { NOTIFICATIONS_QUERY_KEY } from '@/lib/notificationInboxReset';
import { useNotificationInboxStore } from '@/stores/notificationInboxStore';

/**
 * In-app notifications live in the header bell dropdown.
 * Errors also use ErrorNotificationPeek for a brief on-screen alert.
 */
export function useNotificationInboxQuery(options?: { enablePolling?: boolean }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const enablePolling = options?.enablePolling ?? false;

  const query = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: notificationsApi.list,
    enabled: isAuthenticated,
    refetchInterval: enablePolling ? 25_000 : false,
    refetchOnWindowFocus: enablePolling,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Server inbox is empty — drop stale localStorage bell entries from before a data purge.
  useEffect(() => {
    if (!isAuthenticated || !query.isSuccess) return;
    if ((query.data?.items?.length ?? 0) === 0) {
      useNotificationInboxStore.getState().clearLocal();
    }
  }, [isAuthenticated, query.isSuccess, query.data?.items?.length]);

  return query;
}
