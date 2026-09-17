# GET SERVICE — Product

> **צריך? אנחנו מוצאים.**

A real-time marketplace for professional services. The customer does not
search a directory; they describe what happened, and the system finds the
most suitable available professional.

---

## What makes it different

Most marketplaces answer **"who is closest?"** GET SERVICE answers:

> **Who is the best professional opportunity right now?**

and the strongest signal in that answer is:

> **Who is already going there?**

A plumber 3 km away already driving toward the customer is a better match
than one 1 km away driving in the opposite direction — the first can stop in
with almost no detour, the second must turn around. This is
**Route Opportunity**, and it carries the single largest weight in matching.

---

## The core experience

```
Customer:      יש לי נזילה.
GET SERVICE:   מצאנו לך אינסטלטור.
               🚗 הוא כבר נמצא באזור שלך.
               ⏱️ הגעה משוערת: 7 דקות.
               💰 ₪290.
               המקצוען בדרך אליך.

Provider:      🔧 אינסטלציה · 📍 1.6 ק"מ · ⏱️ 7 דקות · 💰 ₪290
               🚗 עבודה בדרך שלך
               [ קבל עבודה ]  [ דחה ]
```

The customer never picks a technical service category. They write "יש לי
נזילה מתחת לכיור" and the system decides it is `plumbing` / `sink_leak` /
`high` urgency — showing that back so it can be corrected before committing.

---

## The loop this MVP completes

```
REQUEST → UNDERSTAND → LOCATE → MATCH → OFFER → ACCEPT → CONFIRM
   → EN ROUTE → ARRIVE → WORK → COMPLETE → PAY → REVIEW
```

Verified end to end over HTTP against a real database. A worked run is in
`docs/QA.md`.

---

## When the customer needs someone

The customer picks one of three, on the home screen, as one control:

| Choice | Means | Matched against |
|---|---|---|
| **עכשיו** (`NOW`) | needs someone now | the provider's realtime switch |
| **היום** (`ASAP`) | soon, today | the switch, and the next open slot counts too |
| **בתאריך** (`SCHEDULED`) | a specific time | the provider's weekly plan for that slot |

This is not a label. It becomes `jobs.timing_intent` and
`jobs.requested_for`, and it changes **who is eligible** — for a `NOW` job an
online provider is offered and an offline one is not; for tomorrow at 10:00 it
inverts. Job duration is honoured too, so a 90-minute job does not fit a
window closing in 60. See [AVAILABILITY.md](AVAILABILITY.md).

Underneath, each category still declares which booking modes it supports
(`supports_now`, `supports_schedule`) as configuration rather than code, and
timing is normalised onto that.

**`COMPARE` (multi-quote) is not built.** It was removed from the UI *and*
refused by the API rather than left reachable: a job created in that mode sat
in `REQUESTED` with nothing dispatching it and no screen to compare quotes
on. An absent feature is a gap; a button promising it is a lie the customer
pays for.

---

## The catalog

62 services across 7 categories. It started at 23, which was thin enough that
a provider's actual trade was often missing — and a missing trade is not a
small inconvenience: with nothing declared, the candidate search cannot
return them at all.

| Category | Services |
|---|---|
| אינסטלציה | 11 |
| חשמל | 11 |
| מיזוג אוויר | 9 |
| הדברה | 8 |
| ניקיון | 8 |
| גינון | 8 |
| מנעולנות | 7 |

Every service carries the phrasings a customer would actually type, and those
live in the database (`services.strong_phrases` / `weak_phrases`) rather than
in code — the same mechanism an admin-approved trade uses, so the path is
exercised by the bulk of the catalog instead of only by the occasional
approval. A service without phrases is unreachable by every description, so
`catalog-reachability.test.ts` asserts each phrase resolves to the service
that declares it, and migration `0028` refuses to add a silent one.

---

## The catalog is not the world

Seven categories and twenty-three services do not cover the trades people
actually do, and a provider whose work is missing has no way in at all: the
candidate search requires a declared trade, so without one they are absent
from every search rather than merely ranked low.

So a provider can search the catalog by **the work** ("מזגן", "אסלה") rather
than by our category names, and when nothing fits they write it in their own
words. That is a **proposal**: it changes nothing about matching, and the
screen says so on the form and on every pending row. An admin resolves it,
and approval creates a service under an existing category, links the provider
to it, and — necessarily — carries the phrases a customer would type.

Those phrases are the part that makes approval real. The classifier routes a
description to a service by matching phrasings; a service approved without
any can never be reached, so the provider would be told "approved" and still
never get a job. They are a required field, enforced twice, so the fake
approval cannot be expressed. See [DECISIONS D-022](DECISIONS.md).

---

## MVP categories

Plumbing · Electrical · Air conditioning · Locksmith · Pest control ·
Cleaning · Gardening — 23 services between them.

Adding a category is an `INSERT` into `categories`. Its behaviour is data:
pricing model, which booking modes it allows, whether it needs a licence,
insurance, documents or before/after photos, default duration and radius,
required skills.

---

## What the customer sees

