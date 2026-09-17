# GET SERVICE — סכימת מסד הנתונים

PostgreSQL דרך Supabase, עם `postgis` לחישובי מרחק ו-`pgcrypto` ל-UUID.
כל הטבלאות משתמשות ב-UUID כמפתח ראשי, ולכל טבלה רלוונטית יש `created_at` ו-
`updated_at` (האחרון מתוחזק על ידי טריגר `set_updated_at`, לא על ידי הלקוח).

המיגרציות ב-`supabase/migrations/`, לפי סדר:

| קובץ | תוכן |
| --- | --- |
| `…000000_extensions_and_enums` | הרחבות, enums, `set_updated_at` |
| `…000100_core_tables` | זהות, פרופילים, קטלוג, בעלי מקצוע |
| `…000200_jobs_and_offers` | עבודות, הצעות, שיבוצים, צ׳אט |
| `…000300_payments_reviews_admin` | תשלומים, דירוגים, תלונות, הגדרות |
| `…000400_functions` | פונקציות דומיין, טריגרים, `find_nearby_providers` |
| `…000500_rls` | Row Level Security |
| `…000600_storage_and_realtime` | buckets, מדיניות אחסון, publication |
| `…000700_reference_data` | קטלוג התחלתי + הגדרות פלטפורמה |

---

## 1. Enums

| Enum | ערכים |
| --- | --- |
| `user_role` | `customer`, `provider`, `admin` |
| `account_status` | `active`, `suspended`, `blocked` |
| `provider_status` | `pending`, `verified`, `rejected`, `suspended` |
| `job_status` | `requested`, `searching`, `offers_received`, `provider_selected`, `provider_on_the_way`, `arrived`, `in_progress`, `completed`, `cancelled`, `disputed` |
| `job_urgency` | `now`, `today`, `tomorrow`, `scheduled` |
| `offer_status` | `pending`, `accepted`, `rejected`, `expired`, `withdrawn` |
| `payment_status` | `pending`, `authorized`, `captured`, `refunded`, `failed`, `cancelled` |
| `transaction_type` | `authorization`, `capture`, `refund`, `payout`, `platform_fee` |
| `dispute_status` | `open`, `under_review`, `resolved`, `rejected` |
| `dispute_reason` | `price`, `not_performed`, `damage`, `no_show`, `payment_issue`, `other` |
| `document_type` | `identity`, `professional_license`, `certificate`, `insurance`, `business_registration`, `other` |
| `document_status` | `pending`, `approved`, `rejected` |
| `notification_channel` | `in_app`, `push`, `sms`, `email`, `whatsapp` |
| `notification_status` | `pending`, `sent`, `failed`, `read` |
| `message_type` | `text`, `image`, `system` |
| `actor_type` | `customer`, `provider`, `admin`, `system` |
| `media_kind` | `image`, `video` |

---

## 2. טבלאות

### זהות ופרופילים

| טבלה | תפקיד | שדות מרכזיים |
| --- | --- | --- |
| `users` | מראה אפליקטיבית של `auth.users`; מחזיקה תפקיד וסטטוס חשבון | `id` (FK ל-auth), `email`, `phone`, `role`, `status`, `status_reason` |
| `profiles` | מידע תצוגה משותף לכל התפקידים | `user_id`, `full_name`, `avatar_url`, `locale`, `phone` |
| `customer_profiles` | העדפות לקוח | `default_address`, `default_lat`, `default_lng`, `jobs_created` |

### קטלוג (Database-driven)

| טבלה | תפקיד |
| --- | --- |
| `categories` | `slug`, `name`, `name_en`, `icon`, `sort_order`, `active` |
| `services` | שירות בתוך קטגוריה — `category_id`, `slug`, `name`, `base_price`, unique על `(category_id, slug)` |

