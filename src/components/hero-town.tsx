'use client';
import { useEffect, useRef } from 'react';
import bee from './bee-paths.json';

// The hero's main street. On larger screens the storefronts frame the headline from both sides,
// with a small market stall under the search box; on phones the street runs along the bottom.
// The bee flies shop to shop leaving a dotted flight path, and the shop it visits comes alive.

type Kind = 'awning' | 'arch' | 'gable' | 'tall' | 'sign' | 'round';
type Shop = { x: number; w: number; h: number; kind: Kind };
interface Scene {
  W: number; H: number; GROUND: number; shops: Shop[]; trees: [number, number][]; order: number[]; viewBox?: string;
  benches?: number[]; planters?: number[];
  peak: (dx: number, fromY: number) => number;
}

const FRAME: Scene = {
  W: 1200, H: 600, GROUND: 572,
  shops: [
    { x: 8, w: 132, h: 410, kind: 'tall' },
    { x: 150, w: 128, h: 270, kind: 'awning' },
    { x: 520, w: 160, h: 108, kind: 'sign' },
    { x: 922, w: 130, h: 290, kind: 'arch' },
    { x: 1062, w: 132, h: 380, kind: 'round' },
  ],
  trees: [[300, 12], [348, 16], [488, 13], [722, 13], [858, 16], [904, 12]],
  benches: [384, 768],
  planters: [456, 694, 748],
  order: [2, 1, 3, 0, 4],
  peak: (dx, fromY) => Math.min(fromY - 70, 90 + dx * 0.42),
};

const BAND: Scene = {
  W: 1200, H: 380, GROUND: 352,
  shops: [
    { x: 40, w: 150, h: 196, kind: 'awning' },
    { x: 232, w: 128, h: 231, kind: 'gable' },
    { x: 404, w: 170, h: 175, kind: 'sign' },
    { x: 620, w: 132, h: 256, kind: 'tall' },
    { x: 796, w: 150, h: 189, kind: 'arch' },
    { x: 990, w: 160, h: 214, kind: 'round' },
  ],
  trees: [[205, 14], [386, 14], [594, 14], [774, 14], [968, 14]],
  order: [2, 4, 3],
  viewBox: '330 0 700 380',
  peak: (dx) => 70 + dx * 0.08,
};

// Idle shops are faint outlines; a visited shop gets ink lines, honey accents and lit windows.
const CSS = `
.ts { opacity: .5; transition: opacity .6s ease; }
.ts * { transition: fill .6s ease, stroke .6s ease; }
.ts .b { fill: #fff; stroke: #E4E4E1; }
.ts .p { fill: #F7F7F6; stroke: #E4E4E1; }
.ts .a { fill: #F7F7F6; stroke: #E4E4E1; }
.ts .l { fill: none; stroke: #E4E4E1; }
.ts .k { fill: #E4E4E1; }
.ts.lit { opacity: 1; }
.ts.lit .b { stroke: #333333; }
.ts.lit .p { fill: #FFE9A8; stroke: #333333; }
.ts.lit .a { fill: #FFC629; stroke: #333333; }
.ts.lit .l { stroke: #333333; }
.ts.lit .k { fill: #333333; }
.tt { fill: #F7F7F6; stroke: #E4E4E1; }
.ts.lit .dr { fill: #FFF4D1; }
.ts .life { opacity: 0; transition: opacity .35s ease; }
.ts.lit .life { opacity: 1; }
.ts.lit .ring { animation: hd-ring 1.3s ease-out infinite; transform-box: fill-box; transform-origin: center; }
.ts.lit .tag { animation: hd-tag .6s .25s cubic-bezier(.3,1.6,.5,1) both; }
.ts .fl { fill: #E4E4E1; transition: fill .6s ease; }
.ts.lit .fl { fill: #FFC629; }
.tree { transform-box: fill-box; transform-origin: 50% 100%; animation: hd-sway 4s ease-in-out infinite alternate; }
@keyframes hd-ring { from { transform: scale(.6); opacity: .9; } to { transform: scale(1.6); opacity: 0; } }
@keyframes hd-tag { from { transform: scale(0); } to { transform: scale(1); } }
@keyframes hd-walk { 0% { transform: translate(0, 0); opacity: 0; } 12% { opacity: 1; } 25% { transform: translate(-10px, -2px); } 50% { transform: translate(-22px, 0); } 75% { transform: translate(-34px, -2px); } 100% { transform: translate(-44px, 0); opacity: 1; } }
@keyframes hd-sway { from { transform: rotate(-1.6deg); } to { transform: rotate(1.6deg); } }
@media (prefers-reduced-motion: reduce) { .ts *, .tree, .ts .ring, .ts .tag { animation: none !important; transition: none !important; } }
`;

