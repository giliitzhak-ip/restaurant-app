# The design system

What every screen is built from, and the rules those parts already follow so
that no screen has to remember them.

## Where things live

| | |
| --- | --- |
| Tokens and motion | `src/app/globals.css` |
| Components | `src/components/ui/`, indexed by `src/components/ui/index.ts` |
| The contract, tested | `tests/design-system.spec.ts` |

Never hard-code a colour, a duration or a radius in a component. Add a token.

## Motion

One easing curve and four durations. Everything interactive picks from this
list; nothing invents its own timing.

| Token | | Used for |
| --- | --- | --- |
| `--dur-press` | 140ms | the lift and press on a control |
| `--dur-quick` | 170ms | colour, border and shadow |
| `--dur-gentle` | 200ms | small things appearing: errors, inline success |
| `--dur-enter` | 260ms | cards, lists, sheets and dialogs arriving |
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | all of them |

Five rules are encoded in the utilities, so no component has to hold them:

1. **Only `transform`, `opacity`, `background-color`, `border-color`,
   `box-shadow` and `color` animate.** Never `width`, `height`, `top` or
   `left` — those reflow the page on every frame. The one place a block of
   fields appears and disappears (the checkout address) fades; it does not
   collapse.
2. **Hover lives behind `@media (hover: hover)`,** so a tap on a phone cannot
   leave a control stuck in its hover state. Tailwind's `hover:` variant does
   this by itself; a hand-written `:hover` rule must do it explicitly.
   `tests/design-system.spec.ts` walks the shipped CSSOM and fails on any
   `:hover` rule outside one.
3. **A disabled control is excluded from hover and press,** and shows a
   blocked cursor. A *busy* control is not the same thing: it stays at full
   strength and shows `cursor: wait`.
4. **`prefers-reduced-motion` drops the movement and keeps the colour
   change,** which then lands instantly rather than disappearing.
5. **Nothing bounces, spins or flashes.** The one rotation in the interface is
   the busy spinner, which is a progress indicator, and it carries its state
   as text as well — a spin is not readable to everyone watching for it.

### Utilities

| | |
| --- | --- |
| `interactive` | the shared transition set, nothing else |
| `press` | the 1px hover lift and the 0.98 press |
| `tap-target` | grows the hit area to 44×44 without changing the size drawn |
| `card` / `card-interactive` | the panel, and the panel that is itself a link |
| `enter-item` | one item arriving; set `--enter-index` to stagger a list |
| `enter-soft` | opacity only, for a message or a chip |
| `focus-ring-invert` | the focus ring on the dark studio surfaces |

A staggered list steps 40ms per item and caps at 240ms, so the bottom of a
long page is never left waiting. Items are laid out and clickable from the
first frame — only opacity and transform animate, and neither blocks a
pointer.

## Button

Seven variants — `primary`, `secondary`, `outline`, `ghost`, `danger`,
`success`, `link` — plus three brand extensions: `brass`, and `studio` /
`studioOutline`, which are the only thing readable on the room designer's dark
panels.

Four sizes: `sm` (36px), `md` (44px — the field height, so a button beside an
input lines up), `lg` (52px), `icon` (44px), and `iconSm` (32px) for dense
toolbars. The two under 44 carry `tap-target`.

Eight states, all reachable from props rather than from classes at the call
site: normal, hover, active, focus-visible, disabled, loading, success, error.

```tsx
<Button loading={pending} loadingLabel="שומר">שמירה</Button>
<Button success={saved}>שמירה</Button>
<IconButton label="מחיקה" size="iconSm"><Trash2 /></IconButton>
```

`loading` keeps the label in the layout and hides it, then centres the spinner
over it — so the button is exactly as wide while it works as it was before.
Nothing in the row moves. It is genuinely disabled while busy, so a double tap
cannot submit twice. Never swap the label for "שולח…" instead: that word is a
different width, and a submit button that changes size the moment it is
pressed is the last thing anyone should see at checkout.

`success` swaps the face for a ✓ for a moment, in the same width. Hold it with
`useTransientFlag()`, which clears itself.

`asChild` renders a link. Links have nothing to be busy about, so the overlay
states are not available there.

## Accessibility rules the components enforce

- `IconButton` makes `label` part of its type. An icon button without a name
  is unreachable for anyone not looking at it.
- `Field` wires the control to its own message: it clones the child and sets
  `aria-invalid` and `aria-describedby`, so an error is announced and not only
  shown. Do not repeat those at the call site.
- Nothing is distinguishable by colour alone. Every status carries an icon and
  a word — toasts, form messages, the order timeline, availability badges.
- A toggle says it is a toggle: `aria-pressed`, not a different fill.
- Focus is always visible. A field's ring is the same ring as a button's;
  `focus:outline-none` does not belong anywhere in this codebase.
- 44×44 is the minimum hit area. For a checkbox the target is its label, so
  make the row 44 tall rather than growing the 18px box — a grown box pushes
  its hit area into the rows above and below and steals their taps.

## Honesty

The interface shows what the system knows and nothing else.

The order timeline resolves from the order's status column: no estimated
dates, no "arriving soon", and no step marked in progress because time has
passed. If the gateway has not called back, it says the payment is the current
step and leaves it there. The checkout progress reads straight off the form's
own values, so it cannot drift from what is on screen. A success tick appears
only after the action it confirms has actually returned.

## Adding to it

1. Check `src/components/ui/index.ts` first — the thing probably exists.
2. Compose `interactive`, `press`, `card` and the entry utilities. If you are
   writing `transition-` with a duration in a component, something is wrong.
3. If a new colour or timing is genuinely needed, it goes in `@theme` in
   `globals.css`, with a comment saying why.
4. Run `tests/design-system.spec.ts`. It runs at 375, 430, 768 and 1440,
   because most of what it checks only goes wrong at one of them.
