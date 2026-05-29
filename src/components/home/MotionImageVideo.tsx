import { useEffect, useRef, useState } from 'react';

type MotionImageVideoProps = {
  frames: string[];
  videoSrc?: string;
  className?: string;
  poster?: string;
  intervalMs?: number;
  /** Vertical reel (9:16) vs horizontal hero */
  aspect?: 'video' | 'reel';
};

/**
 * Plays MP4 when present; otherwise loops frames with a Ken Burns–style zoom (gift-brand motion).
 */
export default function MotionImageVideo({
  frames,
  videoSrc,
  className = '',
  poster,
  intervalMs = 4000,
  aspect = 'video',
}: MotionImageVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [useVideo, setUseVideo] = useState(Boolean(videoSrc));
  const [frameIndex, setFrameIndex] = useState(0);
  const activeFrames = frames.length > 0 ? frames : poster ? [poster] : [];

  useEffect(() => {
    if (!useVideo || activeFrames.length <= 1) return;
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % activeFrames.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [useVideo, activeFrames.length, intervalMs]);

  const aspectClass = aspect === 'reel' ? 'aspect-[9/16]' : 'aspect-video';

  if (useVideo && videoSrc) {
    return (
      <div className={`relative overflow-hidden bg-black ${aspectClass} ${className}`}>
        <video
          ref={videoRef}
          src={videoSrc}
          poster={poster || activeFrames[0]}
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setUseVideo(false)}
        />
      </div>
    );
  }

  const src = activeFrames[frameIndex] || poster || '';

  return (
    <div className={`relative overflow-hidden bg-black ${aspectClass} ${className}`}>
      {activeFrames.map((frame, i) => (
        <img
          key={frame}
          src={frame}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            i === frameIndex ? 'animate-hero-video-zoom opacity-100' : 'opacity-0'
          }`}
        />
      ))}
      {!src && <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-amber-900" />}
    </div>
  );
}
