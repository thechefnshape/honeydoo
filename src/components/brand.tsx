import bee from './bee-paths.json';
import letters from './letters-path.json';

// Official honeydoo mark, traced to vectors from the approved brand board.
// Replace bee-paths.json / letters-path.json with paths from the original vector master when available.

export function Wordmark({ className = '', tone = 'light', title = 'honeydoo' }: { className?: string; tone?: 'light' | 'dark'; title?: string }) {
  const ink = tone === 'light' ? '#0B0B0B' : '#FFFFFF';
  return (
    <svg viewBox={`0 -12 ${letters.w} ${letters.h + 12}`} className={`overflow-visible ${className}`} role="img" aria-label={title}>
      <path d={letters.letters} fill={ink} />
      <g className="bee-body-group">
        <path className="bee-wing-a" d={bee.wingA} fill={ink} style={{ transformOrigin: `${bee.rootA[0]}px ${bee.rootA[1]}px` }} />
        <path className="bee-wing-b" d={bee.wingB} fill="#FFC629" style={{ transformOrigin: `${bee.rootB[0]}px ${bee.rootB[1]}px` }} />
        <path d={bee.body} fill="#FFC629" />
      </g>
    </svg>
  );
}

/** The bee (double-O) on its own. `thinking` flutters the wings; reduced-motion users see it still. */
export function BeeMark({ className = '', thinking = false, tone = 'light', label }: { className?: string; thinking?: boolean; tone?: 'light' | 'dark' | 'mono'; label?: string }) {
  const [x, y, w, h] = bee.box;
  const wing = tone === 'dark' ? '#FFFFFF' : '#0B0B0B';
  const honey = tone === 'mono' ? 'currentColor' : '#FFC629';
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} className={`overflow-visible ${className} ${thinking ? "bee-thinking" : ""}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g className="bee-body-group">
        <path className="bee-wing-a" d={bee.wingA} fill={tone === 'mono' ? 'currentColor' : wing} style={{ transformOrigin: `${bee.rootA[0]}px ${bee.rootA[1]}px` }} />
        <path className="bee-wing-b" d={bee.wingB} fill={honey} style={{ transformOrigin: `${bee.rootB[0]}px ${bee.rootB[1]}px` }} />
        <path d={bee.body} fill={honey} />
      </g>
    </svg>
  );
}
