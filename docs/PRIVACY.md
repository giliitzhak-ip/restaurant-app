# Privacy by design

Customers upload photographs of their homes. That is the most sensitive data
this application touches, so the defaults are conservative and the mechanics
are written down.

## What actually happens to a room photo

1. **Decoding and downscaling happen in the browser.** The photo is drawn to a
   canvas, reduced to a working resolution (`designerConfig.maxRenderEdge`,
   1600 px by default) and never leaves the device at this stage.
2. **Only a thumbnail is sent for analysis.** The segmentation request carries a
   ~128 px RGBA preview (a few kilobytes) plus the image dimensions. The default
   provider does all of its work on that thumbnail. Nothing is written to disk.
3. **The visualisation itself runs locally.** Texture warping, relighting and
   compositing happen in the browser engine, not on a server.
4. **The full photo is stored only on an explicit save.** Saving a design, or
   attaching a design to a quote, uploads the working image through the storage
   driver. Until then nothing is persisted.
5. **A hosted model, if configured, is disclosed.** When
   `ROOM_VISION_PROVIDER=remote`, the full image is sent to that endpoint for
   segmentation. The privacy page says so and must be updated with the vendor
   name before that switch is flipped in production.

## Retention

Configured in [`src/config/brand.ts`](../src/config/brand.ts):

| Who | Default retention |
| --- | ----------------- |
| Guest (no account) | `guestImageRetentionDays` — 7 days |
| Signed-in customer | `accountImageRetentionDays` — 365 days |

Each saved design stores `expiresAt`. The retention job deletes anything past
it:

```bash
curl -X POST -H "authorization: Bearer $MAINTENANCE_TOKEN" \
  https://example.com/api/maintenance/retention
```

Run it daily (Vercel Cron, GitHub Actions, systemd timer — anything). Without
`MAINTENANCE_TOKEN` the endpoint refuses to run, so it cannot fire by accident.

## Customer controls

In **My designs** (`/account/designs`) a customer can:

- **delete the photo** and keep the design (products, quantities and price
  survive; the image is gone);
- **delete the whole design**;
- rename or duplicate a design;
- see how long a design is kept, in plain Hebrew, on the privacy page.

Deleting an account deletes its designs by cascade
(`RoomDesign.userId → onDelete: Cascade`).

## What we do not do

- **No model training on customer photos.** Not by us, and not by a provider
  we would add without saying so first.
- **No third-party analytics on the photo pipeline.** The analytics layer
  records that an upload happened, its source and its dimensions — never the
  image or a URL to it.
- **No card data.** Payments go through a hosted provider page or a
  salesperson; nothing card-related is stored or proxied.
- **No tracking cookies.** The three cookies in use are functional: session,
  cart id and a guest token so a visitor keeps their own designs.

## Consent copy

The upload screen states, before the file picker opens, that the photo is used
to build the visualisation, that only a thumbnail is analysed, that the full
image is stored only if the design is saved, and that photos are not used to
train models. It links to `/privacy`, which repeats the retention numbers from
configuration so the two can never drift apart.
