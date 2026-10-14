# honeydoo build kit

Everything needed to build honeydoo from scratch in Bolt (or another AI builder).

| File | What it is |
| --- | --- |
| `MASTER_BUILD_PROMPT.md` | Part 0 (master brief) and eight build phases with acceptance checks. Paste Part 0 plus Phase 1 first, then one phase at a time. |
| `honeydoo-logo.svg` | The official wordmark. The double "oo" is the bee. Attach it; never redraw it. |
| `honeydoo-bee.svg` | The bee on its own, for the favicon, loading states and tab icons. |
| `demo-catalog.json` | The 9 fictional Lakewood demo shops and 51 products with prices (cents), sizes, options, stock, hours and photos. |

The working reference implementation is the rest of this repository (Next.js). If the demo shops in `db/seed/` change, `demo-catalog.json` needs regenerating to match.
