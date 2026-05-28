type HeroVideoBackgroundProps = {
  /** Admin-uploaded hero image from theme config — no legacy stock assets */
  posterSrc?: string;
  className?: string;
};

/**
 * Hero background: optional theme image or warm gift-brand gradient only.
 * Does not load legacy grocery / kirana promo videos.
 */
export default function HeroVideoBackground({ posterSrc, className = '' }: HeroVideoBackgroundProps) {
  const hasPoster = Boolean(posterSrc?.trim());

  return (
    <div className={`absolute inset-0 overflow-hidden bg-slate-950 ${className}`} aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/80" />

      {hasPoster && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${posterSrc})` }}
        />
      )}

      <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/55 to-background/95" />
      <div className="absolute inset-0 bg-gradient-to-tr from-accent/25 via-transparent to-transparent mix-blend-soft-light" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,hsl(var(--accent)/0.22),transparent_55%)]" />

      {!hasPoster && (
        <div className="absolute inset-0 flex items-center justify-center opacity-[0.07]">
          <div className="grid grid-cols-3 gap-8 p-12">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="h-16 w-16 rounded-2xl border border-white/40 sm:h-20 sm:w-20" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
