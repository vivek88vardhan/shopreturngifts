import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { NotifyLevel } from '@/lib/notifyInbox';

export type InboxNotification = {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  level?: NotifyLevel;
  link?: string;
  readAt?: string;
  createdAt: string;
  /** Client-only entries (coupon applied, cart, etc.) */
  local?: boolean;
};

export type ErrorPeekPayload = {
  notificationId: string;
  title: string;
  body: string;
};

/** Max client-side inbox entries kept in localStorage (matches API fetch cap). */
export const INBOX_DISPLAY_LIMIT = 50;

type NotificationInboxState = {
  localItems: InboxNotification[];
  /** Brief on-screen error banner before it “flies” into the bell inbox. */
  errorPeek: ErrorPeekPayload | null;
  /** Increment to ring the bell (e.g. when a new error peek appears). */
  bellRingTick: number;
  pushLocal: (item: Omit<InboxNotification, 'notificationId' | 'createdAt' | 'userId' | 'local'> & { notificationId?: string }) => void;
  clearErrorPeek: () => void;
  markLocalRead: (id: string) => void;
  markAllLocalRead: () => void;
  clearLocal: () => void;
};

export const useNotificationInboxStore = create<NotificationInboxState>()(
  persist(
    (set) => ({
      localItems: [],
      errorPeek: null,
      bellRingTick: 0,
      pushLocal: (item) => {
        const entry: InboxNotification = {
          notificationId: item.notificationId ?? `local-${crypto.randomUUID()}`,
          userId: 'local',
          title: item.title,
          body: item.body,
          type: item.type ?? 'system',
          level: item.level ?? 'success',
          link: item.link,
          createdAt: new Date().toISOString(),
          local: true,
        };
        const isError = (item.level ?? 'success') === 'error';
        set(state => ({
          localItems: [entry, ...state.localItems].slice(0, INBOX_DISPLAY_LIMIT),
          ...(isError
            ? {
                errorPeek: {
                  notificationId: entry.notificationId,
                  title: entry.title,
                  body: entry.body,
                },
                bellRingTick: state.bellRingTick + 1,
              }
            : {}),
        }));
      },
      clearErrorPeek: () => set({ errorPeek: null }),
      markLocalRead: (id) =>
        set(state => ({
          localItems: state.localItems.map(n =>
            n.notificationId === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
          ),
        })),
      markAllLocalRead: () =>
        set(state => ({
          localItems: state.localItems.map(n => ({
            ...n,
            readAt: n.readAt ?? new Date().toISOString(),
          })),
        })),
      clearLocal: () => set({ localItems: [] }),
    }),
    {
      name: 'shopreturngifts-inbox-local',
      version: 1,
      migrate: (persisted, version) => {
        if (version < 1) {
          return { localItems: [] };
        }
        return persisted as Pick<NotificationInboxState, 'localItems'>;
      },
      partialize: state => ({ localItems: state.localItems }),
    },
  ),
);
