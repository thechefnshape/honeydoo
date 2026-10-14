'use client';
import { useEffect, useRef, useState } from 'react';
import bee from './bee-paths.json';
import letters from './letters-path.json';

// Launch splash: the official wordmark, the bee lifts, makes one small loop, settles home, then the app is revealed.
// Shown once per browser session. Tap or press any key to skip. Reduced-motion users get a short still frame.

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (x: number) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const KEY = 'hd_splash_seen';
const END = 2.85;

function frame(t: number) {
  let dx = 0, dy = -10 * ease((t - 0.45) / 0.35);
  if (t >= 0.85 && t <= 1.55) { const th = ease((t - 0.85) / 0.7) * Math.PI * 2; dx = 11 - 11 * Math.cos(th); dy += -11 * Math.sin(th) * 0.82; }
  if (t >= 1.55) dy = -10 * (1 - easeOut((t - 1.55) / 0.35));
  let wing = 0;
  if (t >= 0.35 && t <= 1.8) wing = ease((t - 0.35) / 0.25) * (1 - ease((t - 1.55) / 0.25)) * 11 * Math.sin(2 * Math.PI * 11 * (t - 0.35));
  else if (t >= 1.95 && t <= 2.2) { const k = (t - 1.95) / 0.25; wing = 7 * Math.sin(Math.PI * k) * Math.sin(3 * Math.PI * k); }
  return { dx, dy, wing, mark: ease((t - 0.05) / 0.35), tag: ease((t - 1.3) / 0.4), exit: ease((t - 2.35) / 0.5) };
}

export function Splash() {
  const [show, setShow] = useState(false);
  const beeRef = useRef<SVGGElement>(null);
  const wa = useRef<SVGPathElement>(null);
  const wb = useRef<SVGPathElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === '1'; sessionStorage.setItem(KEY, '1'); } catch { /* storage blocked: show once per load */ }
    if (!seen) setShow(true);
    const replay = () => setShow(true);
    window.addEventListener('hd:splash', replay);
    return () => window.removeEventListener('hd:splash', replay);
  }, []);

  useEffect(() => {
    if (!show) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let raf = 0; let skipAt: number | null = null;
    const skip = () => { if (skipAt === null) skipAt = (performance.now() - start) / 1000; };
    window.addEventListener('keydown', skip); root.current?.addEventListener('pointerdown', skip);
    document.documentElement.style.overflow = 'hidden';
    const tick = (now: number) => {
      let t = (now - start) / 1000;
      if (reduce) t = t < 0.7 ? 1.9 : 1.9 + (t - 0.7) * 1.4;   // still frame, then fade
      if (skipAt !== null) t = Math.max(t, 2.35 + ((now - start) / 1000 - skipAt));
      const f = frame(Math.min(t, END));
      beeRef.current?.setAttribute('transform', `translate(${f.dx.toFixed(2)} ${f.dy.toFixed(2)})`);
      wa.current?.setAttribute('transform', `rotate(${(-f.wing).toFixed(2)} ${bee.rootA[0]} ${bee.rootA[1]})`);
      wb.current?.setAttribute('transform', `rotate(${f.wing.toFixed(2)} ${bee.rootB[0]} ${bee.rootB[1]})`);
      if (mark.current) { mark.current.style.opacity = String(f.mark); mark.current.style.transform = `scale(${1 + f.exit * 0.06})`; }
      if (tag.current) { tag.current.style.opacity = String(f.tag * (1 - f.exit)); tag.current.style.transform = `translateY(${(1 - f.tag) * 6}px)`; }
      if (root.current) root.current.style.opacity = String(1 - f.exit);
      if (t < END) raf = requestAnimationFrame(tick);
      else { document.documentElement.style.overflow = ''; if (root.current) root.current.style.opacity = '1'; setShow(false); }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', skip); document.documentElement.style.overflow = ''; };
  }, [show]);

  if (!show) return null;
  return (
    <div ref={root} className="fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-white" role="img" aria-label="honeydoo">
      <div ref={mark} className="w-[min(72vw,440px)] will-change-transform" style={{ opacity: 0 }}>
        <svg viewBox={`0 -14 ${letters.w} ${letters.h + 14}`} className="h-auto w-full overflow-visible" aria-hidden>
          <path d={letters.letters} fill="#0B0B0B" />
          <g ref={beeRef}>
            <path ref={wa} d={bee.wingA} fill="#0B0B0B" />
            <path ref={wb} d={bee.wingB} fill="#FFC629" />
            <path d={bee.body} fill="#FFC629" />
          </g>
        </svg>
      </div>
      <p ref={tag} className="mt-6 text-[15px] font-medium tracking-[-0.01em] text-charcoal" style={{ opacity: 0 }}>Anything local. Just ask.</p>
    </div>
  );
}
