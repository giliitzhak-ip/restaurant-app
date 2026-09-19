# מיפוי דרישות — יומן ביצוע הדברה

מסמך זה ממפה כל דרישה מחייבת אל השדה בטופס, הוולידציה, העמודה/הטבלה במסד
הנתונים, והמקום שבו היא מופיעה ב-PDF.

---

## ⚠ הצהרות חשובות — לקרוא לפני שימוש

### 1. המערכת אינה מאושרת רשמית
המערכת **אינה** מאושרת, מוסמכת או מאומתת על ידי משרד הבריאות, הרשם לענייני
מדבירים או כל גוף רשמי אחר. היא כלי תיעוד בלבד. האחריות על תוכן היומן
ועל עמידתו בהוראות הרשם היא על המדביר בעל הרישיון.

### 2. מקור הדרישות במסמך זה
הדרישות במסמך זה נגזרו מ**מפרט הדרישות שנמסר לצוות הפיתוח** (17 הסעיפים),
המתייחס להוראות הרשם לענייני מדבירים בנושא יומן ביצוע הדברה, מכוח סעיף
19(א) לחוק הסדרת העיסוק בהדברה תברואית, התשע״ו–2016, שבתוקף מיום 01.09.2026.

**נוסח הוראת הרשם המקורי לא נקרא בזמן הפיתוח.** הכתובת
`https://www.gov.il/BlobFolder/guide/professional_guidelines_for_pesticide/he/pest_control_execution-log-b.pdf`
חסומה ברשת סביבת הפיתוח (מדיניות egress החזירה 403 על CONNECT ל-`www.gov.il`,
גם ב-curl וגם בשירות שליפת דפים).

**מה המשמעות המעשית:** המערכת מיישמת את 17 הסעיפים כפי שנמסרו, במלואם.
לא נוספו דרישות שלא הופיעו במפרט, ולא הומצאו סיווגים רשמיים. הפריטים
המסומנים 🔎 להלן מחייבים השוואה לנוסח הרשמי לפני עלייה לאוויר.

### 3. מה לעשות לפני הפעלה בסביבת אמת
1. להוריד את מסמך הרשם מהכתובת שלעיל (מרשת שאינה חסומה).
2. לעבור על הטבלאות במסמך זה סעיף-סעיף מול הנוסח הרשמי.
3. לטפל בכל פריט המסומן 🔎.
4. לטעון את נספח א׳ (רשימת המזיקים) דרך `npm run import:pest-catalog`
   — ראו §6 להלן. **המערכת אינה מגיעה עם רשימת מזיקים "רשמית" מוטבעת בקוד.**
5. לטעון את מאגר התכשירים ממקור מאומת — ראו §12.

---

## איפה נאכפת כל דרישה

| שכבה | קובץ | תפקיד |
| --- | --- | --- |
| סכימה מרכזית (Zod) | `src/schema/` | מקור אמת אחד לטופס, לשרת, להשלמה ול-PDF |
| טופס | `src/features/wizard/Step*.tsx` | הצגת השדות, שדות מותנים |
| ולידציית השלמה | `src/schema/pestLog.ts` → `validateForCompletion` | חסימת השלמה של יומן חסר |
| שרת | `server/completion.ts` | מריץ את אותה סכימה; הלקוח אינו יכול לעקוף |
| מסד נתונים | `supabase/migrations/` | אילוצים, טריגרים, RLS, השלמה אטומית |
| PDF | `server/pdfTemplate.ts` | הצגת כל השדות המחייבים |

---

## סעיף 1 — פרטי המדביר

| דרישה | שדה בטופס | ולידציה | מסד נתונים | PDF |
| --- | --- | --- | --- | --- |
| שם מלא | `exterminator.fullName` | חובה, עד 200 תווים | `pest_logs.content/snapshot` + `pesticide_licenses.holder_name` | "פרטי המדביר" → שם מלא |
| סוג רישיון | `exterminator.licenseType` | חובה 🔎 | `pesticide_licenses.license_type` | סוג רישיון |
| מספר רישיון | `exterminator.licenseNumber` | חובה, 2–40 תווים, תווים חוקיים 🔎 | `pesticide_licenses.license_number` | מספר רישיון |
| טלפון נייד | `exterminator.mobile` | פורמט נייד ישראלי `05XXXXXXXX` | `pesticide_licenses.mobile` | טלפון נייד |
| דוא״ל | `exterminator.email` | פורמט דוא״ל | `pesticide_licenses.email` | דוא״ל |
| כתובת | `exterminator.address` | חובה | `pesticide_licenses.address` | כתובת |

