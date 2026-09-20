# בדיקת בסיס לשלב ד׳ — מה באמת קיים לפני 0.4.0

נבדק על הגרסה שבענף: `0.3.0`, `protocolVersion` 1.

## מה הורץ בפועל

| בדיקה                                      | תוצאה                                    |
| ------------------------------------------ | ---------------------------------------- |
| `rm -rf node_modules && npm ci` (lockfile) | ✅ 11 שניות, ללא שגיאות                  |
| `npm run lint`                             | ✅ ESLint + Prettier נקיים               |
| `npx vitest run`                           | ✅ 17 קבצים, **245 בדיקות**              |
| `npm run build`                            | ✅ tsc + vite, 1.4 שניות                 |
| `npm run e2e:offline` (דפדפן אמיתי)        | ✅ נגד המחשב + מקומי לשניים, 0 שגיאות    |
| `npm run e2e` (שני דפדפנים)                | ✅ חדר פרטי, קוד, קישור, משחק מסונכרן    |
| `npm run e2e:load` (8 משחקים)              | ✅ 60 טיקים/ש׳, 20 patches/ש׳, RTT 1 מ״ש |

`playwright` אינו תלות של הפרויקט; הותקן ad-hoc עם `--no-save` לבדיקות הדפדפן.

## מה קיים בקוד — לפי קריאה, לא לפי האפיון

השמות באפיון של שלב ד׳ אינם זהים לשמות בקוד. זו המפה האמיתית:

| האפיון קורא לזה                | בקוד קיים                                       |
| ------------------------------ | ----------------------------------------------- |
| `OnlineOneVsOneRoom`           | ✅ `src/server/OnlineOneVsOneRoom.ts`           |
| `BaseOnlineMatchRoom`          | ✅ `src/server/BaseOnlineMatchRoom.ts`          |
| `AuthoritativeMatchSimulation` | קיים בפועל כ־`src/server/HeadlessMatch.ts`      |
| `TeamManager`                  | ❌ אין. מושבים הם מערך `seats` ב־`MatchConfig`  |
| `LobbyManager`                 | ❌ אין. מכונת המצבים חיה בתוך החדר              |
| `ReconnectionManager`          | ❌ אין. `allowReconnection` של Colyseus ישירות  |
| `BotSubstitutionManager`       | ❌ אין בכלל                                     |
| `MatchRules`                   | ✅ `src/game/MatchRules.ts`                     |
| `MatchConfig`                  | ✅ `src/server/MatchConfig.ts`                  |
| `NetworkController`            | ✅ `src/input/controllers/NetworkController.ts` |
| schemas                        | ✅ `src/net/schema.ts`                          |
| matchmaking                    | ✅ Colyseus `joinOrCreate` + `/invite/:code`    |

## מה ש־0.3.0 כבר עושה נכון לשלב ד׳

- `MatchConfig` כבר נושא `mode`, `maxPlayers`, `playersPerTeam` ורשימת מושבים,
  ו־`BaseOnlineMatchRoom` אינו יודע דבר על "שניים" חוץ מהקונפיגורציה.
- `MapSchema<NetPlayer>` ממופתח לפי `playerId`, לא לפי חיבור ולא לפי אינדקס —
  אין שום `player1`/`player2`.
- הסימולציה רצה ב־Node (`HeadlessMatch`), ואותו `MatchEngine` בדיוק רץ בלקוח.
- `PlayerCommand` הוא החוזה היחיד שמזיז שחקן, כולל ל־AI.
- אין state גלובלי בתהליך; קודי הזמנה חיים ב־Presence.

## מה שחסר לחלוטין ויידרש בשלב ד׳

- קבוצות אמיתיות (`TeamManager`), שני מקומות בכל קבוצה, מעבר קבוצה בלובי.
- מסירה. `PlayerCommand` **אינו** כולל `passPressed` כלל.
- בוט מחליף לשחקן מנותק. היום המשחק פשוט נעצר.
- Party, matchmaking לזוגות, כניעה, Quick Chat, סטטיסטיקות.
- חוק הנגיעה האחת. היום אין שום מגבלת נגיעות — `TouchRuleEngine` לא קיים.
- מערכת בעיטות רציפה. היום יש `lofted: boolean` בלבד (`lobToggle`),
  ו־`GameConfig.kick` מחזיק `loftRatio` יחיד.
- נכסי גרפיקה. כל הדמויות והמרקמים נוצרים פרוצדורלית בזמן ריצה
  (`ProceduralTextures`, `PlayerView` בונה קופסאות וכדורים).

## מגבלות סביבה שמשפיעות על מה שניתן להוכיח

- **אין GPU.** הדפדפן רץ על SwiftShader ב־4–6 FPS. אפשר לבדוק נכונות, סנכרון
  ושגיאות — **אי אפשר** למדוד 60 FPS אמיתיים.
- **אין Docker daemon.** ה־image נבנה לוגית ולא נבנה בפועל, כבר מ־0.3.0.
- **אין גישה לספריות נכסים.** אין מאיפה להוריד דמויות rigged ברישיון.
- 4 ליבות CPU לשרת, ללקוחות ולמחולל העומס יחד.

## מסקנה

הבסיס ירוק לחלוטין. לא נדרש שום תיקון לפני תחילת שלב ד׳.
