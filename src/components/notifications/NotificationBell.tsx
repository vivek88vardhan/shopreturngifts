import { useEffect, useRef, useState } from 'react';
import {
  Bell,
  CheckCheck,
  Loader2,
  Package,
  MessageCircle,
  Info,
  Tag,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { releaseDocumentScrollLock } from '@/lib/scrollLock';
import { useMarkAllNotificationsRead } from '@/hooks/useApi';
import { useMergedNotifications } from '@/hooks/useMergedNotifications';
import { useNotificationInboxStore, type InboxNotification } from '@/stores/notificationInboxStore';
import type { NotifyLevel } from '@/lib/notifyInbox';
import { cn } from '@/lib/utils';

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function resolveLevel(n: InboxNotification): NotifyLevel {
  if (n.level) return n.level;
  if (n.type === 'error') return 'error';
  if (n.type === 'order' || n.type === 'promo' || n.type === 'cart') return 'success';
  return 'info';
}

function levelIcon(level: NotifyLevel) {
  switch (level) {
    case 'error':
      return AlertCircle;
    case 'success':
      return CheckCircle2;
    default:
      return Info;
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'order':
      return Package;
    case 'contact':
      return MessageCircle;
    case 'promo':
      return Tag;
    case 'cart':
      return ShoppingCart;
    default:
      return null;
  }
}

function levelStyles(level: NotifyLevel, unread: boolean) {
  switch (level) {
    case 'error':
      return {
        row: unread ? 'bg-destructive/8 border-l-2 border-l-destructive' : 'border-l-2 border-l-destructive/40',
        icon: unread ? 'bg-destructive/15 text-destructive' : 'bg-destructive/10 text-destructive/80',
        dot: 'bg-destructive',
        title: unread ? 'text-destructive' : 'text-foreground',
      };
    case 'success':
      return {
        row: unread ? 'bg-accent/5 border-l-2 border-l-accent' : 'border-l-2 border-l-accent/30',
        icon: unread ? 'bg-accent/15 text-accent' : 'bg-muted text-muted-foreground',
        dot: 'bg-accent',
        title: 'text-foreground',
      };
    default:
      return {
        row: unread ? 'bg-muted/40 border-l-2 border-l-muted-foreground/30' : 'border-l-2 border-l-transparent',
        icon: unread ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground',
        dot: 'bg-muted-foreground',
        title: 'text-foreground',
      };
  }
}

type NotificationBellProps = {
  className?: string;
};

export default function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const prevUnread = useRef<number | null>(null);

  const { items, unreadCount, isLoading, isFetching, truncated } = useMergedNotifications();
  const bellRingTick = useNotificationInboxStore(s => s.bellRingTick);
  const markAllRead = useMarkAllNotificationsRead();
  const markAllLocalRead = useNotificationInboxStore(s => s.markAllLocalRead);

  const hasUnreadError = items.some(n => !n.readAt && resolveLevel(n) === 'error');

  useEffect(() => {
    if (prevUnread.current !== null && unreadCount > prevUnread.current) {
      setRinging(true);
      const t = window.setTimeout(() => setRinging(false), 1200);
      return () => window.clearTimeout(t);
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    if (bellRingTick > 0) {
      setRinging(true);
      const t = window.setTimeout(() => setRinging(false), 1200);
      return () => window.clearTimeout(t);
    }
  }, [bellRingTick]);

  useEffect(() => {
    if (prevUnread.current === null && !isLoading) {
      prevUnread.current = unreadCount;
    }
  }, [isLoading, unreadCount]);

  const handleMarkAllRead = () => {
    markAllLocalRead();
    markAllRead.mutate();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) releaseDocumentScrollLock();
  };

  return (
    <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
            ringing && 'animate-bell-ring',
            hasUnreadError && 'text-destructive hover:text-destructive',
            className,
          )}
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
          aria-expanded={open}
        >
          <Bell className={cn('h-5 w-5', unreadCount > 0 && 'fill-current/15')} />
          {unreadCount > 0 && (
            <span className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold',
              hasUnreadError
                ? 'bg-destructive text-destructive-foreground'
                : 'bg-accent text-accent-foreground',
            )}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[min(100vw-2rem,380px)] overflow-hidden p-0"
        onCloseAutoFocus={e => e.preventDefault()}
      >
        <PanelHeader unreadCount={unreadCount} hasUnreadError={hasUnreadError} isFetching={isFetching} onMarkAll={handleMarkAllRead} />
        <NotificationList isLoading={isLoading} items={items} truncated={truncated} />
      </PopoverContent>
    </Popover>
  );
}

function PanelHeader({
  unreadCount,
  hasUnreadError,
  isFetching,
  onMarkAll,
}: {
  unreadCount: number;
  hasUnreadError: boolean;
  isFetching: boolean;
  onMarkAll: () => void;
}) {
  return (
    <div className={cn(
      'flex items-center justify-between border-b px-4 py-3',
      hasUnreadError ? 'bg-destructive/5' : 'bg-popover',
    )}>
      <div>
        <p className="text-sm font-semibold text-foreground">Notifications</p>
        <p className={cn('text-xs', hasUnreadError ? 'text-destructive font-medium' : 'text-muted-foreground')}>
          {hasUnreadError ? '⚠ Errors need your attention' : unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={onMarkAll}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>
    </div>
  );
}

function NotificationList({
  isLoading,
  items,
  truncated,
}: {
  isLoading: boolean;
  items: InboxNotification[];
  truncated?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center bg-popover py-10">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="bg-popover px-4 py-10 text-center">
        <Bell className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">No notifications yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Updates, errors, and actions appear here</p>
      </div>
    );
  }
  return (
    <>
    <ul className="max-h-[min(60vh,420px)] overflow-y-auto bg-popover">
      {items.map(n => {
        const level = resolveLevel(n);
        const styles = levelStyles(level, !n.readAt);
        const unread = !n.readAt;
        const TypeIcon = typeIcon(n.type);
        const LevelIcon = levelIcon(level);
        const Icon = TypeIcon ?? LevelIcon;
        return (
          <li
            key={n.notificationId}
            className={cn('flex gap-3 border-b px-4 py-3 last:border-0', styles.row)}
          >
            <span
              className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                styles.icon,
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    'text-sm',
                    unread ? 'font-semibold' : 'font-medium',
                    styles.title,
                  )}
                >
                  {n.title}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{formatWhen(n.createdAt)}</span>
              </span>
              {n.body ? (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
              ) : null}
            </span>
            {unread && <span className={cn('mt-2 h-2 w-2 shrink-0 rounded-full', styles.dot)} aria-hidden />}
          </li>
        );
      })}
    </ul>
    {truncated && (
      <p className="border-t bg-muted/30 px-4 py-2 text-center text-[10px] text-muted-foreground">
        Showing your {items.length} most recent notifications. Older items stay in your account but are not listed here.
      </p>
    )}
    </>
  );
}
