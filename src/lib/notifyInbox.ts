import { useNotificationInboxStore } from '@/stores/notificationInboxStore';

export type NotifyLevel = 'success' | 'error' | 'info';

export type NotifyInboxInput = {
  title: string;
  body?: string;
  level?: NotifyLevel;
  type?: string;
};

/** Push a message into the header bell inbox (no screen popups). */
export function notifyInbox({ title, body = '', level = 'success', type }: NotifyInboxInput) {
  useNotificationInboxStore.getState().pushLocal({
    title,
    body,
    level,
    type: type ?? (level === 'error' ? 'error' : level === 'info' ? 'info' : 'system'),
  });
}
