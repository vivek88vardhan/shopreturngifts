import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Star, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import HeroVideoBackground from '@/components/home/HeroVideoBackground';
import { HERO_POSTER } from '@/data/shopreturnGiftsMedia';

type HomeHeroProps = {
  storeName: string;
  heroTagline: string;
  heroImageUrl?: string;
};

export default function HomeHero({ storeName, heroTagline, heroImageUrl }: HomeHeroProps) {
  const heroPoster = heroImageUrl?.trim() || HERO_POSTER;
  return (
    <section className="relative flex min-h-[min(calc(100svh-var(--sf-nav-height)),48rem)] flex-col justify-end sm:min-h-[calc(100dvh-var(--sf-nav-height))] sm:justify-center">
      <HeroVideoBackground posterSrc={heroPoster} />

      <div className="sf-container relative z-10 w-full min-w-0 pb-10 pt-20 sm:pb-16 sm:pt-28 md:pb-24 md:pt-32">
        <div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col items-center text-center sm:items-start sm:text-left">
          <div className="home-glass inline-flex w-fit max-w-full items-center gap-2 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-white/90 sm:px-4 sm:py-2 sm:text-xs">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span className="line-clamp-2 sm:line-clamp-none">{heroTagline}</span>
          </div>

          <h1 className="font-hero-headline mt-5 text-3xl font-semibold leading-[1.15] tracking-normal text-white sm:mt-8 sm:text-4xl sm:leading-[1.12] lg:text-6xl">
            Return gifts from{' '}
            <span className="bg-gradient-to-r from-amber-200 via-accent to-amber-100 bg-clip-text text-transparent">
              {storeName}
            </span>
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 sm:mt-6 sm:text-lg">
            Curated party favors and return gift bundles for birthdays, weddings, baby showers, and festivals — only at{' '}
            <span className="font-semibold text-white">shopreturngifts.com</span>.
          </p>

          <div className="mt-8 flex w-full min-w-0 flex-col gap-3 sm:mt-10 sm:flex-row sm:flex-wrap sm:justify-start">
            <Button
              asChild
              size="lg"
              className="h-11 w-full border-0 bg-accent px-6 text-base text-accent-foreground shadow-lg shadow-amber-900/40 hover:bg-accent-hover sm:h-12 sm:w-auto sm:px-8"
            >
              <Link to="/products">
                Shop return gifts <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-11 w-full border-2 border-white/35 bg-white/5 px-6 text-base text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:h-12 sm:w-auto sm:px-8"
            >
              <Link to="/products">Browse collections</Link>
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-white/70 sm:mt-10 sm:justify-start sm:gap-4">
            <div className="flex items-center gap-1.5">
              <div className="flex -space-x-1">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400 sm:h-4 sm:w-4" />
                ))}
              </div>
              <span className="text-xs font-medium text-white/90 sm:text-sm">Curated bundles</span>
            </div>
            <div className="hidden h-4 w-px bg-white/25 sm:block" />
            <span className="inline-flex items-center gap-1 text-xs sm:text-sm">
              <Gift className="h-3.5 w-3.5 text-amber-300" />
              Party favors &amp; hampers
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
