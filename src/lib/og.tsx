import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import bee from '@/components/bee-paths.json';
import letters from '@/components/letters-path.json';

// Link-preview cards (Open Graph). 1200 x 630, brand type and colors, the shop or product photo on
// the right when one exists. Rendered on demand and cached by the CDN.

export const OG_SIZE = { width: 1200, height: 630 };
const INK = '#0B0B0B', CHARCOAL = '#333333', HONEY = '#FFC629', STONE = '#EDEDED';

let fonts: Promise<{ name: string; data: Buffer; weight: 500 | 700; style: 'normal' }[]> | null = null;
const loadFonts = () => (fonts ??= Promise.all(([500, 700] as const).map(async (weight) => ({
  name: 'Figtree', weight, style: 'normal' as const,
  data: await readFile(path.join(process.cwd(), 'assets/fonts', `figtree-latin-${weight}-normal.woff`)),
}))));

/** Fetches a photo as a data URL (JPEG). Returns null on any failure so a card always renders. */
async function photo(url: string | null | undefined): Promise<string | null> {
  if (!url || !/^https:\/\//.test(url)) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'images.unsplash.com') { u.searchParams.set('w', '1000'); u.searchParams.set('h', '1260'); u.searchParams.set('fit', 'crop'); u.searchParams.set('fm', 'jpg'); u.searchParams.set('q', '70'); }
    const r = await fetch(u, { signal: AbortSignal.timeout(3000) });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !/image\/(jpeg|png)/.test(type)) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 4_000_000 ? null : `data:${type};base64,${buf.toString('base64')}`;
  } catch { return null; }
}

const Wordmark = ({ height }: { height: number }) => (
  <svg width={(letters.w / (letters.h + 12)) * height} height={height} viewBox={`0 -12 ${letters.w} ${letters.h + 12}`}>
    <path d={letters.letters} fill={INK} />
    <path d={bee.wingA} fill={INK} /><path d={bee.wingB} fill={HONEY} /><path d={bee.body} fill={HONEY} />
  </svg>
);
const Bee = ({ size }: { size: number }) => {
  const [x, y, w, h] = bee.box;
  return (
    <svg width={size * (w / h)} height={size} viewBox={`${x} ${y} ${w} ${h}`}>
      <path d={bee.wingA} fill={INK} /><path d={bee.wingB} fill={HONEY} /><path d={bee.body} fill={HONEY} />
    </svg>
  );
};

export async function ogCard(o: { eyebrow?: string; title: string; detail?: string; image?: string | null }) {
  const [f, img] = await Promise.all([loadFonts(), photo(o.image)]);
  const title = o.title.length > 60 ? `${o.title.slice(0, 57)}...` : o.title;
  const titleSize = title.length > 34 ? 60 : 76;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#FFFFFF', fontFamily: 'Figtree' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 64px 56px' }}>
          <Wordmark height={52} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {o.eyebrow && <div style={{ fontSize: 26, fontWeight: 500, color: CHARCOAL, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 18 }}>{o.eyebrow}</div>}
            <div style={{ fontSize: titleSize, fontWeight: 700, color: INK, lineHeight: 1.05, letterSpacing: -1.5 }}>{title}</div>
            {o.detail && <div style={{ fontSize: 30, fontWeight: 500, color: CHARCOAL, marginTop: 22, lineHeight: 1.3 }}>{o.detail}</div>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: 44, height: 8, borderRadius: 4, background: HONEY, marginRight: 16 }} />
            <div style={{ fontSize: 24, fontWeight: 500, color: CHARCOAL }}>Order ahead. Pick up local.</div>
          </div>
        </div>
        {img
          ? <img src={img} width={500} height={630} style={{ objectFit: 'cover' }} />
          : <div style={{ width: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', background: STONE }}><Bee size={190} /></div>}
      </div>
    ),
    { ...OG_SIZE, fonts: f, headers: { 'cache-control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' } },
  );
}