🔎 **סוג ומספר רישיון:** סוג הרישיון הוא שדה טקסט חופשי עם הצעות
(`LICENSE_TYPE_SUGGESTIONS`) ולא רשימה סגורה, כדי לא להמציא סיווג רשמי.
מספר הרישיון נבדק רק לקיום ולתווים חוקיים — אם להוראה יש פורמט מחייב,
יש להוסיף אותו ב-`src/schema/primitives.ts` → `licenseNumber`.

## סעיף 2 — פרטי מפעיל המדביר (אם קיים)

| דרישה | שדה בטופס | ולידציה | מסד נתונים | PDF |
| --- | --- | --- | --- | --- |
| קיים מפעיל? | `operator.hasOperator` | דיסקרימינטור | `content/snapshot` | "פרטי מפעיל המדביר" |
| שם | `operator.name` | חובה **רק** אם קיים מפעיל | `content/snapshot` | שם |
| טלפון | `operator.phone` | פורמט טלפון ישראלי | `content/snapshot` | טלפון |
| דוא״ל | `operator.email` | פורמט דוא״ל | `content/snapshot` | דוא״ל |
| כתובת | `operator.address` | חובה אם קיים מפעיל | `content/snapshot` | כתובת |

כשאין מפעיל, ה-PDF מציג במפורש "לא קיים מפעיל מדביר ליומן זה" — ולא מותיר
מקטע ריק.

## סעיף 3 — פרטי מזמין ההדברה

| דרישה | שדה בטופס | ולידציה | מסד נתונים | PDF |
| --- | --- | --- | --- | --- |
| שם | `orderer.name` | חובה | `clients.name`, `pest_logs.client_id` | "פרטי מזמין ההדברה" → שם |
| מספר טלפון | `orderer.phone` | פורמט טלפון ישראלי | `clients.phone` | טלפון |
| מספר נייד (אדם פרטי) | `orderer.mobile` | **חובה כאשר** `isPrivatePerson = true` | `clients.mobile` | טלפון נייד |
| תפקידו | `orderer.role` | חובה | `clients.contact_role` | תפקיד |

הכלל המותנה ממומש ב-`ordererSchema.superRefine` ונבדק ב-
`tests/unit/schema.test.ts` → "דרישה 3".

## סעיף 4 — מקום ההדברה

שדות החובה משתנים לפי `location.placeKind` (discriminated union).

### דירה / בית / מבנה (`dwelling`)

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| עיר | `location.city` | חובה | `client_sites.city` | עיר |
| רחוב | `location.street` | חובה | `client_sites.street` | רחוב |
| מספר בית | `location.houseNumber` | חובה | `client_sites.house_number` | מספר בית |
| מספר דירה | `location.apartmentNumber` | חובה כאשר `structureType` מכיל "דירה" | `client_sites.apartment_number` | מספר דירה |
| סוג המבנה | `location.structureType` | חובה 🔎 | `client_sites.structure_type` | סוג המבנה |

🔎 סוגי המבנה הם הצעות (`STRUCTURE_TYPE_SUGGESTIONS`), לא רשימה סגורה.

### שטח פתוח (`open_area`)

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| שם הרשות המקומית | `location.localAuthorityName` | חובה | `client_sites.local_authority_name` | שם הרשות המקומית |
| סוג האתר | `location.siteType` | חובה 🔎 | `client_sites.site_type` | סוג האתר |
| תיאור האתר | `location.siteDescription` | חובה, עד 2000 תווים | `client_sites.site_description` | תיאור האתר |
| נ״צ | `location.coordinates` | **חובה**, בתחום ישראל | `client_sites.coordinates` (jsonb) | נ״צ |

### ערפול (`fogging_area`)

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| שם השכונה | `location.neighborhoodName` | חובה | `client_sites.neighborhood_name` | שם השכונה |
| עיר | `location.city` | חובה | `client_sites.city` | עיר |
| שם הרשות המקומית | `location.localAuthorityName` | חובה | `client_sites.local_authority_name` | שם הרשות המקומית |
| תיאור השטח | `location.areaDescription` | חובה | `client_sites.area_description` | תיאור השטח המערופל |
| נ״צ | `location.coordinates` | חובה, בתחום ישראל | `client_sites.coordinates` | נ״צ |

