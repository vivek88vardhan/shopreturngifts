import { giftMomentSlides } from '@/data/giftMoments';

export default function MascotIconStrip() {
  return (
    <div className="mb-8 flex justify-center gap-1.5 overflow-hidden rounded-2xl border bg-muted/30 p-2">
      {giftMomentSlides.map(({ id, image, name }) => (
        <img
          key={id}
          src={image}
          alt={name}
          title={name}
          className="h-11 w-11 shrink-0 rounded-lg object-cover object-center sm:h-14 sm:w-14"
          loading="lazy"
        />
      ))}
    </div>
  );
}
