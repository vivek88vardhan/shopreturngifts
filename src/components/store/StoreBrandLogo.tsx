import { cn } from '@/lib/utils';

type StoreBrandLogoProps = {
  storeName: string;
  logoUrl?: string;
  className?: string;
  /** Navbar uses a small initial badge when no logo; mascot uses no fallback. */
  fallback?: 'initial' | 'none';
};

export default function StoreBrandLogo({
  storeName,
  logoUrl,
  className,
  fallback = 'initial',
}: StoreBrandLogoProps) {
  const src = logoUrl?.trim();
  if (src) {
    return (
      <img
        src={src}
        alt={storeName}
        className={cn('h-auto max-h-full max-w-full object-contain', className)}
        decoding="async"
      />
    );
  }
  if (fallback === 'none') {
    return null;
  }
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-md bg-primary text-primary-foreground',
        className,
      )}
      aria-hidden
    >
      <span className="font-bold">{storeName.charAt(0)}</span>
    </div>
  );
}