🔎 **"ושאר הפרטים הנדרשים במסמך הרשמי" בערפול:** המפרט מפנה לנוסח הרשמי.
יושמו: שם שכונה, עיר, רשות מקומית, תיאור השטח ונ״צ. אם הנוסח הרשמי דורש
שדות נוספים — יש להוסיף אותם ל-`foggingAreaLocationSchema`
(`src/schema/sections.ts`), למרשם השדות, ולתבנית ה-PDF.

**נ״צ:** נתמכות שתי שיטות — WGS84 (קו רוחב/אורך) ורשת ישראל החדשה (ITM).
שתיהן מוגבלות לתחום ישראל, כדי לתפוס שגיאות הקלדה. ניתן לקלוט מה-GPS של
המכשיר.

## סעיף 5 — תאריך ושעת ביצוע ההדברה בפועל

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| תאריך הביצוע | `execution.performedDate` | `YYYY-MM-DD`, תאריך קיים, **לא עתידי לפי שעון השרת** | `content/snapshot` | תאריך הביצוע |
| שעת תחילה | `execution.performedStartTime` | `HH:MM` 24 שעות | `content/snapshot` | שעת תחילה |
| שעת סיום | `execution.performedEndTime` | רשות; לא לפני שעת התחילה | `content/snapshot` | שעת סיום |

**שעון:** האפליקציה מודדת את ההיסט מול שעון השרת (`src/lib/time.ts`) ומזהירה
על סטייה. מועד ההשלמה (`completed_at`) נקבע ב-Postgres עצמו (`now()`) ולא
בשעון המכשיר.

## סעיף 6 — ממצאי ניטור

לכל ממצא (`monitoring.findings[]`):

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| המזיק שנמצא | `pestName` | חובה | `pest_findings.pest_name` | טבלת ממצאי ניטור → המזיק |
| פעולות הזיהוי | `identificationActions` | חובה | `pest_findings.identification_actions` | פעולות הזיהוי |
| דרגת התפתחות | `developmentStage` | חובה | `pest_findings.development_stage` | דרגת התפתחות |
| סימני נגיעות | `infestationSigns` | חובה | `pest_findings.infestation_signs` | סימני נגיעות |
| מיקום | `findingLocation` | חובה | `pest_findings.finding_location` | מיקום |
| רמת נגיעות | `infestationLevel` | `low`/`medium`/`high` בלבד | `pest_findings.infestation_level` + CHECK | רמת נגיעות (נמוכה/בינונית/גבוהה) |

נדרש **לפחות ממצא אחד** כדי להשלים יומן.

### 🔎 נספח א׳ — פירוט המזיקים

המפרט קובע: "פירוט המזיקים יהיה בהתאם לנספח א׳ בהוראות הרשם."

**נוסח נספח א׳ לא היה נגיש בזמן הפיתוח** (gov.il חסום — ראו למעלה).
**לא הומצאה רשימת מזיקים.** במקום זאת:

- טבלת `pest_catalog` מחזיקה את הקטלוג, ולכל שורה **חובה** `source_name`
  ו-`verified_at` — כך שלא ניתן להציג רשימה כ"רשמית" בלי אסמכתה.
- `supabase/seed.sql` טוען שתי שורות דוגמה בלבד, המסומנות במפורש
  `'נתוני דוגמה — אינו נספח א׳ הרשמי'`.
- שם המזיק בטופס הוא שדה עם השלמה אוטומטית מהקטלוג, אך **מאפשר טקסט חופשי**
  — כדי שהמערכת תהיה שמישה גם לפני טעינת הקטלוג.
- כשהקטלוג ריק, שלב 3 מציג אזהרה גלויה.

**להשלמה:** `npm run import:pest-catalog -- --file annex-a.csv --source "נספח א׳ להוראות הרשם" --verified-at 2026-09-01`
עם CSV בעמודות `code,name_he,name_scientific,group_name,source_name,source_url,verified_at`.