function Bench({ x, G }: { x: number; G: number }) {
  return (
    <g stroke="#D6D6D2" strokeWidth={1.6} strokeLinecap="round" fill="none">
      <path d={`M${x} ${G - 14} h50 M${x + 2} ${G - 26} h46`} />
      <path d={`M${x + 6} ${G - 14} v14 M${x + 44} ${G - 14} v14 M${x + 6} ${G - 26} v12 M${x + 44} ${G - 26} v12`} />
    </g>
  );
}

function Planter({ x, G }: { x: number; G: number }) {
  return (
    <g>
      <path d={`M${x - 6} ${G - 12} v-8 M${x} ${G - 12} v-12 M${x + 6} ${G - 12} v-7`} stroke="#D6D6D2" strokeWidth={1.4} strokeLinecap="round" />
      <circle cx={x - 6} cy={G - 22} r={3.4} fill="#FFD95C" />
      <circle cx={x} cy={G - 26} r={3.8} fill="#FFC629" />
      <circle cx={x + 6} cy={G - 21} r={3.2} fill="#FFE08A" />
      <rect x={x - 13} y={G - 12} width={26} height={12} rx={2} fill="#F7F7F6" stroke="#D6D6D2" strokeWidth={1.4} />
    </g>
  );
}

function Storefront({ s, i, G }: { s: Shop; i: number; G: number }) {
  const top = G - s.h, cx = s.x + s.w / 2;
  const win = { x: s.x + 16, y: G - 74, w: s.w / 2 - 22, h: 44 };
  const floors = Math.max(0, Math.floor((s.h - 110) / 46));
  return (
    <g className="ts" data-shop={i} strokeWidth={1.6} strokeLinejoin="round">
      {s.kind === 'gable' && <path className="b" d={`M${s.x - 6} ${top + 4} L${cx} ${top - 30} L${s.x + s.w + 6} ${top + 4} Z`} />}
      <rect className="b" x={s.x} y={top} width={s.w} height={s.h} rx={3} />
      {Array.from({ length: floors }).map((_, r) => [0, 1].map((c) => (
        <rect key={`${r}-${c}`} className="p" strokeWidth={1.2} style={{ transitionDelay: `${(floors - r) * 90 + c * 45}ms` }} x={s.x + 18 + c * (s.w / 2 - 6)} y={top + (s.kind === 'awning' ? 56 : 22) + r * 46} width={s.w / 2 - 30} height={26} rx={2} />
      )))}
      {s.kind === 'sign' && <rect className="a" x={s.x + 26} y={top - 16} width={s.w - 52} height={18} rx={9} />}
      {s.kind === 'tall' && <rect className="a" x={s.x + 30} y={top - 12} width={s.w - 60} height={12} rx={6} />}
      {s.kind === 'awning' && (
        <g>
          <path className="b" d={`M${s.x - 6} ${top + 22} h${s.w + 12} l-8 20 h${-(s.w - 4)} Z`} />
          {Array.from({ length: 7 }).map((_, k) => <rect key={k} className="a" stroke="none" x={s.x - 2 + k * ((s.w + 4) / 7)} y={top + 23} width={(s.w + 4) / 14} height={18} />)}
        </g>
      )}
      {s.kind === 'round' && <rect className="b" x={s.x - 5} y={top - 8} width={s.w + 10} height={8} rx={2} />}
      {s.kind === 'arch'
        ? <path className="p" strokeWidth={1.2} d={`M${win.x} ${win.y + win.h} v-26 a${win.w / 2} ${win.w / 2} 0 0 1 ${win.w} 0 v26 Z`} />
        : <rect className="p" strokeWidth={1.2} x={win.x} y={win.y} width={win.w} height={win.h} rx={3} />}
      <g>
        {[0.2, 0.5, 0.8].map((f) => <circle key={f} className="fl" cx={win.x + win.w * f} cy={win.y + win.h + 1} r={3} />)}
        <rect className="b" x={win.x - 2} y={win.y + win.h + 2} width={win.w + 4} height={7} rx={2} />
      </g>
      <rect className="b dr" x={cx + 6} y={G - 64} width={s.w / 2 - 22} height={64} rx={3} />
      <circle className="k" cx={cx + 12} cy={G - 32} r={1.8} />
      <g className="life">
        <circle className="ring" cx={cx + 6 + (s.w / 2 - 22) / 2} cy={G - 32} r={22} fill="none" stroke="#FFC629" strokeWidth={2} />
        <g className="tag" style={{ transformOrigin: `${win.x + win.w / 2}px ${G - 52}px` }}>
          <rect x={win.x + win.w / 2 - 18} y={G - 62} width={36} height={20} rx={10} fill="#0B0B0B" />
          <path d={`M${win.x + win.w / 2 - 6} ${G - 52} l4 4 l8 -9`} fill="none" stroke="#FFC629" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </g>
    </g>
  );
}

