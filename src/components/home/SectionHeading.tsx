import { motion } from 'framer-motion';

const easeOut = [0.22, 1, 0.36, 1] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.55, ease: easeOut as unknown as [number, number, number, number] },
  }),
};

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: 'left' | 'center';
  action?: React.ReactNode;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  action,
}: SectionHeadingProps) {
  const centered = align === 'center';

  return (
    <motion.div
      className={`flex flex-col gap-4 ${centered ? 'text-center items-center' : 'sm:flex-row sm:items-end sm:justify-between'}`}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
    >
      <div className={centered ? 'max-w-2xl' : ''}>
        <motion.span
          custom={0}
          variants={fadeUp}
          className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase text-accent"
        >
          <span className="h-px w-8 bg-accent/60" aria-hidden />
          {eyebrow}
        </motion.span>
        <motion.h2
          custom={1}
          variants={fadeUp}
          className={`mt-3 font-display text-3xl font-semibold tracking-tight text-foreground lg:text-4xl ${centered ? '' : ''}`}
        >
          {title}
        </motion.h2>
        {description && (
          <motion.p custom={2} variants={fadeUp} className="mt-2 text-muted-foreground">
            {description}
          </motion.p>
        )}
      </div>
      {action && (
        <motion.div custom={centered ? 2 : 1} variants={fadeUp}>
          {action}
        </motion.div>
      )}
    </motion.div>
  );
}
