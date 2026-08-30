# SKYLINE — Drone Cinematography & Flight Simulator

A pseudo-3D drone cinematography game built with vanilla JavaScript (ES
modules) and two stacked HTML5 canvases. No frameworks, no build step, no
external assets — the terrain, the sky, the landmarks and the aircraft are all
generated and rasterised at runtime.

You fly a camera drone over five procedurally generated regions and bring back
a showreel: six stills and three clips, graded on composition, light, vantage,
stability and depth.

---

## Running it

The repository's Node server already serves `public/`:

```bash
npm start           # or: node server.js
# → http://localhost:3000/drone/
```

Any static file server works too. It must be served over HTTP — the game uses
ES modules, so opening `index.html` from the filesystem will be blocked by the
browser's module CORS rules.

Requires a modern browser (Chrome, Edge, Firefox, Safari 16.4+). Nothing is
sent anywhere; settings and records live in `localStorage`.

---

## Playing

### Flight

| Key | Action |
| --- | --- |
| `W` / `S` | Throttle — climb and descend |
| `A` / `D` | Yaw — rotate the airframe |
| `↑` / `↓` | Pitch — fly forward and back |
| `←` / `→` | Roll — slide left and right |
| `Shift` | Sport mode — faster, thirstier |
| `Ctrl` | Cine mode — slow, glassy, +6% score |

The drone is self-levelling with a barometric altitude hold, the way a camera
drone flies — the throttle stick commands a **vertical speed**, not raw thrust,
and the stabiliser holds whatever tilt your stick asks for. Wind acts through
relative airspeed, so a gust both pushes you and forces the stabiliser to lean
into it. Air rising over a ridge will lift you; the lee side will drop you.

### Camera

| Key | Action |
| --- | --- |
| Mouse | Gimbal pitch and pan (click the viewport to capture the pointer) |
| `C` / `1` `2` `3` | FPV → Chase → Gimbal |
| `Q` / `E` / wheel | Lens: 14 · 18 · 24 · 35 · 50 · 85 · 120 mm |
| `L` | Re-level the gimbal |
| `Space` | Take the photograph |
| `R` | Start / stop recording a clip |

* **FPV** — raw, rolls with the airframe, wide. Visceral, hard to score in.
* **Chase** — spring-damped cinematic follow with the aircraft in shot.
* **Gimbal** — horizon-locked three-axis head that pans independently of the
  airframe. The mode you actually shoot stills in.

### Display

`G` composition guides · `H` hide the HUD · `Tab` minimap range ·
`F` performance counter · `P` / `Esc` pause · `Enter` end the run when landed
on the home pad.

### Gamepad

Left stick throttle/yaw, right stick pitch/roll, triggers gimbal pitch,
A/B/X photo/record/camera, L3/R3 sport/cine, Start pause.

---

## How a shot is scored

Every frame, the same judge that grades your photographs runs a cheap pass to
drive the live composition meter. Pressing the shutter runs the full pass,
which adds a terrain ray-march for real depth analysis.

Six weighted axes:

| Axis | Weight | What it measures |
| --- | --- | --- |
| Subject | 0.24 | Is there a landmark in frame, how much of the frame it fills, how valuable it is |
| Composition | 0.19 | Rule of thirds, horizon placement, roll level (or a committed dutch angle) |
| Light | 0.19 | Sun angle relative to the lens — side and back light beat flat front light — plus how close to golden hour it is |
| Vantage | 0.11 | Stand-off distance and elevation relative to the subject |
| Stability | 0.15 | Jerk and angular rate; speed costs you sharpness |
| Depth | 0.12 | Foreground / midground / background / sky separation, ray-marched |

The weighted average is gamma-curved (so the middle of the range has to work
for its points) and multiplied by situational bonuses — time of day, weather
difficulty, first capture of a landmark (×1.2, decaying hard on repeats),
hidden vista (×1.3), undisturbed wildlife (×1.2). The multiplier stack is
capped at ×1.5 and the result at 1200.

**Clips** are graded separately on smoothness (38%), duration (20%), subject
variety (20%), light (14%) and motion (8%), with a bonus for the value of what
you framed while rolling. Takes under three seconds are discarded.

