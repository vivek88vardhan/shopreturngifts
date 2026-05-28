import type { ReactNode } from 'react';
import { notifyInbox, type NotifyLevel } from '@/lib/notifyInbox';

type ToastOptions = {
  description?: string;
};

function messageText(message: string | ReactNode): string {
  if (typeof message === 'string') return message;
  if (message == null) return '';
  return String(message);
}

function push(level: NotifyLevel, message: string | ReactNode, options?: ToastOptions) {
  notifyInbox({
    title: messageText(message),
    body: options?.description ?? '',
    level,
  });
}

/**
 * Drop-in replacement for Sonner — messages go to the notification bell.
 * Errors also show a brief on-screen banner that animates into the bell.
 */
export const toast = {
  success: (message: string | ReactNode, options?: ToastOptions) => push('success', message, options),
  error: (message: string | ReactNode, options?: ToastOptions) => push('error', message, options),
  info: (message: string | ReactNode, options?: ToastOptions) => push('info', message, options),
};
