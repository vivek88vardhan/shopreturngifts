import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';
import { useCartStore } from '@/stores/cartStore';
import { resetNotificationInbox } from '@/lib/notificationInboxReset';

interface AuthStore {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  updateProfile: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,

      setAuth: (user: User, token: string) => {
        resetNotificationInbox();
        set({
          user,
          token,
          isAuthenticated: true,
          isAdmin: user.role?.toLowerCase() === 'admin',
        });
      },

      logout: () => {
        resetNotificationInbox();
        useCartStore.getState().clearCart();
        set({ user: null, token: null, isAuthenticated: false, isAdmin: false });
      },

      updateProfile: (updates) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, ...updates, updatedAt: new Date().toISOString() }
            : null,
        })),
    }),
    { name: 'shopreturngifts-auth' }
  )
);