The **showreel** is your best six stills plus your best three clips, plus
objectives, ring gates, hidden vistas and a recovery bonus for landing with
battery in reserve. Losing the airframe costs you 450 points and the bonus.

---

## Architecture

```
public/drone/
├── index.html          screens + the two canvases
├── styles.css          UI chrome
└── src/
    ├── main.js         state machine, loop, mission lifecycle, objectives
    ├── ui.js           hangar / briefing / pause / results / modals (DOM)
    ├── hud.js          instrumentation on the overlay canvas
    ├── renderer.js     the software 3D renderer
    ├── props.js        landmarks, vegetation styles, gates, the aircraft
    ├── camera.js       the three camera modes and the projection basis
    ├── drone.js        flight model, wind, battery
    ├── world.js        landmark placement, wildlife, gates, vistas, clouds
    ├── terrain.js      heightfield and surface shading
    ├── biomes.js       map / weather / time-of-day data
    ├── atmosphere.js   sun, sky, fog, auto-exposure
    ├── scoring.js      the cinematography judge and the showreel
    ├── input.js        keyboard + mouse + gamepad → one control state
    ├── noise.js        seeded value / ridged / billow noise
    ├── math.js         vectors, damping, colour helpers
    └── storage.js      settings and records (localStorage, fails soft)
```

Two canvases are stacked: `#scene` holds the rendered world and `#hud` holds
the instrumentation. That split is not cosmetic — it means a photograph can be
grabbed straight off the scene canvas with no HUD baked into it, which is how
the thumbnails on the results screen are produced.

### The renderer

There is no WebGL. Each frame:

1. **Sky** — a rotated linear gradient keyed to the horizon line, then stars,
   aurora, the sun disc with its bloom, and a parallaxing cloud layer of soft
   radial-gradient puffs positioned in world space.
2. **Terrain** — nested LOD rings (a clipmap) around the camera. Each level
   samples a snapped lattice once into a `Float32Array`, then emits quads,
   shaded from the cell's own corner normals with a curvature-derived ambient
   occlusion term and distance + altitude fog. Cells below the water line also
   emit a water quad with depth tinting, sky reflection, sun glitter, wave
   banding and shore foam.
3. **Props** — vegetation is placed on a deterministic lattice against a baked
   density grid and drawn as depth-sorted sprites; landmarks, gates, wildlife
   and the aircraft are emitted as polygons through the same interface.
4. **One depth sort, one flush.** Everything lands in a single pooled draw
   list, so props interleave correctly with the ground.
5. **Post** — sun bloom, lens-flare ghosts, colour grade, speed streaks, film
   grain, vignette.

Notes on the parts that are easy to get wrong:

* **Seams.** Adjacent canvas fills leave an antialiased hairline of background
  between them, which reads as a wireframe over the whole landscape. Every
  quad is inflated half a pixel about its centroid so neighbours overlap.
* **Colour strings.** Building `rgb(...)` strings dominates a 2D-canvas
  renderer's cost, so channels are quantised to 6 bits and memoised.
* **Shimmer.** Per-cell hashed tonal variation checkerboards and crawls as the
  LOD rings move with the camera, so the mottling is a smooth function of world
  position instead. Normals come from the cell's own corners rather than the
  LOD-dependent sample spacing.
* **Near plane.** Terrain quads that straddle the camera are clipped in view
  space (Sutherland–Hodgman against one plane) before projection.
* **Auto-exposure.** The atmosphere meters itself and hands the renderer a gain
  factor, so midday, golden hour and blue hour all land in a usable range and
  only the colour tells you the hour. Without it, sunset renders as mud and
  blue hour renders as black.

### Performance

Roughly 900–1300 draw items per frame at High. Quality presets change the LOD
ring size and count, vegetation budget and device-pixel-ratio cap; the game
also drops one quality step automatically if the first six seconds of a flight
average under 32 fps. Press `F` for the live counter.

### Determinism

World generation is seeded per map, so a given map always produces the same
terrain, landmark placement, gate course and hidden vistas — which is what
makes the records table meaningful.

---

## Debugging

`window.__skyline` exposes the live game instance in the console:

```js
__skyline.drone.pos            // aircraft position
__skyline.renderer.stats       // { quads, props, items }
__skyline.applySetting('quality', 'high')
__skyline.world.pois           // every landmark, wildlife group and vista
```
