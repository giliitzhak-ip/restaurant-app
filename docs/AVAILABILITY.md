# Availability

Availability is the hardest thing in this product to get right, because a
provider answers two different questions with it and the two disagree
constantly:

| Question | Where it lives | Horizon |
|---|---|---|
| *Am I accepting work right now?* | `provider_profiles.state` (+ `online_until`) | minutes |
| *When do I normally work?* | `provider_availability_rules` | weeks |
| *Is a specific day different?* | `provider_availability_overrides` | one date |

Conflating them is how availability becomes unpredictable. A provider who
works Sunday–Thursday 08:00–17:00 and switches on at 20:00 on a Thursday is
making a deliberate statement, not contradicting themselves. A provider on
holiday who forgot to switch off is not available, however green their
toggle looks. The rules below exist so that each layer answers only for
itself.

## The precedence, in order

`public.provider_is_available_at(provider_id, at, duration_min, exclude_job)`
is the single answer. Everything — dispatch, the provider's own screen, the
customer-facing profile, the matching lab — goes through it. There is no
second implementation and no cached copy.

1. **Not verified, or suspended** → never available. No later rule can
   override this.
2. **A date override for that local date** → decisive. `unavailable` means
   no; a `window` means yes inside it and no outside it. An override is a
   decision about a specific day, so it outranks both the switch and the
   plan.
3. **The realtime switch**, for a request at or near *now* (within
   `availability.rules.nowToleranceMinutes`, default 20) → decisive. `ONLINE`
   is required; `BUSY` and `OFFLINE` are both "no". If `online_until` is set
   and has passed, the shift is over.
4. **The weekly plan**, for a request further out → decisive. The slot must
   be *covered*, start and end, by a declared window on that weekday. Being
   offline right now says nothing about tomorrow morning.
5. **Existing commitments** → never double-book. An accepted job blocks its
   own duration plus `travelBufferMinutes` (default 15) either side.
6. Otherwise → matchable.

### Why 3 outranks 4

This was a bug before it was a rule. Both a date override and an uncovered
hour used to come back from `provider_planned_covers()` as plain `false`, so
the *now* branch treated "I don't usually work at this hour" the same as
"I'm off today" — and a provider who tapped "accepting jobs" in the evening
was shown as available and matched as unavailable. Migration `0022` split
the override verdict out (`provider_override_verdict()`) so each layer
answers for itself. Without it the "available for two hours" and "available
until 18:00" actions would silently do nothing outside planned hours, which
is the worst possible failure: the provider is told the opposite of what
matching will do.

### No declared hours

A provider who has never set weekly hours is **matchable now**, through the
switch, and **never for a future slot**. The switch is a live statement; an
empty schedule is an absence of data, and there is nothing to base a future
claim on.

`availability.rules` used to carry `noRulesMeansAlwaysPlanned: true`, whose
own description promised this behaviour for future slots too. Nothing read
the key, and a comment in migration `0022` cited it as though it were
load-bearing — a dead flag masquerading as an explanation. Migration `0023`
removes it. Implementing it would have meant dispatching an 03:00 Tuesday
job to someone who never said they work then and cannot be asked, so the
customer would collect declines and we would have manufactured availability
out of nothing.

## Temporary availability

`provider_profiles.online_until` gives the switch an optional end, which is
what a provider almost always means: "for the next two hours", "until six" —
never "until I remember to turn this off". Two properties matter:

* **The expiry is enforced inside `provider_is_available_at`,** not only by a
  sweeper. Matching must never depend on a background job having run.
* **`expire_online_windows()` exists anyway,** called from the maintenance
  tick, so the provider's own screen, the admin tower and the status log
  agree with what matching already does. It also clears the stored location,
  because an ended shift must not leave a last known fix looking live.

`online_until` is cleared on every state change, so a stale expiry cannot
survive a plain "accepting jobs" tap and switch someone off unexpectedly.

## Timing intent, from the customer's side

The customer picks `NOW`, `ASAP` (today) or `SCHEDULED` (a chosen time). This
is not a label on a screen: it becomes `jobs.timing_intent` and
`jobs.requested_for`, and the dispatcher evaluates availability *at that
time*. Changing it changes **who is eligible**, which is the property
`tests/integration/availability.test.ts` opens with — for a `NOW` job the
online provider is offered and the offline one is not; for tomorrow at 10:00
it inverts.

Duration is honoured too: `services.duration_min`, falling back to
`categories.default_duration_min`, then 60. A 90-minute job at 16:00 does not
fit a window that closes at 17:00, and is refused rather than squeezed in.

## What a customer is told, and what they are not

A customer never reads the schedule tables. RLS restricts them to the
provider's own rows, and the only path to an answer is
`availabilitySummary()` (`src/domains/availability/summary.ts`), which runs
as the system and returns one aggregate: available now, when the current
window ends, and the next opening. No rule rows, no dates, no calendar.

`availabilityPhrase()` turns that into the one sentence shown:

| Situation | Sentence |
|---|---|
| Available, with an end | `זמין עד 18:00` |
| Available, open-ended | `זמין כרגע` |
| On a job | `בעבודה כרגע · פנוי מחר מ-08:00` |
| Free later today / tomorrow / a named day | `זמין מ-14:30` / `זמין מחר מ-08:00` / `זמין ביום ראשון מ-08:00` |
| No hours declared, switched off | `לא פרסם שעות קבועות` |
| Hours declared, nothing free in the lookahead | `אין זמינות בשבועיים הקרובים` |

The last two rows are the point. They are different statements — "we do not
know" and "we know, and there is none" — and phrasing them the same way was
a real bug: the profile of a provider who had just accepted the customer's
own job read `אין זמינות בשבועיים הקרובים`. Every step of the computation was
correct and the sentence was false.
`tests/unit/availability-phrase.test.ts` pins all six rows, including the day
boundary, which is local rather than UTC.

## Time zone

Wall-clock reasoning happens in the database, in the zone named by the
`availability.timezone` setting (default `Asia/Jerusalem`), never in the
browser's zone. "Until 18:00" means local 18:00 whatever the provider's
device is set to, and "tomorrow" turns over at local midnight.

## Settings

`settings` key `availability.rules`:

| Key | Default | Meaning |
|---|---|---|
| `nowToleranceMinutes` | 20 | How close to now counts as "now", so the realtime switch decides. |
| `travelBufferMinutes` | 15 | Padding either side of an accepted job when checking conflicts. |
| `defaultDurationMinutes` | 60 | Used when neither the service nor the category states one. |
| `maxLookaheadDays` | 14 | How far `provider_next_available_at()` scans. |

## Known limits

* `provider_next_available_at()` scans in 30-minute steps, while the hours
  editor offers quarter-hours. A shift starting at 08:15 can be reported as
  free from 08:30 — late, never early, which is the safe direction.
* A job that would run past local midnight is evaluated against its start
  day only. Splitting it would imply a precision the data does not support.
* `provider_has_conflict()` treats a job with no `requested_for` as occupying
  the present. A provider who accepted an open-ended job two days ago and
  never completed it will read as conflicted; the maintenance tick, not this
  function, is where that should be reaped.