אין קטגוריה או שירות מקודדים באפליקציה. `lib/services/catalogue/fallback.ts` הוא
עותק של הקטלוג ההתחלתי שמשמש **רק** כשאין חיבור Supabase, ומסומן ככזה.

### בעלי מקצוע

| טבלה | תפקיד |
| --- | --- |
| `provider_profiles` | עסק, ניסיון, סטטוס אימות, דירוג ומונים מצטברים |
| `provider_categories` | אילו תחומים בעל המקצוע מבצע |
| `provider_services` | שירותים ספציפיים + `price_from` |
| `service_areas` | מרכז + רדיוס; עמודת `center` מסוג `geography(Point,4326)` מחושבת אוטומטית |
| `provider_availability` | `is_available`, `available_until`, לוח שבועי |
| `provider_locations` | מיקום אחרון; `coordinates` מחושב; נמחק כשמכבים זמינות |
| `provider_documents` | מסמכי אימות — **רגיש**, קבצים ב-bucket פרטי |
| `provider_gallery` | תמונות עבודות (ציבורי) |

`rating_avg`, `rating_count`, `completed_jobs`, `cancelled_jobs` ו-
`avg_response_seconds` מתוחזקים בטריגרים בלבד. טריגר
`guard_provider_protected_columns` מחזיר אותם — ואת `status` ו-`verified_at` —
לערכם הקודם אם משתמש שאינו מנהל מנסה לשנות אותם.

### עבודות

| טבלה | תפקיד |
| --- | --- |
| `jobs` | הבקשה: קטגוריה, תיאור, מיקום (`location` מחושב), דחיפות, תקציב, סטטוס, שיבוץ, מחיר סופי ופיצול |
| `job_images` | תמונות/סרטונים (נתיבי אחסון בלבד) |
| `job_offers` | הצעת מחיר: `price`, `eta_minutes`, `valid_until`, unique על `(job_id, provider_id)` |
| `job_assignments` | תוצאת מנוע ההתאמה **וגם שער ההרשאה** לבעל המקצוע; `match_score`, `score_breakdown`, `declined_at` |
| `job_status_history` | כל מעבר סטטוס, נכתב בטריגר |
| `messages` | צ׳אט לעבודה; אילוץ מוודא שיש תוכן או קובץ |
| `favorites` | בעלי מקצוע מועדפים של לקוח |

אילוצים בולטים ב-`jobs`: `jobs_budget_range` (מקסימום ≥ מינימום),
`jobs_scheduled_requires_date` (דחיפות `scheduled` מחייבת תאריך).

### כסף

| טבלה | תפקיד |
| --- | --- |
| `payments` | שורה אחת לעבודה: `amount`, `platform_fee`, `provider_payout`, `status`, `fee_rule_snapshot` |
| `payment_transactions` | יומן פעולות מול ספק הסליקה |
| `platform_fees` | רישום העמלה שנגבתה, עם השיעור והכלל |

אילוץ `payments_split_balances` אוכף ש-`platform_fee + provider_payout = amount`
מעוגל לאגורה. פרטי כרטיס אשראי אינם נשמרים — רק מזהה חיצוני של הספק.

### דירוגים, תלונות, התראות, ניהול

| טבלה | תפקיד |
| --- | --- |
| `reviews` | דירוג אחד לעבודה; `is_hidden` למודרציה, `flagged` לזיהוי אוטומטי |
| `review_categories` | ניקוד לפי קריטריון: מקצועיות, מחיר, עמידה בזמנים, שירות |
| `disputes` | תלונה, סיבה, סטטוס והחלטה |
| `notifications` | שורה לכל ערוץ לכל אירוע; `in_app` היא הפיד |
| `settings` | תצורת פלטפורמה ב-JSONB לפי מפתח |
| `admin_actions` | יומן ביקורת לכל פעולת מנהל |

---

## 3. פונקציות וטריגרים

