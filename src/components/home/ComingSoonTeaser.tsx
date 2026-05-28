import { Bell, Package, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.55, ease: easeOut as unknown as [number, number, number, number] },
  }),
};

type ComingSoonTeaserProps = {
  storeName?: string;
};

export default function ComingSoonTeaser({ storeName = 'ShopReturnGifts' }: ComingSoonTeaserProps) {
  return (
    <section className="border-y border-amber-200/40 bg-gradient-to-br from-amber-50/90 via-background to-accent/5 py-14 lg:py-16">
      <div className="sf-container">
        <motion.div
          className="relative overflow-hidden rounded-3xl border-2 border-amber-200/60 bg-card px-6 py-10 shadow-lg shadow-amber-900/5 md:px-12 md:py-12"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-amber-200/40 blur-3xl" />

          <div className="relative grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <motion.p
                custom={0}
                variants={fadeUp}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Coming soon
              </motion.p>
              <motion.h2
                custom={1}
                variants={fadeUp}
                className="font-display mt-3 text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
              >
                New products are on the way
              </motion.h2>
              <motion.p custom={2} variants={fadeUp} className="mt-3 max-w-xl text-base leading-relaxed text-muted-foreground">
                We are cooking up fresh arrivals, seasonal picks, and more exciting things for {storeName}. Stay tuned —
                the best is yet to come!
              </motion.p>
              <motion.ul
                custom={3}
                variants={fadeUp}
                className="mt-6 flex flex-wrap gap-3 text-sm text-foreground/90"
              >
                {['New product drops', 'Special offers', 'Surprises ahead'].map(label => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-amber-200/80 bg-amber-50/80 px-3.5 py-1.5 font-medium"
                  >
                    <Package className="h-3.5 w-3.5 text-accent" />
                    {label}
                  </li>
                ))}
              </motion.ul>
            </div>

            <motion.div
              custom={2}
              variants={fadeUp}
              className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-accent/30 bg-accent/5 px-8 py-6 text-center md:min-w-[200px]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent">
                <Bell className="h-7 w-7" />
              </div>
              <p className="text-sm font-bold text-foreground">Stay tuned</p>
              <p className="text-xs text-muted-foreground">Watch the bell for updates</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
