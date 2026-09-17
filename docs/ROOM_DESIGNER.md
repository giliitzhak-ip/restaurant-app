# Room designer

The feature the rest of the site exists to serve: a customer photographs their
room and sees a **real product** on their floor or wall, in perspective, with
the room's own light.

```
photo ──► prepare (browser)         downscale + 128px preview
      ──► analyze (server action)   RoomVisionProvider → normalised masks
      ──► render  (browser)         homography + texture tiling + relighting
      ──► save    (server action)   storage driver + RoomDesign/RoomSurface
      ──► cart / quote
```

## 1. Segmentation is provider-agnostic

`RoomVisionProvider` ([providers/types.ts](../src/features/room-designer/providers/types.ts))
is the whole contract:

```ts
analyzeRoom(image)                 // masks + objects + quality metrics
segmentFloor(image)
segmentWalls(image)
generateMask(image, surface)
renderTexture?(request)            // optional server-side compositing
```

Two implementations ship:

**`mock-provider.ts` — local heuristic (default).** Not a neural network and it
does not pretend to be one. On the 128 px preview it:

- samples a median floor colour from the bottom-centre block, then walks *up*
  every column while the pixel still matches, tolerating a few rows of shadow.
  The resulting boundary hugs skirting and furniture instead of cutting a
  straight line across the room;
- does the mirror walk from the top for the ceiling line;
- averages each column's wall band and takes the two strongest colour
  transitions as the room's corners, giving one, two or three wall masks;
- flood-fills bright blobs in the wall band as **windows** (which become holes
  in the wall mask, so cladding stops at the frame) and off-colour blobs in the
  floor band as **furniture** (holes in the floor mask);
- scores brightness and variance-of-Laplacian sharpness, producing the
  `LOW_LIGHT`, `BLURRY` and `LOW_RESOLUTION` warnings.

Cost: a few milliseconds, no API key, and no customer photo leaving the device
beyond a thumbnail.

**`remote-provider.ts` — hosted model.** Set `ROOM_VISION_PROVIDER=remote`,
`ROOM_VISION_API_URL` and `ROOM_VISION_API_KEY`. The expected response is
normalised polygons:

```json
{ "surfaces": [ { "kind": "FLOOR", "confidence": 0.94,
                  "polygon": [[0.02,0.61],[0.98,0.58],[1,1],[0,1]],
                  "holes": [[[0.3,0.7],[0.5,0.7],[0.5,0.9],[0.3,0.9]]] } ],
  "objects":  [ { "kind": "WINDOW", "polygon": [[...]] } ] }
```

If the call fails, times out or returns nothing usable, the heuristic provider
answers instead — the customer never hits a dead end, and manual marking is
always one tap away.

## 2. Rendering keeps the room's light

[`engine/`](../src/features/room-designer/engine) is plain TypeScript on
`ImageData`:

- **`geometry.ts`** reduces a mask to its corner quad and solves the
  homography from photo pixels to **centimetres on the surface plane**. A
  single photo has no absolute scale, so exactly one number is calibrated by
  the customer: room width for floors (slider, default 4 m); walls assume a
  2.6 m ceiling. The estimated m² comes from the same transform, which is why
  the number moves when the calibration does.
- **`mask.ts`** rasterises the polygon minus its holes into an alpha map with a
  feathered edge, using the canvas path filler (`evenodd`).
- **`render.ts`** walks the mask bounding box and, per pixel: maps to plane
  centimetres, applies orientation (horizontal / vertical / 45° diagonal),
  scale, row stagger for plank patterns, and pattern offsets; samples the
  texture bilinearly with wrap; then **relights** it by the ratio between that
  pixel's original luminance and the mask's mean luminance. That last step is
  what keeps shadows, light pools and furniture contact intact instead of
  producing a flat sticker.

Only masked pixels are written, so walls, furniture, windows, doors and people
are untouched by construction.

## 3. Controls map to real decisions

Orientation, plank size, brightness, pattern alignment, row stagger, how much
original lighting to keep, and room-width calibration — each is a choice a
customer would otherwise make with an installer. Products carry their own
defaults (`orientation`, `scaleFactor`) so the first render is already sensible.

## 4. Real products only

The renderer tiles `ProductTexture.imageUrl` — the texture of the product the
customer selected. No generative model invents a floor, so what appears on
screen is as close as a still image gets to what will be delivered. Texture
requirements are in [MEDIA.md](MEDIA.md#texture-requirements-important).

## 5. Every state is designed

Loading, empty, provider failure, no floor detected, no wall detected, low
light, blurry, low resolution, camera permission denied, camera unsupported,
decode failure — each has Hebrew copy and a way forward, and the way forward is
always the same reliable one: **mark the surface by hand** (tap the outline,
undo, finish) and optionally exclude a rug or a sofa.

## 6. Saving and buying

"Save design" uploads the working photo (only now) and the rendered canvas,
then writes `RoomDesign` + one `RoomSurface` per surface with its mask and
settings, so the design can be reopened and edited later. "Add to cart" adds
every selected product sized by its surface's estimated area, tagged with the
design name, and the quote form attaches the render automatically.

Guests can do all of this: designs are held against a guest cookie and adopted
on sign-up.
