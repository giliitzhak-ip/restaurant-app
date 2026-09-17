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

## Booking modes

Not every category fits one model, and the model is configuration, not code.

| Mode | For | Behaviour |
|---|---|---|
| **NOW** | Leak, power cut, lockout, urgent pest control | Dispatches immediately |
| **SCHEDULE** | Appointments | Created, dispatched for the slot |
| **COMPARE** | Larger or less predictable work | Multiple quotes |

Each category declares which modes it supports. Locksmith is NOW-only;
cleaning and gardening are quote-based.

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

The home screen asks one question — **מה צריך לעשות?** — offers one text
field, three ways to proceed, and a short list of popular trades. No category
grid, no adverts, no onboarding carousel. Target: a first-time customer
requests service in under 60 seconds.

At the match, one recommendation, not a list to browse:

```
מצאנו לך מקצוען
רם אביטן          ★ 4.8
🚗 כבר נמצא באזור שלך
הגעה משוערת   13 דקות
מחיר          ₪290
[ הזמן עכשיו ]
```

ETAs are labelled as estimates, because with the default routing provider
they are estimates. The product does not promise a number it cannot measure.

## What the provider sees

Built for someone who may be driving between jobs: large buttons, minimal
text, one decision at a time. Availability is one control. An incoming offer
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
