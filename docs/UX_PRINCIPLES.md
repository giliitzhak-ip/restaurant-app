# UX principles

Nine rules, each of which killed something that was already built.

## 1. Ask only what you cannot infer

The customer is asked two things: **what happened** and **when**. That is the
whole request.

Removed for this: the category grid ("או בחרו תחום"), the radius control, the
rating filter, the price filter, and two of the three booking-mode buttons.

The category grid is the instructive one. It looked helpful and was actively
harmful: it invited the customer to classify their own problem, which is the
job the system exists to do, and a *wrong* self-classification is worse than
no classification — it silently narrows the candidate set to the wrong trade.
The description already contains the answer, and the server already extracts
it.

Radius and rating are worse than useless. A customer who has not met anyone
yet has no basis for either number, and both are answered better by the
system: the radius is whoever is actually reachable in time, and trust is
what ranking is for.

## 2. Timing is a property of the request, not a fork in the flow

`NOW` / `היום` / `בתאריך` is one segmented control, and the date picker
appears only once a specific time is actually wanted.

This replaced three separate CTAs. "צריך עכשיו", "קבע למועד אחר" and "עבודה
גדולה" made the customer choose a *flow* before they had described their
problem, and the flows then differed in ways they could not have predicted.

Critically, the choice is not cosmetic. It becomes `jobs.timing_intent` and
`jobs.requested_for`, and it changes **who is eligible** — a `NOW` job is
answered by the realtime switch, a scheduled one by the weekly plan. See
[AVAILABILITY.md](AVAILABILITY.md).

## 3. Show answers, not empty fields

The `/request` screen displays what was chosen as sentences with a `שינוי`
link, not as a form to fill in again. The description arrives from the home
screen, and re-rendering it as an empty textarea would imply the first answer
was not recorded.

Both parameters survive the sign-in redirect, so a request started while
signed out is the request you come back to.

## 4. One dominant control per screen

The provider home is a single `מקבל עבודות` switch, the current answer
underneath it, and one `שינוי שעות` link. Nothing else competes.

Everything the old screen showed — a status badge, a state sentence, a
start/end shift button, the provider's name, a rating — is either folded into
the switch's own label and detail line, or moved behind the link. The card
frame around the switch went too: a border around a bordered control is two
frames saying one thing.

## 5. Progressive disclosure, without losing the place

A match card shows name, rating-with-count, ETA and price, plus `פרטים`. That
opens the full profile as a **bottom sheet**, not a page.

A page would have been easier to build and wrong. The customer is mid-decision;
navigating away loses the price, the ETA and the sense of a live moment, and
coming back to a rebuilt screen feels like starting over. The sheet keeps the
match mounted behind it, and closing returns to exactly it — which is asserted
by driving the browser, not assumed.

## 6. Order by trust, not by data

Inside the profile: verification first, because it is the only claim the
platform itself stands behind. Then the rating, **always with its review
count**, because 5.0 from one review is not better than 4.8 from three
hundred. Then work actually completed. Then years of experience. Then
availability, as a sentence.

Never shown: the provider's weekly calendar, their coordinates, their
cancellation counts, their payout details, or any internal match score.

## 7. Availability is a sentence, not a calendar

`זמין עד 18:00`. `בעבודה כרגע · פנוי מחר מ-08:00`. `לא פרסם שעות קבועות`.

The customer is answering one question — can this person come when I need
them — and a grid of windows is a worse answer to it. It also happens to be
the only answer that does not expose someone's personal schedule.

The last of those three is a principle in itself: **"we do not know" and
"there is none" are different sentences.** Phrasing them the same way
produced a profile that told a customer a provider had no availability for a
fortnight, while that provider was on their way to them.

## 8. A button must do what it says

`עבודה גדולה` opened a quote-comparison flow that did not exist: the job sat
in `REQUESTED` with nothing dispatching it and no screen to compare anything
on. It is removed from the UI **and refused by the API**, rather than left
reachable.

An absent feature is a gap. A button that promises a feature that is not
there is a lie, and the customer pays for it with a request that never goes
anywhere.

## 9. Built for one hand, at night, under stress

A burst pipe at 23:00 is the design case, not a considered purchase.

* Every interactive element is at least 44px tall, asserted by
  `scripts/ui-audit.mjs` (which fails under 40px).
* The provider's next action is always one large button — `יוצא לדרך`,
  `הגעתי`, `סיימתי את העבודה` — never a menu.
* Dark by default, because the phone is dark and a white flash at night is
  hostile.
* Nothing critical depends on an animation having run.

## The rule behind the rules

**Simplification is deletion, not rearrangement.** Every item above removed a
control, a screen, a question or a promise. Moving a filter into an
"advanced" drawer is not simplification; it is the same complexity with worse
discoverability.

And **truth outranks polish**. Where the two conflicted — a star distribution
with no reviews behind it, a route claim without route evidence, a stale GPS
fix, an availability line that read well and was false — the polish lost
every time.
