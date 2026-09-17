# Brand guidelines

## The one line

> **צריך? אנחנו מוצאים.**

Not "the best professionals". Not "thousands of providers". The promise is
that the customer describes a problem and the system does the finding — which
is also literally what the product does, so the line stays true under
scrutiny.

## Name

**GET SERVICE**, set in two weights: `GET` in `ink`, `SERVICE` in
`brand-bright`, preceded by a small `brand` dot. Always Latin, always
uppercase, never translated and never interleaved with Hebrew inside the same
run — Latin inside a Hebrew sentence must be bidi-isolated or the algorithm
reorders it. This is not a style preference; it produced a real rendering bug
where `GET SERVICE — RLS` came out reversed.

## What the brand is

A **night-time mobility network**: quiet, precise, operational. The reference
points are dispatch consoles and transit apps, not consumer marketplaces.

What it is **not**, and the discipline each rejection buys:

| Not | Because |
|---|---|
| Cyberpunk | Neon on neon means nothing on screen is emphasised. |
| A crypto dashboard | Charts and gradients imply data we do not have. |
| A bright consumer marketplace | White surfaces make live movement invisible. |
| Playful / illustrated | This is used during a burst pipe at 23:00. |

## Voice

Hebrew, second person, plain. Short sentences. No exclamation marks.

* **State what is happening, not how we feel about it.**
  "מחפשים לך מקצוען" — not "מחפשים בשבילך את המקצוען המושלם!".
* **Numbers over adjectives.** "9 דקות" beats "מהר".
* **Say what we do not know.** `לא פרסם שעות קבועות` rather than a confident
  claim about someone's calendar. `אין זמינות בשבועיים הקרובים` is reserved
  for when we actually know.
* **Errors describe the situation and the next action**, never blame the user
  and never apologise twice. "לא הצלחנו לאתר את המיקום. אשרו גישה למיקום —
  בלעדיו לא נוכל לחשב זמן הגעה אמיתי."
* **Normal market outcomes are not errors.** "העבודה כבר שובצה לבעל מקצוע
  אחר" is information. A provider losing a race did nothing wrong.

## The visual signature

```
● ───────→ ●
```

A connection being made, provider to customer. It appears at exactly two
moments — a match being found, and a provider en route — and nowhere else. A
route line on every card is decoration, and decoration that looks like data
is worse than decoration.

## Honesty rules that outrank aesthetics

These are brand rules because breaking them damages trust faster than any
visual mistake:

* **Never show a route claim without route evidence.** "כבר בדרך לאזור שלך"
  appears only when the offer carried a stated destination or a measured
  heading — never on proximity alone.
* **Never present a stale GPS fix as live.** A fix older than 120s stops
  counting, and the provider drops out of live matching rather than appearing
  to be somewhere they are not.
* **Never show a fabricated rating.** No reviews means `חדש ב-GET SERVICE`,
  not `0.0`, and no star distribution when there are no reviews behind it.
* **Never show a payment as successful when it was mocked.** The mock
  provider reports `isReal: false` and the UI says so.
* **Never present synthetic seeded providers as real people.** No
  photographs, no invented reviews, no certifications.

## Demo mode

Demo mode is labelled on screen, every time. A demo that looks like
production is a lie with a nice interface.