## סעיף 7 — פעולות מניעה וטיפול

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| פעולות שנבדקו/הומלצו/בוצעו | `prevention.actions[]` | לפחות פעולה אחת | `prevention_actions` | טבלת פעולות מניעה |
| תיאור הפעולה | `actions[].description` | חובה | `prevention_actions.description` | הפעולה |
| מצב הפעולה | `actions[].status` | `checked`/`recommended`/`performed` | `prevention_actions.status` + CHECK | מצב (נבדקה/הומלצה/בוצעה) |
| הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר | `prevention.circumstancesForChoosingPestControl` | חובה, עד 3000 תווים | `content/snapshot` | שדה נפרד מתחת לטבלה |

## סעיף 8 — אזהרות ומידע לפני ההדברה

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| תיאור מפורט של טיב ההדברה | `preWarnings.treatmentNatureDescription` | חובה | `content/snapshot` | תיאור טיב ההדברה |
| שם התכשיר | `applications[].productTradeName` | חובה (סעיף 12) | `pesticide_applications.product_trade_name` | טבלת התכשירים |
| החומר הפעיל | `applications[].activeIngredientName` | חובה (סעיף 12) | `pesticide_applications.active_ingredient_name` | טבלת התכשירים |
| סיכונים לאדם | `preWarnings.risksToHumans` | חובה | `content/snapshot` | סיכונים לאדם |
| סיכונים לבעלי חיים | `preWarnings.risksToAnimals` | חובה | `content/snapshot` | סיכונים לבעלי חיים |
| זמן כניסה מחדש | `preWarnings.reEntryHours` | מספר > 0 | `content/snapshot` | זמן כניסה מחדש (שעות) |
| הוראות נוספות לפי התווית | `preWarnings.additionalLabelInstructions` | חובה | `content/snapshot` | הוראות נוספות |

### כללי האזהרות שנאכפים

1. **אין מילוי אוטומטי.** אין ברירות מחדל לאזהרות או לזמן כניסה.
2. **תבנית היא הצעה בלבד.** טעינת תבנית ממלאת טקסט **ומאפסת את האישור**
   (`acknowledgedByExterminator = false`) — המדביר חייב לאשר מחדש.
3. **אסמכתת תווית חובה** (`preWarnings.labelReference`).
4. **אישור מפורש חובה:** `acknowledgedByExterminator` הוא `z.literal(true)`.
   ההשלמה נחסמת בלעדיו.
5. **כמה תכשירים:** האזהרות חייבות לכסות את **כל** מפתחות היישום
   (`coveredApplicationKeys`), או שיסומן `strictestAppliedAcrossAll = true`.
   אחרת ההשלמה נחסמת, וההודעה מפרטת אילו תכשירים אינם מכוסים.

## סעיף 9 — מדביר מסייע

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| שם | `assistants[].fullName` | חובה | `assistant_exterminators.full_name` | טבלת מדביר מסייע |
| סוג רישיון | `assistants[].licenseType` | חובה | `...license_type` | סוג רישיון |
| מספר רישיון | `assistants[].licenseNumber` | חובה | `...license_number` | מספר רישיון |
| טלפון | `assistants[].phone` | פורמט טלפון | `...phone` | טלפון |
| דוא״ל | `assistants[].email` | פורמט דוא״ל | `...email` | דוא״ל |
| כתובת | `assistants[].address` | חובה | `...address` | כתובת |
| חתימה | `assistants[].signature` | חובה, מאושרת | `signatures` (`signer_role='assistant'`) | מקטע החתימות |
| ניתנו הנחיות? | `assistants[].instructionsGiven` | `z.literal(true)` | `...instructions_given` | ניתנו הנחיות |
| קיבל עותק מהיומן? | `assistants[].receivedLogCopy` | בוליאני חובה | `...received_log_copy` | קיבל עותק |

`hasAssistant` ו-`assistants[]` חייבים להיות עקביים — סימון בלי פרטים, או
פרטים בלי סימון, חוסמים השלמה.

## סעיף 10 — איוד

נדרש כאשר `treatmentKinds` מכיל `fumigation`.

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| תיעוד פעולות האיטום לפני האיוד | `fumigation.sealingActions[]` | לפחות פעולה אחת | `content/snapshot` | "איוד — פעולות איטום" |
| תיאור האיטום | `sealingActions[].description` | חובה | `content/snapshot` | פעולת האיטום |
| מיקום | `sealingActions[].locationDescription` | חובה | `content/snapshot` | מיקום |
| מועד הביצוע | `sealingActions[].performedAt` | חותמת זמן חובה | `content/snapshot` | מועד ביצוע |
| מועד סיום האיטום | `fumigation.sealingCompletedAt` | חותמת זמן חובה | `content/snapshot` | מועד סיום |

