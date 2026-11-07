# PRO NETWORK — interactive prototype

Hebrew RTL, mobile-first marketplace prototype connecting customers with service professionals across Israel.
Three interfaces (customer / professional / admin), a rules-based matching engine and a commission engine.

**Everything is simulated.** Data lives in the browser's localStorage. No SMS, WhatsApp, email,
payments or authentication are real, and nothing leaves the browser.

## Run
- `npm start` then open `http://localhost:3000/pro-network.html`, or open `public/pro-network.html` directly.
- Source is in `src/`; run `./build.sh` after editing to regenerate `public/pro-network.html`.

## Source layout
| File | Contents |
|---|---|
| `src/01-head.html` | Design tokens (light/dark), all CSS |
| `src/02-body.html` | App shell markup |
| `src/03-core.js` | Reference data, demo seed, matching engine, commission engine, store |
| `src/04-ui.js` | Icons, helpers, routing, sheet/toast |
| `src/05-customer.js` | Customer home, request form, tracking |
| `src/06-pro.js` | Professional dashboard, requests, jobs, earnings, profile |
| `src/07-admin.js` | Admin overview, leads, providers, commissions, customers, categories, matching, complaints, reports |
| `src/08-events.js` | Demo walkthrough, actions, form handlers, boot |

## Matching rules
Mandatory: category, service area (city or region), approved, active, verified license where required, available.
Lead is blocked when name / valid phone / category / city / description is missing, or when the customer has not consented.
Ranking: geography 30%, availability 25%, quality 20%, acceptance rate 15%, fair distribution 10%. Top 3 receive the lead;
customer name/phone/address are revealed only to the provider who accepts.

## Commission rules
Base = (payments − refunds) ÷ 1.18 (VAT excluded). Rate precedence: large project (≥ ₪50,000 ex-VAT) →
dispute resolution override → provider agreement → category rate (editable per tier range).
Supports partial payments, refunds, cancellations, disputes, waive/collect.

## Production gaps
Supabase Postgres + RLS, Supabase Auth with roles, private storage for images, WhatsApp Business API,
payment/invoice provider (e.g. Green Invoice / Tranzila / Cardcom), and server-side (Edge Function) finalisation
of all financial records. The service-role key must only exist server-side.
