import { queryClient } from '@/lib/queryClient';
import { useNotificationInboxStore } from '@/stores/notificationInboxStore';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

/** Drop cached API notifications and persisted bell inbox (e.g. after login or logout). */
export function resetNotificationInbox(): void {
  useNotificationInboxStore.getState().clearLocal();
  queryClient.removeQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
}
