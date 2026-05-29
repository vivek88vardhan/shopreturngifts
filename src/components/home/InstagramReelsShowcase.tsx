import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, Play, Volume2, VolumeX, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import SectionHeading from '@/components/home/SectionHeading';
import MotionImageVideo from '@/components/home/MotionImageVideo';
import { promoReels, type PromoReel } from '@/data/promoReels';
type InstagramReelsShowcaseProps = { instagramUrl?: string; reelUrls?: string[] };

/** Convert an Instagram permalink into its embeddable iframe URL. */
function toInstagramEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.replace(/^www\./, '').endsWith('instagram.com')) return null;
    const m = u.pathname.match(/\/(reel|reels|p|tv)\/([^/?#]+)/);
    if (!m) return null;
    const type = m[1] === 'reels' ? 'reel' : m[1];
    return `https://www.instagram.com/${type}/${m[2]}/embed`;
  } catch {
    return null;
  }
}

function ReelCard({ reel }: { reel: PromoReel }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [useMotion, setUseMotion] = useState(false);

  const togglePlay = () => {
    const el = videoRef.current;
    if (el && !useMotion) {
      if (el.paused) {
        void el.play();
        setPlaying(true);
      } else {
        el.pause();
        setPlaying(false);
      }
      return;
    }
    setPlaying((p) => !p);
  };

  return (
    <article className="group relative w-full max-w-[220px] overflow-hidden rounded-2xl border bg-card shadow-lg transition hover:-translate-y-1 hover:shadow-xl sm:max-w-none">
      <div className="relative aspect-[9/16] overflow-hidden bg-black">
        {useMotion ? (
          <button type="button" onClick={togglePlay} className="block h-full w-full">
            <img
              src={reel.poster}
              alt=""
              className={`h-full w-full object-cover object-top ${playing ? 'animate-hero-video-zoom' : ''}`}
            />
            {!playing && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/20">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow-lg">
                  <Play className="ml-0.5 h-6 w-6 fill-foreground text-foreground" />
                </span>
              </span>
            )}
          </button>
        ) : (
          <>
            <video
              ref={videoRef}
              src={reel.videoSrc}
              poster={reel.poster}
              className="h-full w-full object-cover"
              playsInline
              loop
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onError={() => setUseMotion(true)}
            />
            {!playing && (
              <button type="button" onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-black/25" aria-label={`Play ${reel.hook}`}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 shadow-lg">
                  <Play className="ml-0.5 h-6 w-6 fill-foreground text-foreground" />
                </span>
              </button>
            )}
            {playing && (
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white"
                aria-label={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
          </>
        )}

        <span className="absolute left-2 top-2 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-bold uppercase text-white">{reel.tag}</span>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-12">
          <p className="line-clamp-2 text-xs font-semibold text-white">{reel.hook}</p>
          <p className="mt-1 line-clamp-2 text-[10px] text-white/80">{reel.caption}</p>
          <div className="mt-2 flex gap-3 text-[10px] text-white/90">
            <span className="flex items-center gap-1"><Play className="h-3 w-3" /> {reel.views}</span>
            <span className="flex items-center gap-1"><Heart className="h-3 w-3 fill-white" /> {reel.likes}</span>
          </div>
        </div>

        <div className="absolute bottom-16 right-2 flex flex-col gap-2 text-white">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

export default function InstagramReelsShowcase({ instagramUrl, reelUrls }: InstagramReelsShowcaseProps) {
  const embeds = (reelUrls || [])
    .map(toInstagramEmbedUrl)
    .filter((u): u is string => !!u);
  const hasEmbeds = embeds.length > 0;

  return (
    <section className="border-y bg-background-subtle py-16 lg:py-20">
      <div className="sf-container">
        <SectionHeading
          eyebrow="Reels & promos"
          title="Real Party Moments"
          description={
            hasEmbeds
              ? 'Real reels from our Instagram — birthdays, Father\u2019s Day, Mother\u2019s Day, and home celebrations with return gifts.'
              : "Tap to play. Realistic clips of Father's Day, Mother's Day, birthdays, weddings, and home celebrations with return gifts."
          }
          align="center"
          action={
            instagramUrl ? (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline">
                Follow on Instagram <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : undefined
          }
        />

        {hasEmbeds ? (
          <motion.div
            className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {embeds.map((src, i) => (
              <div key={`${src}-${i}`} className="overflow-hidden rounded-2xl border bg-card shadow-lg">
                <div className="relative w-full" style={{ aspectRatio: '9 / 16' }}>
                  <iframe
                    src={src}
                    title={`Instagram reel ${i + 1}`}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full"
                    frameBorder={0}
                    scrolling="no"
                    allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              </div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            {promoReels.map((reel) => (
              <ReelCard key={reel.id} reel={reel} />
            ))}
          </motion.div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {instagramUrl && (
            <Button asChild variant="outline" size="sm">
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer">Instagram</a>
            </Button>
          )}
          <Button asChild size="sm" className="bg-accent text-accent-foreground hover:bg-accent-hover">
            <Link to="/products">Shop return gifts</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