## סעיף 11 — ערפול

נדרש כאשר `treatmentKinds` מכיל `fogging`.

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| האם ניתנה לציבור התראה מראש | `fogging.publicWarningGiven` | בוליאני חובה | `content/snapshot` | "ערפול — התראה לציבור" |
| אופן ההתראה | `fogging.publicWarningMethod` | חובה אם ניתנה התראה | `content/snapshot` | אופן ההתראה |
| מועד ההתראה | `fogging.publicWarningAt` | חובה אם ניתנה התראה | `content/snapshot` | מועד ההתראה |
| הסיבה לאי-מתן התראה | `fogging.publicWarningNotGivenReason` | חובה אם **לא** ניתנה | `content/snapshot` | הסיבה |

בערפול נדרש גם `location.placeKind = 'fogging_area'` (ולכן שם שכונה).

## סעיף 12 — לכל תכשיר ויישום

לכל `applications[]`:

| # | דרישה | שדה | ולידציה | מסד (`pesticide_applications`) | PDF (טבלת התכשירים) |
| --- | --- | --- | --- | --- | --- |
| 1 | שם המזיק | `targetPestName` | חובה; חייב להופיע בממצאי הניטור | `target_pest_name` | המזיק |
| 2 | השם המסחרי | `productTradeName` | חובה | `product_trade_name` | שם מסחרי |
| 3 | מספר אצווה / סדרת ייצור | `batchNumber` | חובה | `batch_number` | אצווה / סדרת ייצור |
| 4 | שם החומר הפעיל | `activeIngredientName` | חובה | `active_ingredient_name` | חומר פעיל |
| 5 | ריכוז החומר הפעיל בתכשיר | `activeIngredientConcentrationPercent` | 0 < x ≤ 100 | `active_ingredient_concentration_percent` + CHECK | ריכוז בתכשיר |
| 6 | מינון | `dosage` | > 0 | `dosage` + CHECK | מינון |
| 7 | יחידת מידה | `dosageUnit` | חובה | `dosage_unit` | יחידה |
| 8 | כמות תמיסה/תערובת/מלכודות | `mixtureKind`, `mixtureQuantity`, `mixtureUnit` | חובה, > 0 | `mixture_kind`, `mixture_quantity`, `mixture_unit` | כמות |
| 8 | ליחידת אורך/שטח/נפח | `quantityBasis`, `basisAmount`, `basisUnit` | חובה, > 0 | `quantity_basis`, `basis_amount`, `basis_unit` | בסיס |
| 9 | ריכוז החומר הפעיל במוכן לשימוש | `readyToUseConcentrationPercent` | ראו 🔎 להלן | `ready_to_use_concentration_percent` | ריכוז במוכן לשימוש |
| 10 | שיטת היישום | `applicationMethod` | חובה 🔎 | `application_method` | שיטת היישום |

### 🔎 השדה היחיד שמותר לדלג עליו בתכשיר מוכן לשימוש

המפרט קובע: "בתכשיר מוכן לשימוש ניתן לדלג רק על השדה שההוראה הרשמית מתירה
לדלג עליו." **הוא אינו מציין איזה שדה זה, והנוסח הרשמי לא היה נגיש.**

**מה יושם, ומדוע:** בתכשיר מוכן לשימוש אין דילול, ולכן ריכוז החומר הפעיל
בתכשיר המוכן לשימוש **זהה** לריכוז בתכשיר. לכן:

- כאשר `readyToUse = true`, ניתן להשאיר את
  `readyToUseConcentrationPercent` ריק.
- הערך **נגזר אוטומטית** מ-`activeIngredientConcentrationPercent`
  (`pesticideApplicationSchema.transform`).
- הוא מסומן `readyToUseConcentrationDerived = true`, ואילוץ במסד
  (`applications_derived_only_rtu`) מונע סימון כזה בתכשיר שאינו מוכן לשימוש.
- ב-PDF הערך מוצג **עם הערה מפורשת**: "תכשיר מוכן לשימוש — זהה לריכוז בתכשיר".
- **כל שדה אחר נשאר חובה**, גם בתכשיר מוכן לשימוש.

כך אין שדה חסר ב-PDF, ואין הנחה שקופה. **אם הנוסח הרשמי מתיר לדלג על שדה
אחר** — יש לשנות את `superRefine`/`transform` ב-`src/schema/sections.ts`
ולעדכן את `tests/unit/schema.test.ts` → "תכשיר מוכן לשימוש".

