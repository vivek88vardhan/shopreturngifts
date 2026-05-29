import { BRAND_VIDEOS, lifestyleImage, mascotImage, occasionImage, fathersDayImages } from '@/data/shopreturnGiftsMedia';

export type PromoReel = {
  id: string;
  videoSrc?: string;
  poster: string;
  caption: string;
  hook: string;
  views: string;
  likes: string;
  tag: 'Reel' | 'Promo' | 'Story';
  gradient: string;
};

/**
 * Curated, non-duplicate reels. Every card uses a distinct poster image so the
 * grid never repeats. Includes dedicated Father's Day and Mother's Day moments.
 */
type ReelSeed = {
  id: string;
  poster: string;
  hook: string;
  caption: string;
  tag: PromoReel['tag'];
  gradient: string;
};

const seeds: ReelSeed[] = [
  {
    id: 'fathers-day-unboxing',
    poster: fathersDayImages[0],
    hook: "Dad's reaction to his Father's Day hamper",
    caption: "Engraved mug, treats, and a note — his real Father's Day reaction 🎁",
    tag: 'Reel',
    gradient: 'from-blue-700 via-indigo-600 to-slate-800',
  },
  {
    id: 'fathers-day-setup',
    poster: fathersDayImages[1],
    hook: "Personalizing a Father's Day gift basket",
    caption: "How we pack a custom basket for the best dad 🧔",
    tag: 'Story',
    gradient: 'from-blue-800 via-blue-600 to-cyan-600',
  },
  {
    id: 'mothers-day-celebration',
    poster: mascotImage(13),
    hook: "Mom's Mother's Day surprise unboxing",
    caption: "Elegant keepsakes that made mom tear up 💐",
    tag: 'Reel',
    gradient: 'from-rose-500 via-pink-500 to-fuchsia-500',
  },
  {
    id: 'mothers-day-table',
    poster: mascotImage(9),
    hook: "Mother's Day brunch gift table",
    caption: "Styling the perfect Mother's Day favor table ✨",
    tag: 'Reel',
    gradient: 'from-pink-400 via-rose-400 to-amber-300',
  },
  {
    id: 'birthday-unboxing',
    poster: lifestyleImage(1),
    hook: 'Real birthday unboxing reaction',
    caption: 'Their real reaction when the return gifts arrived 🎉',
    tag: 'Story',
    gradient: 'from-violet-600 via-fuchsia-500 to-pink-500',
  },
  {
    id: 'wedding-favors',
    poster: lifestyleImage(2),
    hook: 'Wedding guest favor moment',
    caption: 'Wedding favors guests could not stop talking about 💍',
    tag: 'Reel',
    gradient: 'from-amber-500 via-orange-500 to-rose-600',
  },
  {
    id: 'festival-hamper',
    poster: lifestyleImage(3),
    hook: 'Festival hamper reveal at home',
    caption: 'Festive hampers ready for every guest 🪔',
    tag: 'Reel',
    gradient: 'from-orange-400 via-amber-400 to-yellow-300',
  },
  {
    id: 'classroom-party',
    poster: lifestyleImage(4),
    hook: 'Classroom party favor setup',
    caption: 'Teacher-approved bundles in real life 📚',
    tag: 'Story',
    gradient: 'from-sky-500 via-blue-500 to-indigo-600',
  },
  {
    id: 'baby-shower',
    poster: lifestyleImage(5),
    hook: 'Baby shower gift table tour',
    caption: 'Baby shower table styling that feels personal 👶',
    tag: 'Reel',
    gradient: 'from-teal-400 via-cyan-400 to-sky-500',
  },
  {
    id: 'family-celebration',
    poster: lifestyleImage(6),
    hook: 'Family celebration gift spread',
    caption: 'Real home celebration setup with curated favors ✨',
    tag: 'Reel',
    gradient: 'from-emerald-600 via-teal-600 to-cyan-600',
  },
  {
    id: 'fathers-day-desk',
    poster: fathersDayImages[3],
    hook: "Father's Day desk organizer gift",
    caption: "Practical, personal, perfect for dad 🕶️",
    tag: 'Story',
    gradient: 'from-slate-700 via-blue-800 to-slate-900',
  },
  {
    id: 'fathers-day-keepsake',
    poster: fathersDayImages[2],
    hook: "Engraved keepsakes for dad",
    caption: "Custom leather and wood favors he'll actually use 🧰",
    tag: 'Reel',
    gradient: 'from-amber-700 via-orange-700 to-slate-800',
  },
  {
    id: 'independence-day',
    poster: occasionImage('independence-day'),
    hook: 'Independence Day party favors',
    caption: 'Red, white, and blue gift baskets for the 4th 🎆',
    tag: 'Reel',
    gradient: 'from-blue-600 via-red-500 to-slate-200',
  },
  {
    id: 'halloween-treats',
    poster: occasionImage('halloween'),
    hook: 'Halloween treat bag haul',
    caption: 'Fun, not scary — themed treat bags kids love 🎃',
    tag: 'Story',
    gradient: 'from-orange-500 via-amber-600 to-slate-900',
  },
];

const views = ['18.9K', '12.4K', '24.7K', '9.7K', '15.2K', '11.3K', '8.9K', '7.8K', '6.3K', '13.1K', '10.2K', '5.6K', '16.5K', '14.0K'];
const likes = ['2.9K', '1.8K', '4.1K', '1.1K', '2.4K', '1.5K', '1.0K', '980', '890', '1.9K', '1.4K', '720', '2.6K', '2.1K'];

export const promoReels: PromoReel[] = seeds.map((seed, i) => ({
  ...seed,
  videoSrc: BRAND_VIDEOS[i % BRAND_VIDEOS.length],
  views: views[i % views.length],
  likes: likes[i % likes.length],
}));
