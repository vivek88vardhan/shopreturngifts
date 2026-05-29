import MotionImageVideo from '@/components/home/MotionImageVideo';
import { BRAND_VIDEOS, HERO_POSTER, heroMotionFrames } from '@/data/shopreturnGiftsMedia';

type HeroVideoBackgroundProps = {
  posterSrc?: string;
  className?: string;
};

export default function HeroVideoBackground({ posterSrc, className = '' }: HeroVideoBackgroundProps) {
  const poster = posterSrc?.trim() || HERO_POSTER;

  return (
    <div className={`absolute inset-0 overflow-hidden bg-slate-950 ${className}`} aria-hidden>
      <MotionImageVideo
        frames={heroMotionFrames}
        videoSrc={BRAND_VIDEOS[0]}
        poster={poster}
        className="absolute inset-0 h-full w-full"
        intervalMs={5000}
      />

      <div className="absolute inset-0 bg-gradient-to-b from-foreground/75 via-foreground/55 to-background/95" />
      <div className="absolute inset-0 bg-gradient-to-tr from-accent/25 via-transparent to-transparent mix-blend-soft-light" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,hsl(var(--accent)/0.22),transparent_55%)]" />
    </div>
  );
}