🔎 שיטות היישום הן הצעות (`APPLICATION_METHOD_SUGGESTIONS`), לא רשימה סגורה.

### תכשיר שאינו בתוקף
`productSnapshot.registrationStatus` של `revoked`/`expired` **חוסם השלמה**.
אזהרה על אימות מיושן (מעל 180 יום) מוצגת אך אינה חוסמת.
תמונת המצב של התכשיר נשמרת ביומן, כדי שעדכון עתידי במאגר לא ישנה יומן שהושלם.

## סעיף 13 — אזהרות ומידע במהלך ההדברה ובסיומה

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| מידע במהלך ההדברה | `postWarnings.duringTreatmentInfo` | חובה | `content/snapshot` | במהלך ההדברה |
| מידע בסיום ההדברה | `postWarnings.afterTreatmentInfo` | חובה | `content/snapshot` | בסיום ההדברה |
| צורך בטיפול משלים | `postWarnings.followUpRequired` | בוליאני חובה | `content/snapshot` | נדרש טיפול משלים |
| תיאור הטיפול המשלים | `postWarnings.followUpDescription` | חובה אם נדרש טיפול משלים | `content/snapshot` | תיאור הטיפול המשלים |
| אישור המדביר | `postWarnings.acknowledgedByExterminator` | `z.literal(true)` | `content/snapshot` | אושר ע״י המדביר |

## סעיף 14 — אישור מסירת היומן

| דרישה | שדה | ולידציה | מסד | PDF |
| --- | --- | --- | --- | --- |
| היומן נמסר/הושאר אצל המזמין | `handover.delivered` | `z.literal(true)` | `content/snapshot` | "מסירת היומן למזמין ההדברה" |
| שם האדם שקיבל | `handover.recipientName` | חובה | `content/snapshot`, `signatures.signer_name` | שם האדם שקיבל את היומן |
| דרך המסירה | `handover.method` | enum; "אחר" מחייב פירוט | `content/snapshot` | דרך המסירה |
| מועד המסירה | `handover.deliveredAt` | חותמת זמן חובה | `content/snapshot` | מועד המסירה |

מסירה נוספת לאחר ההשלמה נרשמת כ-`audit_events` עם `action='pest_log.delivered'`
(מועד ודרך בלבד — שם המקבל כבר מתועד ביומן, ואין כותבים מידע אישי ללוגים).

## סעיף 15 — חתימות

| דרישה | שדה | ולידציה | מסד (`signatures`) | PDF |
| --- | --- | --- | --- | --- |
| חתימת המדביר | `signatures.exterminator` | תמונה + אישור מפורש + שם + מועד | `signer_role='exterminator'` | מקטע חתימות |
| חתימת המדביר המסייע | `assistants[].signature` | חובה אם יש מדביר מסייע | `signer_role='assistant'` + `assistant_id` | מקטע חתימות |
| חתימת מקבל היומן | `signatures.recipient` | חובה; השם חייב להתאים ל-`handover.recipientName` | `signer_role='recipient'` | מקטע חתימות |

- החתימה נקלטת ב-`canvas` מותאם מגע (Pointer Events).
- `confirmed: z.literal(true)` — ציור בלבד אינו מספיק; נדרשת לחיצה על
  "אישור החתימה".
- תמונות החתימה נשמרות ב-Storage **פרטי**, בשמות קבצים אקראיים.
- פונקציית ההשלמה במסד דוחה יומן שחתימתו לא הועלתה לאחסון.

## סעיף 16 — הודעת המרכז הארצי להרעלות

> במקרה של חשד להרעלה ניתן לפנות למרכז הארצי להרעלות: 04-7771900

- קבוע יחיד: `POISON_CENTER_NOTICE` ב-`src/schema/enums.ts`.
- **בכל מסך באפליקציה:** `<PoisonNotice />`, בהדגשה אדומה, עם קישור להתקשרות.
- **בכל עמוד ב-PDF:** בראש העמוד הראשון ובכותרת התחתונה החוזרת של כל עמוד.
- נבדק ב-`tests/pdf/pdf.test.ts` → "הודעת המרכז להרעלות מופיעה בכל עמוד".
- ניתן לעדכן פר-ארגון ב-`organizations.poison_center_phone`.

