# ארכיטקטורת הרשת — STANGA 0.4.0

## התמונה

```
                    ┌──────────────────────────────┐
  קלט אנושי ─────►   │  MatchSession                │
                    │   slot(home-1) ← מקלדת/מגע   │
                    │   slot(away-1) ← Network     │
                    └──────────┬───────────────────┘
                               │ PlayerCommand
                    ┌──────────▼───────────────────┐
                    │  MatchEngine (mirrored)      │  הלקוח: מנבא, לא מחליט
                    └──────────┬───────────────────┘
                               │ MatchState
                          רינדור ו־HUD
                               ▲
                     snapshot  │  NetInput
                    ┌──────────┴───────────────────┐
                    │  OnlineOneVsOneRoom          │  השרת: מחליט
                    │  OnlineTwoVsTwoRoom          │
                    │   MatchSession               │
                    │    slot(home-1) ← RemoteInput│
                    │    slot(home-2) ← RemoteInput│  (2×2)
                    │    slot(away-1) ← RemoteInput│
                    │    slot(away-2) ← RemoteInput│  (2×2)
                    │   MatchEngine (authoritative)│
                    └──────────────────────────────┘
```

**זהו אותו `MatchEngine` בדיוק** — אותו קובץ, אותה פיזיקה, אותם חוקים. השרת
מריץ אותו על `NullEngine` של Babylon ללא דפדפן. אם חוק משתנה, הוא משתנה
לשניהם באותו רגע.

## מה איפשר את זה

הפרדת הגוף מהמראה:

| רץ בשרת                                           | רץ רק בלקוח            |
| ------------------------------------------------- | ---------------------- |
| `entities/BallBody`                               | `rendering/BallView`   |
| `entities/PlayerBody`                             | `rendering/PlayerView` |
| `physics/ArenaColliders`                          | `rendering/Arena`      |
| `physics/PhysicsWorld`                            | `rendering/MatchViews` |
| `game/MatchEngine`, `MatchRules`, `ScoringSystem` | מצלמות, אפקטים, קול    |

הגאומטריה של ההתנגשויות מוגדרת במקום אחד (`ArenaColliders`), והלקוח רק צובע
את אותם ה־meshes. כך אי אפשר שהשרת והלקוח יחלקו על מיקומו של קורה.

## שכבות

| שכבה                                     | תפקיד                                      |
| ---------------------------------------- | ------------------------------------------ |
| `net/protocol.ts`                        | החוזה המשותף + כל פונקציות האימות          |
| `net/schema.ts`                          | מצב החדר כפי שהוא נשלח                     |
| `net/RoomClient.ts`                      | כל מה שיודע על Colyseus בצד הלקוח          |
| `net/OnlineMatch.ts`                     | תיקוני סחיפה, שיקוף ניקוד ושעון, שליחת קלט |
| `input/controllers/NetworkController.ts` | היריב, כ־`PlayerController` רגיל           |
| `server/BaseOnlineMatchRoom.ts`          | החדר הסמכותי                               |
| `server/OnlineOneVsOneRoom.ts`           | 1×1 — קונפיגורציה בלבד                     |
| `server/OnlineTwoVsTwoRoom.ts`           | 2×2 — שלוש שורות, אותה ליבה                |
| `server/TeamManager.ts`                  | מי יושב איפה. הדבר היחיד שמחליט את זה      |
| `server/LobbyManager.ts`                 | מי מוכן ומי בעל החדר                       |
| `server/BotSubstitutionManager.ts`       | בוט למושב שהתרוקן                          |
| `game/MatchConfig.ts`                    | כל מה שתלוי־מצב: מושבים, תזמונים, מגבלות   |
| `game/MatchRoster.ts`                    | מי על המגרש ואיפה הוא מתחיל                |
| `game/Attribution.ts`                    | מי בישל                                    |
| `server/HeadlessMatch.ts`                | סצנה, פיזיקה ומנוע בלי רינדור              |
| `server/InviteRegistry.ts`               | קוד ↔ חדר, ב־Presence                      |

`MatchConfig` עבר מ־`server/` ל־`game/` בגרסה 0.4.0: גם הלקוח קורא אותו,
כי הניבוי שלו חייב לרוץ על אותם מספרים כמו השרת.

## מכונת המצבים של החדר

```
waitingForPlayers → teamSelection → readyCheck → countdown → playing
                                                                ↓
        rematchVote ← finished ←──────────────────── goalFreeze ⇄ playing
                                                                ↓
                                                        reconnectPause
```

- החדר **נעול** מ־`countdown` והלאה, כך שאין הצטרפות באמצע משחק ואין החלפת
  קבוצה אחרי שהיא נסגרה.
- הוא נפתח מחדש רק כשיש מושב פנוי באמת — נעילת ה־maxClients של Colyseus
  נשארת בתוקף.
- ב־`reconnectPause` הסימולציה **אינה מתקדמת**. אין יתרון למי שנשאר מחובר.
  ב־2×2 ההפוגה קצרה, ואחריה בוט נכנס למושב.
- `refreshStage` מתייצב במקום לבצע מעבר אחד לכל הודעה: ה"מוכן" האחרון משלים
  את ה־ready check ומתחיל את ה־countdown באותה קריאה.

## 2 נגד 2

הפירוט המלא ב־[`2v2-architecture.md`](2v2-architecture.md). בקצרה:
`OnlineTwoVsTwoRoom` הוא `BaseOnlineMatchRoom` עם `TWO_VS_TWO_CONFIG`, ואין
בקוד בדיקות `mode === '2v2'` מפוזרות.

## מה שאין כאן, במפורש

- אין rollback. ראו `physics-networking.md`.
- אין 2×2 מקומי — רק אונליין.
- אין state גלובלי בתהליך: מצב משחק חי בחדר, קודי הזמנה ב־Presence.
- אין דירוג ואין MMR. ההתאמה היא "חדר פנוי", וזה מה שנאמר בממשק.
