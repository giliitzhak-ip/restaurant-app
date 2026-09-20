# ארכיטקטורת הרשת — STANGA 0.3.0

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
                    │   MatchSession               │
                    │    slot(home-1) ← RemoteInput│
                    │    slot(away-1) ← RemoteInput│
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
| `server/MatchConfig.ts`                  | כל מה שתלוי־מצב: מושבים, תזמונים, מגבלות   |
| `server/HeadlessMatch.ts`                | סצנה, פיזיקה ומנוע בלי רינדור              |
| `server/InviteRegistry.ts`               | קוד ↔ חדר, ב־Presence                      |

## מכונת המצבים של החדר

```
waiting ──שני שחקנים──► lobby ──שניהם מוכנים──► countdown ──►  playing
   ▲                      ▲                                      │
   │                      │                                 ניתוק│
   └───────מושב התפנה─────┘                                      ▼
                          ▲                                   paused
                          │                                      │
                     הצבעת רימאץ׳                           חזרה│
                          │                                      ▼
                       finished ◄────סיום משחק / נטישה──── playing
```

- החדר **נעול** ב־`countdown` וב־`playing`, כך שאין הצטרפות באמצע משחק.
- הוא נפתח מחדש רק כשיש מושב פנוי באמת — נעילת ה־maxClients של Colyseus
  נשארת בתוקף.
- ב־`paused` הסימולציה **אינה מתקדמת**. אין יתרון למי שנשאר מחובר.

## התאמה לשלב ד׳ (2 נגד 2)

`MatchConfig` כבר נושא `mode`, `maxPlayers`, `playersPerTeam` ורשימת מושבים,
ו־`BaseOnlineMatchRoom` אינו יודע דבר על "שניים". חדר 2×2 צריך קונפיגורציה עם
ארבעה מושבים ותת־מחלקה — לא מערכת שנייה.

## מה שאין כאן, במפורש

- אין rollback. ראו `physics-networking.md`.
- אין בוטים שמחליפים מנותק. זה שלב ד׳.
- אין Party, אין צ׳אט, אין סטטיסטיקות.
- אין state גלובלי בתהליך: מצב משחק חי בחדר, קודי הזמנה ב־Presence.