| שם | סוג | תפקיד |
| --- | --- | --- |
| `set_updated_at` | טריגר | `updated_at` לא נסמך על הלקוח |
| `handle_new_user` | טריגר על `auth.users` | יוצר `users`/`profiles`/פרופיל תפקיד; **לא מסוגל להנפיק `admin`** |
| `log_job_status_change` | טריגר | רושם כל מעבר ב-`job_status_history` |
| `refresh_provider_rating` | טריגר | מחשב מחדש ממוצע וספירה מביקורות **גלויות בלבד** |
| `track_offer_response_time` | טריגר | ממוצע נע של זמן התגובה, מזין את מנוע ההתאמה |
| `track_job_completion` | טריגר | מונה עבודות שהושלמו ובוטלו |
| `auth_role`, `is_admin`, `current_provider_id` | `SECURITY DEFINER` | עוזרי RLS; מוגדרים כך כדי שהערכת מדיניות לא תיכנס לרקורסיה |
| `can_access_job`, `can_chat_on_job`, `shares_job_with` | `SECURITY DEFINER` | לוגיקת הגישה לעבודה ולצ׳אט |
| `guard_user_protected_columns` | טריגר | מונע ממשתמש לשנות את התפקיד או הסטטוס של עצמו |
| `guard_provider_protected_columns` | טריגר | מונע מבעל מקצוע לשנות אימות, דירוג ומונים |
| `find_nearby_providers` | פונקציה | גילוי מועמדים גיאוגרפי (ראה למטה) |

### `find_nearby_providers`

```sql
find_nearby_providers(
  category_id uuid,
  latitude    double precision,
  longitude   double precision,
  radius_km   double precision default 5,
  service_id  uuid default null,
  max_results integer default 50
)
```

מחזירה מועמדים מסוננים בלבד — `verified`, משתמש `active`, בקטגוריה, ובתוך
הרדיוס או עם אזור שירות שמכסה את הנקודה. המרחק נמדד מהמיקום החי אם קיים, אחרת
ממרכז אזור השירות הקרוב ביותר. **הדירוג עצמו אינו במסד** — הוא ב-
`lib/services/matching/engine.ts`, כדי שמנהל יוכל לשנות משקלים בלי מיגרציה.

---

## 4. אינדקסים

**עבודות:** `status`, `category_id`, `created_at desc`, `(customer_id, created_at)`,
`(assigned_provider_id, created_at)`, GIST על `location`, ואינדקס חלקי על עבודות פתוחות.

**בעלי מקצוע:** `provider_profiles.status`, `rating_avg desc`,
`provider_categories.category_id`, `service_areas` GIST על `center`,
`provider_locations` GIST על `coordinates`, ואינדקס חלקי על `is_available` כשהוא true.

**הצעות ושיבוצים:** `(job_id, status)`, `(provider_id, created_at)`,
`(job_id, match_score desc)`.

**דירוגים:** `(provider_id, created_at desc)` ואינדקס חלקי על ביקורות גלויות.

**כסף:** `payments.status`, לפי ספק ולפי לקוח, `payment_transactions(payment_id)`.

**התראות:** `(user_id, created_at desc)` ואינדקס חלקי על התראות שלא נקראו.

---

## 5. Row Level Security

RLS מופעל **ומאולץ** (`force row level security`) בכל טבלה. ברירת המחדל היא
מניעה; כל גישה היא מדיניות מפורשת.