## סעיף 17 — שמירת היומן שלוש שנים לפחות

| כלל | מימוש |
| --- | --- |
| שמירה ≥ 3 שנים | `organizations.retention_years` (CHECK ≥ 3) |
| אין מחיקה פיזית | טריגר `app.forbid_pest_log_delete` — חוסם `DELETE` תמיד |
| אין מדיניות DELETE ללקוח | `supabase/migrations/0006_rls.sql` |
| מחיקה רק אחרי התקופה | `soft_delete_pest_log` בודק `completed_at < now() - retention_years` |
| מחיקה בהרשאת מנהל | הפונקציה דורשת `role in ('owner','manager')` |
| soft delete | `deleted_at`/`deleted_by`; ה-snapshot נשאר |
| audit trail | `audit_events` עם `action='pest_log.soft_deleted'` |

נבדק ב-`tests/integration/completion.test.ts` → "תקופת שמירה ומחיקה רכה".

---

## נעילה, מספור ותיקון

| כלל | מימוש | נבדק |
| --- | --- | --- |
| מספר סידורי עוקב ובלתי חוזר ברמת העסק | `app.allocate_serial` עם נעילת שורת הארגון + `unique(organization_id, serial_number)` | כולל 4 השלמות מקבילות |
| ההשלמה אטומית | `complete_pest_log` — ולידציה, מספור, snapshot, hash, audit, בעסקה אחת | ✓ |
| הלקוח אינו יכול להשלים לבד | `revoke ... from authenticated`; רק `service_role` | ✓ |
| יומן שהושלם אינו ניתן לשינוי | טריגר `app.guard_pest_log_immutability` + `guard_child_of_completed_log` + RLS | ✓ |
| תיקון בגרסה מקושרת | `open_pest_log_correction` — `corrects_log_id`, `correction_reason`, `document_version + 1` | ✓ |
| המקור נשמר | היומן המקורי אינו נוגע; החתימות אינן מועתקות לגרסת התיקון | ✓ |
| אידמפוטנטיות | `completion_idempotency_key` ייחודי; קריאה חוזרת מחזירה אותה תוצאה | ✓ |
| זמן שרת | `completed_at := now()` ב-Postgres | ✓ |
| hash של המסמך | `app.document_hash` על JSON קנוני — אינו תלוי בסדר המפתחות | ✓ |

## רשימת השדות החסרים בעברית

- כל הודעות Zod בעברית, כולל ברירות מחדל (`src/schema/hebrewErrorMap.ts`).
- כל נתיב שדה ממופה לתווית עברית, לשלב בטופס ולסעיף הדרישה
  (`src/schema/fieldRegistry.ts`).
- לחיצה על שגיאה עוברת לשלב הנכון וממקדת את השדה (`focusField`).
- נבדק ב-`tests/unit/schema.test.ts` וב-`tests/e2e/wizard.spec.ts`.

## מה עדיין דורש אימות מול הנוסח הרשמי (סיכום 🔎)

| # | פריט | מה יושם | מה לבדוק |
| --- | --- | --- | --- |
| 1 | נספח א׳ — רשימת המזיקים | טבלה + import מבוקר; לא הוטבעה רשימה | לטעון את נספח א׳ ולקבוע אם השדה חייב להיות רשימה סגורה |
| 2 | השדה שמותר לדלג עליו בתכשיר מוכן לשימוש | ריכוז במוכן לשימוש, נגזר ומסומן | לאמת שזה אכן השדה שההוראה מתירה |
| 3 | פורמט מספר רישיון | קיום + תווים חוקיים | אם יש פורמט מחייב — להוסיף |
| 4 | סיווג סוגי רישיון | טקסט חופשי עם הצעות | אם יש רשימה סגורה — להמיר ל-enum |
| 5 | סוגי מבנה / סוגי אתר / שיטות יישום | הצעות, טקסט חופשי | אם יש רשימות סגורות — להמיר |
| 6 | "שאר הפרטים הנדרשים" בערפול | שכונה, עיר, רשות, תיאור, נ״צ | להשוות לנוסח |
| 7 | פורמט נ״צ מחייב | WGS84 + ITM, תחום ישראל | לאמת איזו שיטה נדרשת |
| 8 | מבנה/כותרות ה-PDF | סעיפים 1–16 לפי סדר המפרט | לבדוק אם יש טופס מחייב |
