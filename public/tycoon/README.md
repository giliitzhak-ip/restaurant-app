# Meridian Field Ops

A field services and logistics management tycoon, built as a standalone web
application with HTML5, Tailwind CSS and vanilla JavaScript. No framework, no
build step to play, no network calls at runtime.

You inherit two vans, three technicians and a phone that will not stop ringing.
Route crews against distance, skill and equipment; keep vehicles fuelled and
serviced; sign the contracts you can actually deliver; and grow from one
residential territory to a regional operator working substations and
transmission lines — without letting reputation, the fleet or the balance sheet
fall over.

## Running it

Open `index.html` in a browser. That is the whole install — it runs from
`file://` as happily as from a server.

To serve it from this repository's Node server instead:

```sh
npm start          # from the repo root
# then browse to http://localhost:3000/tycoon/index.html
```

## Controls

| Input | Action |
| --- | --- |
| `Space` | Pause / resume |
| `1` `2` `3` | Normal / fast / turbo speed |
| `Ctrl`+`S` | Save |
| `Esc` | Close a dialog |
| Drag / wheel / double-click | Pan / zoom / fit the map |

Click a call or a unit on the map to select it; the console jumps to the
matching panel.

## The loop

**Time.** One tick is two in-game minutes; at normal speed a day takes about 70
seconds. Crews work a 06:00–20:00 roster — dispatch them outside it and you pay
overtime.

**Calls.** Service requests appear across licensed territories with a priority
(routine, urgent, emergency), a value, a duration, a skill floor, a required
capability and an SLA clock. Emergencies pay more than double and drop the game
out of turbo when they land.

**Dispatch.** Selecting a call ranks every unit by ETA, crew skill margin,
fatigue, condition and fuel, and states plainly why an ineligible unit cannot
go. Auto-dispatch will work the board for you when you would rather watch the
money. Calls you never accept go to a competitor — you lose the revenue, not
your name. Contracted calls you drop are SLA breaches, and those cost both.

**Resources.** Fuel burns with distance and its price drifts on a random walk;
vehicles wear and need workshop time; crews fatigue on shift and recover off it;
morale slides when people are benched or overworked. Customer satisfaction moves
with punctuality and workmanship, and it directly scales the value of every
incoming call.

**Money.** Job payouts and contract retainers on one side; payroll, fuel,
maintenance, insurance, overhead, interest and penalties on the other. Operating
profit accrues tax quarterly, and a credit line covers you — expensively — when
the quarter-end bill lands short.

**Progression.** Nine milestones unlock sectors, territories, heavy vehicles and
specialist equipment. Sectors are gated so their required tooling is always
purchasable before their work appears on the board.

## Code layout

Plain classic scripts loaded in dependency order, each an IIFE hanging one
module off the `FST` namespace. Simulation modules have no DOM knowledge and are
testable under Node; presentation modules never mutate game rules.

| File | Responsibility |
| --- | --- |
| `js/config.js` | All balance data: catalogues, sectors, milestones, events |
| `js/utils.js` | Seeded RNG, maths, formatting, pub/sub, throttle |
| `js/state.js` | Entity factories, derived queries, LocalStorage persistence |
| `js/economy.js` | Ledger, daily settlement, quarterly tax, credit, purchases |
| `js/jobs.js` | Call generation, dispatch scoring, resolution, contracts |
| `js/units.js` | Movement, fuel, wear, on-site progress, fatigue, shifts |
| `js/engine.js` | Clock, tick loop, day/quarter rollover, milestones, events |
| `js/charts.js` | Dependency-free canvas line / bar / donut / sparkline charts |
| `js/map.js` | Operations map: render, pan, zoom, hit-test, selection |
| `js/notifications.js` | Toasts and the rolling activity log |
| `js/ui.js` | Dashboard, management panels, modals, action handling |
| `js/main.js` | Bootstrap and wiring between engine, UI and map |

Balance and simulation logic can be exercised headlessly, which is how the
economy was tuned:

```js
global.window = {}; global.localStorage = { getItem: () => null, setItem: () => {} };
['config','utils','state','economy','jobs','units','engine']
  .forEach(f => require('./js/' + f + '.js'));
const { State, Engine } = window.FST;
const s = State.create('Sim');
Engine.init(s);
for (let i = 0; i < 30 * 720; i++) Engine._step(2);   // 30 in-game days
```

## Styling

Tailwind is **compiled ahead of time** to `css/tailwind.css` and committed, so
the game has no CDN dependency and works offline. `css/styles.css` holds the
component styles Tailwind utilities cannot express (panels, meters, toasts,
modal animation, reduced-motion handling).

To regenerate the stylesheet after changing markup or class strings:

```sh
npm i -D tailwindcss@3.4.17
./public/tycoon/build/build-css.sh
```

Inter and JetBrains Mono are requested from Google Fonts as a progressive
enhancement; if that request is blocked the system font stacks take over and
nothing else changes.

## Saving

The game autosaves at the close of each in-game day to LocalStorage (key
`meridian.fieldops.save.v1`) and on tab close. Saves can be exported to and
imported from a JSON file via the menu (☰). Loading a save always resumes
paused, and saves written by older versions are merged over a fresh state so
new fields fill in rather than breaking the load.
