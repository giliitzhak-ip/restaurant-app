# The room designer

A customer uploads a photograph of their room, chooses a cladding, and
arranges furniture and lighting on it. This is how that works, what it is
honest about, and what it cannot do.

## Two halves

**Surfaces.** The original feature: a wall or floor is masked, a product's
texture is mapped onto it per pixel through a homography, and relit from the
photograph's own shading. `src/features/room-designer/engine/`.

**The scene.** Everything else in the room — objects, lighting fixtures and
drawn LED runs. `src/types/scene.ts` defines it; it is stored as structured
JSON on `RoomDesign.scene`, not as a flattened image, so a design reopens
editable and swapping the cladding leaves the television where it was.

They are edited by different parts of the app, and a save that carries only
one leaves the other alone.

## Why the rendering is split

The cladding is drawn per pixel onto a `<canvas>`. Everything above it —
hidden light, objects, front light, guides, handles — is DOM and SVG.

That is the whole performance design. Dragging a television moves one
element's `transform`, which the compositor handles without the main thread
and without the texture renderer running at all. Doing the same work per pixel
would mean re-rasterising the room sixty times a second to move a rectangle.

The cost is that the canvas alone is a photograph of an empty room. Anything
that exports an image goes through `engine/compose.ts`, which flattens the
whole stack at full resolution — the one expensive render in the feature, run
at most once per save.

## Coordinates

Everything positional is normalised to the photo, 0..1 on each axis, for the
same reason the surface masks are: a design saved on a phone has to reopen
correctly on a desktop, and a preview at 1200px has to agree with a download
at 3000px.

The trap, and it is worth knowing before touching `factory.ts`: normalised
units are relative to a **different number of pixels on each axis**. A square
object is not `width === height` in that space, it is
`height = width × (imageWidth / imageHeight)`. Skip the factor and every object
in the room is stretched by the photo's aspect ratio — 50% on a 3:2 photo.
`tests/unit/scene-geometry.test.ts` exists entirely because of this.

## Real dimensions

Every library asset carries real centimetres, and the editor converts them
against the room width the customer sets. That is what makes a 65" read as a
65" and a 200cm sideboard span the right number of floor planks. It is also
what the "110 from the floor" readout is computed from.

Without it the first drop is a guess and the customer is dragging rather than
nudging.

## What it does not claim

The brief was explicit, and so is the code:

- **No computed perspective.** "Fit to wall" is offered only when the surface
  mask is genuinely a quadrilateral — four corners that correspond to a flat
  plane. A mask with nine points is an outline traced around a sofa and a
  radiator, and picking four of them would produce a confident-looking
  perspective built on nothing. There the editor says the shape is not enough
  and hands over four corners to drag.
- **No photometry.** A glow is a blurred gradient with a blend mode, not a
  light simulation. `t.designer.lightingDisclaimer` appears wherever lighting
  is on screen.
- **No invented products.** An object is purchasable only when it carries a
  `productId` that resolves to a live catalogue row, checked on the server on
  every save. Everything else is labelled "להמחשה בלבד", is listed in the bill
  of materials so the design reads as a whole, and cannot enter a basket.
- **No invented prices.** There is no price column on a library asset. The
  price comes from the linked product, read on every read.

## The object library

Forty vector objects across twenty categories, drawn by
`scripts/generate-objects.ts` from `src/data/object-library.ts` — one list
that the generator, the seed and the drawer all read, so a seeded row cannot
point at artwork nobody produced.

They are SVG because an SVG is kilobytes where a transparent PNG big enough
for a 3000px export is hundreds, it stays sharp when someone pinches into a
corner, and its transparency is exact rather than a matte that fringes against
dark cladding. The whole library is 138 KB.

They are illustrations and look like illustrations. They carry no brand and
nothing is seeded as for sale.

Administrators manage the library at `/admin/objects`: categories, artwork,
real dimensions, snap target, display order, visibility, and the link to a
catalogue product that makes an item purchasable.

SVG uploads are refused through the admin form. An SVG is a document: sharp
would rasterise it and throw away the reason to use one, and passing it
through untouched would let a `<script>` inside it run in every customer's
designer. Vector artwork goes through the generator, which is code and gets
reviewed. PNG uploads get the usual decode-and-re-encode, with alpha quality
at 100 so a cut-out edge does not halo.

## Privacy

Unchanged from the rest of the designer, and it matters more here because
customers now upload photographs of their own furniture:

- A custom object is cut out **in the browser**, so the file that leaves the
  device is only the part they chose.
- It is then size-checked, identified by magic bytes, decoded and re-encoded
  by us — no polyglot survives, and the EXIF, including where the photo was
  taken, does not.
