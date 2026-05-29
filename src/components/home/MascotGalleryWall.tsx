import { motion } from 'framer-motion';
import SectionHeading from '@/components/home/SectionHeading';
import { lifestyleGallery, mascotGalleryItems } from '@/data/shopreturnGiftsMedia';

const spanClass: Record<string, string> = {
  hero: 'sm:col-span-2 sm:row-span-2',
  tall: 'sm:row-span-2',
  wide: 'sm:col-span-2',
};

export default function MascotGalleryWall() {
  return (
    <section className="py-16 lg:py-20">
      <div className="sf-container">
        <SectionHeading
          eyebrow="Photo gallery"
          title="ShopReturnGifts — Every Celebration"
          description="14 mascots plus real party & festival lifestyle shots — all curated for return gifts."
          align="center"
        />

        <motion.div
          className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:auto-rows-[140px] lg:auto-rows-[160px] lg:gap-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          {mascotGalleryItems.map((item, i) => (
            <motion.figure
              key={item.id}
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.02 }}
              className={`group relative overflow-hidden rounded-2xl border bg-card shadow-sm ${spanClass[item.span ?? ''] ?? ''}`}
            >
              <img src={item.src} alt={item.label} loading="lazy" className="h-full min-h-[120px] w-full object-cover object-top transition duration-500 group-hover:scale-105" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 py-2">
                <span className="text-xs font-bold text-white">{item.label}</span>
              </figcaption>
            </motion.figure>
          ))}
        </motion.div>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {lifestyleGallery.map((photo, i) => (
            <motion.div
              key={photo.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.04 }}
              className="group relative aspect-[4/3] overflow-hidden rounded-xl border"
            >
              <img src={photo.src} alt={photo.label} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
              <p className="absolute bottom-2 left-2 right-2 text-[10px] font-bold text-white drop-shadow-md sm:text-xs">{photo.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
