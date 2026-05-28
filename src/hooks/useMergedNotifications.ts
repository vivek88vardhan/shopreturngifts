import { useMemo } from 'react';
import { useNotificationInboxQuery } from '@/hooks/useNotificationInbox';
import { useNotificationInboxStore, INBOX_DISPLAY_LIMIT, type InboxNotification } from '@/stores/notificationInboxStore';

function sortByNewest(a: InboxNotification, b: InboxNotification) {
  return b.createdAt.localeCompare(a.createdAt);
}

export function useMergedNotifications() {
  const { data, isLoading, isFetching, refetch } = useNotificationInboxQuery();
  const localItems = useNotificationInboxStore(s => s.localItems);

  const merged = useMemo(() => {
    const apiItems: InboxNotification[] = (data?.items ?? []).map(n => ({ ...n, local: false }));
    const byId = new Map<string, InboxNotification>();
    for (const n of [...localItems, ...apiItems]) {
      byId.set(n.notificationId, n);
    }
    return Array.from(byId.values()).sort(sortByNewest).slice(0, INBOX_DISPLAY_LIMIT);
  }, [data?.items, localItems]);

  const unreadCount = merged.filter(n => !n.readAt).length;
  const truncated = merged.length >= INBOX_DISPLAY_LIMIT;

  return {
    items: merged,
    truncated,
    unreadCount,
    isLoading,
    isFetching,
    refetch,
  };
}
