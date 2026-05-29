/** ShopReturnGifts brand imagery — generated return-gift art (not legacy kirana assets). */

export const HERO_POSTER = '/assets/shopreturngifts/hero/hero-return-gifts.png';

export const mascotImage = (n: number) =>
  `/assets/shopreturngifts/mascots/mascot-${String(Math.min(Math.max(1, n), 14)).padStart(2, '0')}.png`;

export const lifestyleImage = (n: number) =>
  `/assets/shopreturngifts/lifestyle/lifestyle-${String(Math.min(Math.max(1, n), 6)).padStart(2, '0')}.png`;

export const occasionImage = (name: string) => `/assets/shopreturngifts/occasions/${name}.png`;

/** Real Father's Day promo banners (customer-supplied product photos). */
export const fathersDayImages = [1, 2, 3, 4].map((n) => occasionImage(`fathers-day-0${n}`));

export const allMascotNumbers = Array.from({ length: 14 }, (_, i) => i + 1);
export const allMascotImages = allMascotNumbers.map(mascotImage);
export const allLifestyleImages = Array.from({ length: 6 }, (_, i) => lifestyleImage(i + 1));

/** Looped motion backgrounds (image sequences; add MP4s under /videos/ when available). */
export const BRAND_VIDEOS = [
  '/videos/shopreturngifts-hero.mp4',
  '/videos/shopreturngifts-promo.mp4',
] as const;

export const heroMotionFrames = [HERO_POSTER, lifestyleImage(1), lifestyleImage(6), mascotImage(4)];

export type BrandVideoClip = {
  id: string;
  frames: string[];
  videoSrc?: string;
  title: string;
  subtitle: string;
};

export const brandVideoClips: BrandVideoClip[] = [
  { id: 'promo-main', frames: [HERO_POSTER, lifestyleImage(1)], videoSrc: BRAND_VIDEOS[0], title: 'ShopReturnGifts', subtitle: 'Return gifts that spark joy' },
  { id: 'promo-party', frames: [lifestyleImage(1), mascotImage(4)], videoSrc: BRAND_VIDEOS[1], title: 'Birthday party favorites', subtitle: 'Kids love these bundles' },
  { id: 'promo-wedding', frames: [lifestyleImage(2), mascotImage(6)], title: 'Wedding return gifts', subtitle: 'Elegant guest favors' },
  { id: 'promo-diwali', frames: [lifestyleImage(3), mascotImage(11)], title: 'Festival hampers', subtitle: 'Diwali & seasonal gifting' },
  { id: 'promo-classroom', frames: [lifestyleImage(4), mascotImage(3)], title: 'Classroom party packs', subtitle: 'Teacher-approved' },
  { id: 'promo-baby', frames: [lifestyleImage(5), mascotImage(5)], title: 'Baby shower favors', subtitle: 'Soft pastel surprises' },
  { id: 'promo-halloween', frames: [mascotImage(8), lifestyleImage(4)], title: 'Halloween treat bags', subtitle: 'Fun, not scary' },
  { id: 'promo-launch', frames: [lifestyleImage(6), HERO_POSTER], title: 'Curated party bundles', subtitle: 'Return gifts for every celebration' },
];

export type MascotGalleryItem = {
  id: string;
  src: string;
  label: string;
  span?: 'tall' | 'wide' | 'hero';
};

export const mascotGalleryItems: MascotGalleryItem[] = [
  { id: 'm1', src: mascotImage(1), label: 'Gift Buddy', span: 'hero' },
  { id: 'm2', src: mascotImage(2), label: 'Party Bear' },
  { id: 'm3', src: mascotImage(3), label: 'Festival Fox', span: 'tall' },
  { id: 'm4', src: mascotImage(4), label: 'Party Panda', span: 'wide' },
  { id: 'm5', src: mascotImage(5), label: 'Baby Bunny' },
  { id: 'm6', src: mascotImage(6), label: 'Wedding Bear', span: 'tall' },
  { id: 'm7', src: mascotImage(7), label: 'Maple Friend' },
  { id: 'm8', src: mascotImage(8), label: 'Spooky Pals' },
  { id: 'm9', src: mascotImage(9), label: 'Cupid Pal', span: 'wide' },
  { id: 'm10', src: mascotImage(10), label: 'New Year Spark' },
  { id: 'm11', src: mascotImage(11), label: 'Diwali Dazzle', span: 'tall' },
  { id: 'm12', src: mascotImage(12), label: 'Lunar Lantern' },
  { id: 'm13', src: mascotImage(13), label: 'Mommy Magic', span: 'wide' },
  { id: 'm14', src: mascotImage(14), label: 'Launch Buddy' },
];

export const lifestyleGallery = [
  { src: lifestyleImage(1), label: 'Birthday unboxing' },
  { src: lifestyleImage(2), label: 'Wedding favors' },
  { src: lifestyleImage(3), label: 'Festival hampers' },
  { src: lifestyleImage(4), label: 'Classroom joy' },
  { src: lifestyleImage(5), label: 'Baby shower' },
  { src: lifestyleImage(6), label: 'Family celebrations' },
];