- It is stored against that customer's design and nowhere else. Nothing writes
  a customer's upload to the shared library: one person's sofa is not a
  catalogue entry, and publishing it would be publishing their photograph.
- Retention is the existing window — 7 days for a guest, a year for an
  account — and "delete image" still works.

There is no background-removal provider configured. The brief asked for one
"if a suitable provider exists"; none does, so the editor offers a manual
cutout and says so rather than shipping a button that silently does nothing.
When a provider is added it belongs behind the same adapter pattern the vision
provider already uses, and `uploadDesignObjectAction` does not change.

## The trust boundary

A scene is authored in a browser and posted to us. `src/server/design/scene.ts`
is where that stops being true:

- every number is clamped, and NaN and Infinity are refused explicitly,
  because they survive JSON as nulls and strings;
- arrays are capped, because one request must not store a document that is
  then read on every view of that design;
- ids are deduplicated and lights bound to absent objects are detached;
- `assetUrl` must be a site-relative path. It is rendered into an `<img>` on
  every device that opens the design, so an `https://` one would make a saved
  design fetch from a third party, and `data:` or `javascript:` would be
  worse;
- `productId` is resolved against live catalogue rows. This is the only place
  that decision is made, and the reason an illustration cannot be sold by
  editing a request.

A scene that will not parse reads back as an empty scene rather than throwing:
losing the furniture must not cost the customer the cladding too.

## Performance

- The library is only loaded inside the designer, which is itself a separate
  chunk behind `next/dynamic`.
- Pointer events are coalesced into animation frames. A 120Hz trackpad fires
  faster than the screen refreshes; dispatching every event is the same work
  twice and drops frames for it.
- A drag moves `transform` only. Nothing animates `width`, `height`, `top` or
  `left`, so nothing reflows.
- The texture renderer runs on cladding changes. It does not run when a light
  or an object moves.
- Object URLs are revoked; someone trying three photos in a row does not hold
  three decoded bitmaps.
- Everything honours `prefers-reduced-motion` through the shared utilities in
  `globals.css`.

## Keyboard

Bound to the document, not to the canvas, because the selection persists while
a panel across the screen has focus and a shortcut that only works when the
canvas happens to be focused is one people learn not to trust. It stays out of
the way of typing.

| | |
| --- | --- |
| Arrow keys | nudge, fine |
| Shift + arrows | nudge, coarse |
| Delete / Backspace | remove the selection |
| Ctrl/Cmd + Z, Shift+Z, Y | undo, redo |
| Ctrl/Cmd + D | duplicate |
| Escape | clear the selection and the active tool |

Focusing an object selects it, so its toolbar is reachable without a pointer.

## Undo

Per gesture, not per change. A drag dispatches a stream of updates;
`beginGesture` snapshots once before it and `endGesture` commits. One drag, one
undo — which is what people mean by undo, and what a snapshot-every-action
reducer gets wrong in both directions.

A gesture that changed nothing leaves no step. Panning and zooming never enter
history: looking at a design is not changing it.

## Known limits

Stated so they are decisions rather than surprises.

- **The perspective in an export is approximated.** Canvas 2D has only affine
  transforms, so a fitted object is drawn as a 12×12 grid of affine cells. The
  error is well under a pixel for the perspectives a room photograph produces,
  but it is an approximation, and the live view (which uses a real `matrix3d`)
  is the more accurate of the two.
- **Shadows are not computed.** An object with hidden light behind it gets a
  heavier drop shadow, and that is all. Real shadows would need the room's
  geometry, which a photograph does not give us; anything else would be
  inventing information.
- **Objects do not occlude each other in depth.** Layer order is what decides
  what is in front, and the customer sets it. A plant cannot stand *behind* a
  sideboard and in front of the wall without being told to.
- **The scene is not a measurement.** Sizes come from the room width the
  customer typed. If that is wrong, everything scaled from it is wrong in
  proportion — which is why the field is on screen rather than hidden.
- **Lighting is illustrative.** See above, and the disclaimer on screen.
- **No collaborative editing.** One design, one editor, last write wins.
- **The migration has not been run against a live database.** None is
  connected in this environment. `prisma migrate diff` generated it and it was
  verified against the schema; it has not been applied.

## Tests

| | |
| --- | --- |
| `npm run test:unit` | 67 tests: the reducer, the trust boundary, the geometry, the perspective and the colour maths |
| `npm run test` | 177 Playwright tests at 375, 430, 768 and 1440 |

`tests/room-designer.spec.ts` covers the journeys the brief lists and runs
through whichever shell the viewport uses. Two of them check things no
structural assertion would catch: the lighting test compares pixels before and
after adding a strip, and the export test asserts the flattened image is
measurably darker once a black screen is in the room.
