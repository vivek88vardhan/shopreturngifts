import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Shared row style for header popover menus (profile, etc.). */
export function HeaderMenuButton({
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
