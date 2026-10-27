"use client";
import { useEffect, useRef } from 'react';

// Let page images load first, and do not download decorative video offscreen or on data-saving connections.
export function ViewportVideo({ src, poster, className, label, width, height }: { src: string; poster: string; className?: string; label?: string; width?: number; height?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (!video || connection?.saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let visible = false, ready = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (!visible || !ready || document.hidden) { video.pause(); return; }
      if (!video.getAttribute('src')) video.src = src;
      void video.play().catch(() => { /* The poster remains available if autoplay is blocked. */ });
    };
    const loaded = () => { timer = setTimeout(() => { ready = true; update(); }, 250); };
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; update(); }, { threshold: 0.05 });
    observer.observe(video);
    if (document.readyState === 'complete') loaded();
    else window.addEventListener('load', loaded, { once: true });
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect(); clearTimeout(timer); video.pause();
      window.removeEventListener('load', loaded); document.removeEventListener('visibilitychange', update);
    };
  }, [src]);
  return <video ref={ref} autoPlay muted loop playsInline preload="none" poster={poster} className={className} aria-label={label} aria-hidden={label ? undefined : true} width={width} height={height} />;
}
