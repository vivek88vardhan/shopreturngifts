import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useNotificationInboxStore } from '@/stores/notificationInboxStore';
import { cn } from '@/lib/utils';

type Phase = 'hidden' | 'visible' | 'flying';

const HOLD_MS = 3800;
const FLY_MS = 650;

/**
 * Surfaces error inbox messages on-screen briefly, then animates them toward the bell.
 * The message remains in the bell dropdown (via notifyInbox / toast.error).
 */
export default function ErrorNotificationPeek() {
  const errorPeek = useNotificationInboxStore(s => s.errorPeek);
  const clearErrorPeek = useNotificationInboxStore(s => s.clearErrorPeek);
  const [phase, setPhase] = useState<Phase>('hidden');
  const [shown, setShown] = useState<typeof errorPeek>(null);

  useEffect(() => {
    if (!errorPeek) return;
    setShown(errorPeek);
    setPhase('visible');

    const flyTimer = window.setTimeout(() => setPhase('flying'), HOLD_MS);
    const hideTimer = window.setTimeout(() => {
      setPhase('hidden');
      clearErrorPeek();
    }, HOLD_MS + FLY_MS);

    return () => {
      window.clearTimeout(flyTimer);
      window.clearTimeout(hideTimer);
    };
  }, [errorPeek, clearErrorPeek]);

  if (!shown || phase === 'hidden') return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top))] z-[70] flex justify-end px-4 sm:top-[calc(4.25rem+env(safe-area-inset-top))]"
      role="alert"
      aria-live="assertive"
    >
      <div
        className={cn(
          'pointer-events-auto w-full max-w-sm rounded-lg border border-destructive/40 bg-card px-4 py-3 shadow-lg',
          phase === 'visible' && 'animate-error-peek-in',
          phase === 'flying' && 'animate-error-peek-to-bell',
        )}
      >
        <div className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertCircle className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-destructive">{shown.title}</p>
            {shown.body ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{shown.body}</p>
            ) : null}
            <p className="mt-1.5 text-[10px] text-muted-foreground">Saved to notifications</p>
          </div>
        </div>
      </div>
    </div>
  );
}
