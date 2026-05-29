import { motion } from 'framer-motion';
import SectionHeading from '@/components/home/SectionHeading';
import MotionImageVideo from '@/components/home/MotionImageVideo';
import { brandVideoClips } from '@/data/shopreturnGiftsMedia';

export default function BrandVideoShowcase() {
  const [hero, ...rest] = brandVideoClips;

  return (
    <section className="border-y bg-background py-16 lg:py-20">
      <div className="sf-container">
        <SectionHeading
          eyebrow="Watch & shop"
          title="Promo Videos — ShopReturnGifts in Action"
          description="Eight brand stories with motion previews. Upload MP4s for full video playback."
          align="center"
        />

        <motion.div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
          {hero && (
            <div className="overflow-hidden rounded-2xl border shadow-lg sm:col-span-2">
              <MotionImageVideo frames={hero.frames} videoSrc={hero.videoSrc} poster={hero.frames[0]} />
              <div className="bg-card p-4">
                <p className="font-bold">{hero.title}</p>
                <p className="text-sm text-muted-foreground">{hero.subtitle}</p>
              </div>
            </div>
          )}
          {rest.slice(0, 2).map((clip) => (
            <div key={clip.id} className="overflow-hidden rounded-2xl border shadow-lg">
              <MotionImageVideo frames={clip.frames} videoSrc={clip.videoSrc} poster={clip.frames[0]} />
              <div className="bg-card p-3">
                <p className="text-sm font-bold">{clip.title}</p>
                <p className="text-xs text-muted-foreground">{clip.subtitle}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rest.slice(2).map((clip) => (
            <div key={clip.id} className="overflow-hidden rounded-2xl border shadow-lg">
              <MotionImageVideo frames={clip.frames} videoSrc={clip.videoSrc} poster={clip.frames[0]} />
              <div className="bg-card p-3">
                <p className="text-sm font-bold">{clip.title}</p>
                <p className="text-xs text-muted-foreground">{clip.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
