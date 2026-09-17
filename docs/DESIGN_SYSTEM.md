# Design system

One dark identity, four surfaces, three inks, one accent. Everything below is
defined once in `src/app/globals.css` as `@theme` tokens and consumed through
Tailwind utilities; the primitives live in `src/components/ui/index.tsx`.

## Why tokens and not a palette

The first version used a bespoke palette (`navy-*`, `accent-*`, `success-*`,
`warning-*`, `danger-*`). It was replaced wholesale rather than added to, for
two reasons:

1. Tailwind only emits classes for colours the theme defines, so a leftover
   `text-danger-400` renders **unstyled** — a silent, invisible failure.
   Deleting the old names turned every stale reference into a greppable
   break, which is how all ~350 of them were found and migrated.
2. Contrast can be checked once, on the tokens, and the check then covers
   every screen. `npm run ui:contrast` does that.

## Colour

| Token | Value | Role |
|---|---|---|
| `bg` | `#080b12` | The page. Nothing else. |
| `surface-1` | `#0d121c` | A card: a genuinely separate object. |
| `surface-2` | `#121925` | Recessed areas inside a card; input fields. |
| `surface-3` | `#182130` | Secondary button faces, chips. |
| `line` | `#1c2536` | Ordinary dividers and card borders. |
| `line-strong` | `#2a3648` | Borders that must be seen: inputs, controls. |
| `ink` | `#f8fafc` | Primary text. |
| `ink-2` | `#a8b3c4` | Secondary text. |
| `ink-3` | `#6f7c90` | Muted: hints, units, labels. |
| `brand` / `brand-bright` | `#3b82f6` / `#60a5fa` | The primary action, and one accent. |
| `live` | `#22d3ee` | **Only** moving, realtime data. Not a second accent. |
| `ok` / `warn` / `bad` (+ `-bright`) | green / amber / red | State that matters. Never decoration. |

Four surface levels is a deliberate ceiling. A fifth invites putting
everything in a card, which flattens hierarchy into noise. Borders carry a
slight blue cast so they read as part of the surface rather than grey lines
laid on top.

`live` earns its own token because "a provider is moving right now" is a
different kind of fact from "this is the primary action". Using the brand
blue for both would make the interface look uniformly busy and would make the
one genuinely live thing on screen indistinguishable.

## Contrast

18 pairs checked against WCAG 2.1 by `scripts/check-contrast.mjs`, which
exits non-zero on any failure, so it can gate a release. Current state, all
passing:

* `ink` on every surface: 15.45:1 – 18.81:1
* `ink-2` on every surface: 8.32:1 – 9.29:1
* `ink-3` (large text and non-essential labels only): 4.16:1 – 4.65:1
* every semantic `-bright` on `surface-2`: 6.37:1 – 10.56:1
* the primary button's dark label on `brand`: 5.20:1
* the focus ring against the page: 5.35:1

`ink-3` is the one token that does not reach 4.5:1 on every surface. It is
therefore restricted to text that is large or genuinely supplementary — a
unit next to a number, a hint under a field — and never carries information
that appears nowhere else.

## Type

System-adjacent Hebrew sans (`Heebo`, falling back to the platform UI font).
Sizes are set in pixels at the point of use rather than through a named scale,
because Hebrew at 14px and Latin at 14px do not read the same and the
adjustments are per-context. The working range is 11–32px; anything larger
would be a marketing page, which this is not.

Numbers, prices, distances, times and identifiers are wrapped in `.ltr-nums`
or `.tech-id`, which set `direction: ltr` **and** `unicode-bidi: isolate`.
Isolation rather than override: overriding lets the bidi algorithm reorder
surrounding runs, which is how `08:00 – 17:00` ends up reversed inside a
Hebrew sentence.

## Primitives

`Button` (primary / secondary / quiet / danger / success, in three sizes, all
at least 44px tall), `Card`, `Inset`, `SectionLabel`, `Badge`, `Switch`,
`Segmented`, `Field`, `Avatar`, `Rating`, `Money`, `Minutes`, `Distance`,
`Spinner`, `LoadingState`, `ErrorState`, `EmptyState`, `ConnectionBanner`,
`ConnectionLine`, `Sheet`.

Notes on the ones with opinions in them:

* **`Switch`** is the provider's one dominant control. A switch rather than a
  pair of buttons, because the current answer has to be readable from across
  a van and changeable with a thumb. The label is inside the control, so the
  whole row is the hit target. In RTL the knob travels to the start edge —
  the right — when on.
* **`Rating`** refuses to render `0.0`. A provider with no reviews shows
  `חדש ב-GET SERVICE`, because a zero is a claim and an absence is not. It
  always renders the review count beside the average.
* **`Avatar`** is initials on a tint derived from the name. Never a
  fabricated photograph, and nothing is stored.
* **`Sheet`** is a bottom sheet, used where losing the screen behind it would
  cost the user their context. Its backdrop is `aria-hidden` and untabbable:
  exposing it produced two identically named "סגירה" controls for one action.
* **`ConnectionLine`** is the visual signature — `● ───────→ ●` — and is
  spent only at the matching and tracking moments. A route line on every card
  is wallpaper.

## Motion

Four animations, each explaining one thing, all in `globals.css`:

| Class | Says |
|---|---|
| `gs-pulse` | this is live, right now |
| `gs-sweep` | we are searching the network |
| `gs-travel` | a connection is being made (MOVE → CONNECT → ARRIVE) |
| `gs-rise` | new information has arrived |

`gs-rise` starts from a **visible** resting state, so a server-rendered frame
is never parked at `opacity: 0` — a page whose content depends on an
animation having run is a page that is blank when it does not.

`prefers-reduced-motion: reduce` collapses every duration to 0.01ms.

## RTL

The document is `dir="rtl" lang="he"`, not faked with `text-align`. Layout
uses logical properties (`start`/`end`, `ms-*`/`me-*`) throughout, so nothing
needs mirroring by hand. `scripts/ui-audit.mjs` asserts the direction, checks
for horizontal overflow at 390px, and fails on any interactive element under
40px tall.

## Native controls

Two places where a native control was the wrong answer:

* **Times** are chosen from a list of quarter-hours, not
  `<input type="time">`. The native control renders in the *browser's*
  locale, so on an en-US device it needs `08:00 AM` and clipped to `08:00 A`
  at the width a day row can spare. A list is narrower and guarantees the
  24-hour clock Israel uses. A saved value off the quarter-hour grid stays
  selectable, so opening the screen never rounds someone's hours.
* **Dates** remain native. A real calendar picker beats anything hand-built,
  and its locale-dependent placeholder (`dd/mm/yyyy` vs `mm/dd/yyyy`) is
  cosmetic rather than misleading.