| טבלה | קריאה | כתיבה |
| --- | --- | --- |
| `users` | עצמי, מנהל, או צד נגדי בעבודה משותפת | עצמי (תפקיד וסטטוס ננעלים בטריגר) |
| `profiles` | עצמי, מנהל, צד נגדי | עצמי |
| `categories`, `services` | כולם (כולל אנונימי) אם `active` | מנהל |
| `provider_profiles` | `verified` לכולם; שלי; מנהל | הבעלים (שדות מוגנים ננעלים) |
| `provider_locations` | הבעלים, מנהל, **ולקוח רק בזמן עבודה פעילה** | הבעלים |
| `provider_documents` | הבעלים ומנהל בלבד | הבעלים מוסיף; מנהל מאשר |
| `jobs` | `can_access_job()` — לקוח שלו, בעל מקצוע ששובץ או שהעבודה שודרה אליו | לקוח יוצר; משתתפים מעדכנים |
| `job_offers` | לקוח העבודה, המציע, מנהל | מציע עם שיבוץ קיים ועבודה פתוחה |
| `job_assignments` | המציע, לקוח העבודה, מנהל | **service role בלבד** (מנוע ההתאמה) |
| `messages` | `can_chat_on_job()` — שני הצדדים בלבד | שולח = המשתמש, ורק בעבודה משויכת |
| `payments` | לקוח, בעל המקצוע, מנהל | **service role בלבד** |
| `payment_transactions`, `platform_fees` | מנהל בלבד | service role |
| `reviews` | גלויות לכולם; מוסתרות למנהל ולכותב | לקוח על עבודה שהושלמה; **עדכון למנהל בלבד; אין מחיקה** |
| `disputes` | משתתפים ומנהל | משתתפים פותחים; מנהל מטפל |
| `notifications` | הנמען, מנהל | סימון כנקרא בלבד |
| `settings`, `admin_actions` | **מנהל בלבד** | מנהל |

הערה: `settings` סגורה בכוונה — היא מכילה את משקלי ההתאמה, שאסור לחשוף ללקוחות.
השרת קורא אותה דרך ה-service client.

---

## 6. Storage

| Bucket | ציבורי | מגבלה | מי קורא |
| --- | --- | --- | --- |
| `avatars` | כן | 5MB | כולם |
| `provider-gallery` | כן | 10MB | כולם |
| `job-media` | לא | 50MB | מעלה, צד נגדי בעבודה, מנהל |
| `chat-media` | לא | 10MB | מעלה, צד נגדי בעבודה, מנהל |
| `provider-documents` | לא | 20MB | **המעלה ומנהל בלבד** |

מוסכמת נתיב: `<user_id>/<uuid>.<ext>`. מדיניות ה-Storage בודקת את התיקייה
הראשונה מול `auth.uid()`, כך שהבעלות ניתנת להוכחה מהנתיב עצמו.

---

## 7. Realtime

`supabase_realtime` כולל: `jobs`, `job_offers`, `job_assignments`,
`job_status_history`, `messages`, `provider_locations`, `notifications`.
לטבלאות שמשדרות עדכונים הוגדר `replica identity full` כדי שה-payload יכיל גם את
השורה הקודמת. RLS חל על מנויים בדיוק כמו על שאילתות.

---

## 8. הגדרות (`settings`)

| מפתח | מה הוא שולט |
| --- | --- |
| `platform_fee_rules` | אחוז ברירת מחדל, מדרגות לפי סכום, מינימום/מקסימום, overrides לקטגוריה ולבעל מקצוע |
| `match_weights` | ששת משקלי מנוע ההתאמה (חייבים לסכום ל-1) |
| `matching` | שלבי רדיוס, מינימום מועמדים, גודל רשימה, בונוס מועדפים |
| `timeouts` | חלון חיפוש, זמן תגובה, תוקף הצעה |
| `cancellation` | חלון ביטול חופשי, אחוז דמי ביטול |
| `reviews` | חלון דירוג, קריטריונים, סף סימון אוטומטי |
| `notifications` | ערוצים לכל אירוע, שעות שקט |
| `anti_fraud` | חלון כפילויות, מגבלות קצב, סף דירוגים חריגים |

כל ערך נקרא דרך `getSetting()` שמאמת אותו מול סכימת Zod ונופל לברירות מחדל
מוכרות אם המסד לא זמין — כך שתמחור והתאמה נשארים דטרמיניסטיים גם במצב הדגמה.