The home screen asks **two** things and nothing else: *מה צריך?* and *מתי?*,
then one button. No category grid, no radius, no rating filter, no adverts,
no onboarding carousel. Target: a first-time customer requests service in
under 60 seconds.

The category grid was removed rather than tidied away. It looked helpful and
was harmful: it invited the customer to classify their own problem — the job
the system exists to do — and a wrong self-classification silently narrows
the search to the wrong trade. The description already contains the answer.

`/request` then shows those two answers as sentences with a `שינוי` link, and
spends itself on the one thing still genuinely missing: location. Both
answers survive the sign-in redirect, so a request started while signed out
is the request you come back to.

### One match at a time, and how to say no to it

Offers go to several providers at once and **the first to accept gets the
job** (D-020). That is what makes "who is already going there" usable: a
provider two minutes from the door is the best answer for about two minutes,
and a quote round or a shortlist spends that window asking the customer to
redo work the ranking already did.

So the customer sees one match, with a price and an ETA — a yes-or-no, not a
research task. And because there is only one, rejecting it had to become its
own action: `לא זה — חפשו אחר` frees that provider, excludes them from this
job and searches again, while `ביטול הבקשה` drops the request. Collapsing
those two into one button meant a customer who disliked a match lost their
whole request. Three rejections per job, because each one excludes a provider
and an uncapped button walks the ranked list — a directory by another name.

At the match, one recommendation, not a list to browse:

```
מצאנו לך מקצוען
רם אביטן          ★ 4.8 (156)
🚗 כבר בדרך לאזור שלך      ● ───────→ ●
הגעה משוערת   13 דקות      מחיר   ₪290
[ הזמן עכשיו ]             [ פרטים › ]
[ לא זה — חפשו אחר ]
[ ביטול הבקשה ]
```

`כבר בדרך לאזור שלך` appears only when the accepted offer carried real route
evidence — a stated destination or a measured heading — never on proximity
alone.

ETAs are labelled as estimates, because with the default routing provider
they are estimates. The product does not promise a number it cannot measure.

`פרטים` opens the provider's profile as a **bottom sheet**, so the match, its
price and its ETA stay behind it and closing returns to exactly them. Inside,
the order is the trust order: verification, then the rating *with* its review
count, then completed jobs, then experience, then availability as one
sentence. Never the provider's calendar, coordinates, or any internal score.

## What the provider sees

Built for someone who may be driving between jobs: large buttons, minimal
text, one decision at a time.

The home screen is **one** dominant control — a `מקבל עבודות` switch — the
current answer underneath it (`זמין עד 18:00`, `זמין מחר מ-08:00`), and one
`שינוי שעות` link. Everything deeper lives on `/provider/availability`: the
weekly plan, quick actions (available for two hours, until the end of the
shift, not today), vacation ranges, and upcoming exceptions.

An incoming offer
leads with the thing that makes it worth taking — **🚗 עבודה בדרך שלך** — then
distance, ETA and pay. During a job there is exactly one primary button:
*יוצא לדרך* → *הגעתי* → *מתחיל לעבוד* → *סיימתי*.

`BUSY` cannot be set by hand; it follows from holding an assignment, so it
cannot be used to dodge the one-job-at-a-time rule.

---

## Trust and money

- **Commission**: 15% up to ₪1,000, 10% above. Configuration, not code, with
  support for percentage, fixed, tiered and per-category overrides.
- **Prices** come from the provider's committed rate, read server-side. A
  request body never carries an amount.
- **A job becomes PAID only after a successful capture.** A failed payment
  leaves it `COMPLETED`.
- **Reviews** are two-sided and restricted to participants of a job that
  actually completed — enforced in the database.
- **Verification**: providers start `PENDING` and cannot receive work until an
  admin verifies them. Documents stay private.

---

## Operations

The admin control tower shows providers online, active and searching jobs,
unmatched requests, en-route professionals, disputes, completions and revenue
— with a live map of where supply is, where demand is, and which way supply is
pointing. Every admin action is audited with before/after state.

**North star: successful completions.** Secondary: time to successful
completion. The dashboard reports time to first offer, time to match, match
rate, acceptance rate, completion rate, cancellation rate, provider response
time, average job value and unmatched rate.

`/matching-lab` runs the real matching engine over hypothetical providers so
the algorithm can be examined before it is trusted with customers.

---

## Deliberately not in this MVP

Loyalty, referrals, coupons, subscriptions, advertising, social features,
franchise management, international expansion, complex CRM, multi-stop jobs,
dynamic pricing, AI chat, and a long category list.

The architecture is future-ready — `OPPORTUNITY_PRICE` and `DYNAMIC` exist in
the price-model enum, the understanding service has an adapter seam for AI —
but the implementation is not. Data is collected clean first; no machine
learning is implemented.

---

## The network effect this is built for

```
More customers → more jobs → more provider supply → better availability
  → better matching → faster service → better experience → more customers
```

Route opportunity strengthens with density in a specific way: more providers
working means more *known destinations*, which turns inferred direction into
measured route deviation. The signal improves as the network grows.

Every completed job records where the provider was, where they were going,
the route, the ETA, the deviation, the price, the response and the rating —
the foundation for later improvements to matching, ETA accuracy, pricing and
demand prediction.
