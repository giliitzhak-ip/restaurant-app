# Media

## Why it is generated

A luxury surfaces brand lives on photography, and this build ships without
any. Rather than fill the site with grey boxes — or commit tens of megabytes of
stock imagery — every placeholder is **rendered procedurally** from the recipes
in `src/data/catalog-seed.ts`:

```bash
npm run media:generate        # force a rebuild
npm run dev                   # generates on first run if missing
```

Output (git-ignored, ~110 MB):

```
public/media/
  textures/<slug>.png          seamless texture + -thumb.png (the designer uses these)
  products/<slug>-studio.png   sample board on gallery paper
  products/<slug>-room.png     the product in a rendered interior
  products/<slug>-detail.png   macro crop
  scenes/<key>.png             hero, before/after, inspiration, projects
  categories/<slug>.png        category tiles
  collections/<slug>.png       collection covers
```

## How it works

- `scripts/lib/textures.ts` — procedural materials: wood (two grain scales plus
  a warp for cathedral figure, knots, bevels), parquet blocks, stone (bedding
  planes, veins, pores), concrete, slat panels, brick, terrazzo, brushed metal.
  Every tile is seamless: the noise lattice wraps on its period.
- `scripts/lib/scene.ts` — a small renderer that builds a room (back wall, two
  side walls, ceiling, floor, one window) and projects textures into it with the
  same projective maths the browser engine uses on customer photos.
- `scripts/lib/png.ts` — a dependency-free PNG encoder, so the pipeline needs
  no native image libraries.

## Replacing placeholders with real photography

Nothing in the app builds a media path outside
[`src/lib/media.ts`](../src/lib/media.ts), and every record stores a plain URL.
So you have three options, in increasing order of effort:

1. **Drop-in replacement** — put real files at the same paths under
   `public/media/…`. Zero code changes.
2. **Per-record URLs** — edit the product in the admin panel and upload or paste
   a CDN URL. This is the normal path in production, and it is the same screen
   that manages the **texture** used by the room designer.
3. **A different CDN layout** — change the builders in `src/lib/media.ts`, add
   the host to `images.remotePatterns` in `next.config.ts`, done.

## Texture requirements (important)

The room designer only looks as good as its textures. For each product:

| Field | Meaning |
| ----- | ------- |
| `imageUrl` | Seamless, evenly lit, shadow-free, taken straight on. 1000–2000 px on the long edge is plenty. |
| `thumbnailUrl` | ~160 px swatch for the drawer. |
| `widthCm` / `heightCm` | **Real-world size of the whole image.** A tile showing four 19 × 190 cm planks is 76 × 190 cm. |
| `repeatX` / `repeatY` | How many product units are visible inside the image (shown in admin, used for copy). |
| `patternType` | `PLANK` gets row stagger; `TILE`, `PANEL`, `STONE`, `CUSTOM` do not. |
| `orientation` | Default direction. Herringbone products ship a parquet-block tile plus `DIAGONAL`. |
| `scaleFactor` | Per-product nudge if the supplier's scan is not exactly to size. |

Get `widthCm`/`heightCm` wrong and the planks come out the wrong size in every
room — it is the single most important number in the product record.
