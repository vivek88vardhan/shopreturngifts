import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import SectionHeading from '@/components/home/SectionHeading';
import { giftMomentSlides } from '@/data/giftMoments';

const easeOut = [0.22, 1, 0.36, 1] as const;

export default function CartoonMomentSpotlight() {
  const [index, setIndex] = useState(0);
  const slide = giftMomentSlides[index];
  const total = giftMomentSlides.length;

  const go = useCallback((dir: -1 | 1) => setIndex((i) => (i + dir + total) % total), [total]);

  useEffect(() => {
    const timer = window.setInterval(() => go(1), 7000);
    return () => window.clearInterval(timer);
  }, [go]);

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-amber-50/80 via-background to-background py-16 lg:py-20 dark:from-amber-950/15">
      <div className="sf-container relative">
        <SectionHeading
          eyebrow="Kids’ favorite themes"
          title="Return Gifts They Actually Want"
          description="Hot Wheels, Mario, Minecraft, Peppa Pig, Blippi, and more — themed party favor bundles kids recognize on sight."
          align="center"
        />

        <div className="mb-8 hidden gap-2 overflow-x-auto pb-2 sm:flex sm:flex-wrap sm:justify-center">
          {giftMomentSlides.map((s) => (
            <button key={s.id} type="button" onClick={() => setIndex(giftMomentSlides.indexOf(s))} className="shrink-0">
              <img src={s.image} alt="" className="h-14 w-14 rounded-xl border-2 border-white/80 object-cover object-top shadow-sm" />
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="relative flex justify-center">
            <AnimatePresence mode="wait">
              <motion.img
                key={slide.id}
                src={slide.image}
                alt={slide.name}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1, y: -8 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.45, ease: easeOut, y: { duration: 3.5, repeat: Infinity, repeatType: 'reverse' } }}
                className="max-h-[min(400px,50vh)] w-auto drop-shadow-2xl"
              />
            </AnimatePresence>
            <motion.div
              className="absolute -right-2 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg dark:bg-card"
              animate={{ rotate: [0, 12, -12, 0] }}
              transition={{ duration: 2.5, repeat: Infinity }}
            >
              <Sparkles className="h-5 w-5 text-amber-500" />
            </motion.div>
          </div>

          <div>
            <AnimatePresence mode="wait">
              <motion.div
                key={slide.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                {slide.localeLabel && (
                  <span className={`inline-block rounded-full bg-gradient-to-r px-3 py-1 text-xs font-bold text-white ${slide.accent}`}>
                    {slide.localeLabel}
                  </span>
                )}
                <h3 className="mt-4 text-2xl font-bold lg:text-3xl">{slide.name}</h3>
                <p className="mt-1 text-sm font-semibold text-accent">{slide.role}</p>
                <div className="mt-6 rounded-2xl border border-dashed border-accent/30 bg-card p-6">
                  <p className="text-lg leading-relaxed">&ldquo;{slide.quote}&rdquo;</p>
                  {slide.quoteLocal && <p className="mt-2 text-sm italic text-muted-foreground">{slide.quoteLocal}</p>}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-6 flex items-center justify-between">
              <div className="flex gap-2">
                {giftMomentSlides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-label={s.name}
                    onClick={() => setIndex(i)}
                    className={`h-2.5 rounded-full transition-all ${i === index ? 'w-8 bg-accent' : 'w-2.5 bg-muted-foreground/30'}`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => go(-1)} className="flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-sm" aria-label="Previous">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button type="button" onClick={() => go(1)} className="flex h-10 w-10 items-center justify-center rounded-full border bg-card shadow-sm" aria-label="Next">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
