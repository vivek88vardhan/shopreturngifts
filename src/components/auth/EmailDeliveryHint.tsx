import { cn } from '@/lib/utils';

type EmailDeliveryHintProps = {
  className?: string;
};

/** Shown wherever we email a verification or reset code. */
export function EmailDeliveryHint({ className }: EmailDeliveryHintProps) {
  return (
    <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>
      If you don&apos;t see the email within a few minutes, check your{' '}
      <strong className="font-medium text-foreground">inbox and spam or junk folder</strong>.
    </p>
  );
}

export const EMAIL_DELIVERY_TOAST_SUFFIX =
  ' Check your spam or junk folder if it is not in your inbox.';
