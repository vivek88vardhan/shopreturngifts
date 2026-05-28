import { useNotificationInboxQuery } from '@/hooks/useNotificationInbox';

/** Background poll for /notifications — updates bell badge only (no toast popups). */
export default function NotificationInboxSync() {
  useNotificationInboxQuery({ enablePolling: true });
  return null;
}