function Street({ scene, className }: { scene: Scene; className: string }) {
  const { W, H, GROUND: G, shops, trees, order } = scene;
  const svg = useRef<SVGSVGElement>(null);
  const beeG = useRef<SVGGElement>(null);
  const wa = useRef<SVGPathElement>(null);
  const wb = useRef<SVGPathElement>(null);
  const trail = useRef<SVGPathElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const door = (s: Shop) => ({ x: s.x + s.w / 2 + 6 + (s.w / 2 - 22) / 2, y: G - 58 }); // hover above the door
    const S = 0.17;
    const [bx, by, bw, bh] = bee.box;
    const place = (x: number, y: number, tilt: number, wing: number) => {
      beeG.current?.setAttribute('transform', `translate(${(x - (bx + bw / 2) * S).toFixed(1)} ${(y - (by + bh / 2) * S).toFixed(1)}) scale(${S}) rotate(${tilt.toFixed(1)} ${bx + bw / 2} ${by + bh / 2})`);
      wa.current?.setAttribute('transform', `rotate(${(-wing).toFixed(1)} ${bee.rootA[0]} ${bee.rootA[1]})`);
      wb.current?.setAttribute('transform', `rotate(${wing.toFixed(1)} ${bee.rootB[0]} ${bee.rootB[1]})`);
    };
    const light = (i: number | null) => svg.current?.querySelectorAll<SVGGElement>('.ts').forEach((g) => g.classList.toggle('lit', Number(g.dataset.shop) === i));

    if (reduce) { const d = door(shops[order[0]]); place(d.x, d.y - 30, 0, 0); light(order[0]); return; }

    const FLY = 2.6, HOVER = 1.8, LEG = FLY + HOVER;
    const pos = (from: { x: number; y: number }, to: { x: number; y: number }, e: number, t: number) => {
      const peak = scene.peak(Math.abs(to.x - from.x), from.y - 30);
      return { x: from.x + (to.x - from.x) * e, y: from.y - 30 - Math.sin(Math.PI * e) * peak + Math.sin(t * 6) * 2 };
    };
    let raf = 0, visible = false, paused = 0, pausedAt = performance.now(), lit: number | null = -1;
    const t0 = performance.now();
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting && visible) { visible = false; pausedAt = performance.now(); cancelAnimationFrame(raf); }
      else if (e.isIntersecting && !visible) { visible = true; paused += performance.now() - pausedAt; raf = requestAnimationFrame(tick); }
    });
    if (svg.current) io.observe(svg.current);

    function tick(now: number) {
      const t = Math.max(0, (now - t0 - paused) / 1000); // rAF timestamps can trail performance.now()
      const leg = Math.floor(t / LEG), u = t - leg * LEG;
      const a = order[leg % order.length], b = order[(leg + 1) % order.length];
      const from = door(shops[a]), to = door(shops[b]);
      const flap = 11 * Math.sin(2 * Math.PI * 11 * t);
      let x: number, y: number, tilt = 0, target: number | null;
      if (u < FLY) {
        const p = u / FLY, e = p * p * (3 - 2 * p);
        ({ x, y } = pos(from, to, e, t));
        tilt = Math.sign(to.x - from.x) * 10 * Math.sin(Math.PI * e);
        target = p < 0.12 ? a : null;
      } else {
        const h = u - FLY;
        x = to.x + Math.sin(h * 2.4) * 6; y = to.y - 30 + Math.sin(h * 4.2) * 4;
        target = b;
      }
      if (trail.current) {
        const p = Math.min(1, u / FLY), steps = Math.max(2, Math.round(60 * p));
        let d = '';
        for (let k = 0; k <= steps; k++) {
          const q = (k / steps) * p, e = q * q * (3 - 2 * q);
          const pt = pos(from, to, e, leg * LEG + q * FLY);
          d += `${k ? 'L' : 'M'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        }
        trail.current.setAttribute('d', d);
        trail.current.style.opacity = String(u < FLY ? 0.55 : Math.max(0, 0.55 * (1 - (u - FLY) / 1.0)));
      }
      if (target !== lit) { light(target); lit = target; }
      place(x, y, tilt, flap);
      raf = requestAnimationFrame(tick);
    }
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [scene, G, shops, order]);

  return (
    <div className={`pointer-events-none absolute overflow-hidden ${className}`} aria-hidden>
      <svg ref={svg} viewBox={scene.viewBox ?? `0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" className="h-full w-full">
        <style>{CSS}</style>
        {trees.map(([x, r], i) => (
          <g key={x} className="tree" style={{ animationDelay: `${-(i * 0.7) % 4}s` }}>
            <line x1={x} y1={G} x2={x} y2={G - r * 1.9} stroke="#E4E4E1" strokeWidth={1.6} strokeLinecap="round" />
            <circle className="tt" cx={x} cy={G - r * 1.9 - r + 2} r={r} strokeWidth={1.4} />
          </g>
        ))}
        {shops.map((s, i) => <Storefront key={i} s={s} i={i} G={G} />)}
        {scene.benches?.map((x) => <Bench key={x} x={x} G={G} />)}
        {scene.planters?.map((x) => <Planter key={x} x={x} G={G} />)}
        <line x1={0} y1={G} x2={W} y2={G} stroke="#E4E4E1" strokeWidth={1.6} />
        <path ref={trail} fill="none" stroke="#333333" strokeWidth={2.4} strokeDasharray="0.1 9" strokeLinecap="round" style={{ opacity: 0 }} />
        <g ref={beeG}>
          <path ref={wa} d={bee.wingA} fill="#0B0B0B" />
          <path ref={wb} d={bee.wingB} fill="#FFC629" />
          <path d={bee.body} fill="#FFC629" />
        </g>
      </svg>
    </div>
  );
}

/** Place inside a `relative` hero. Frames the content on sm+ screens; a street band on phones. */
export function HeroTown() {
  return (
    <>
      <Street scene={FRAME} className="inset-0 hidden sm:block" />
      <Street scene={BAND} className="inset-x-0 bottom-0 h-[260px] sm:hidden" />
    </>
  );
}
