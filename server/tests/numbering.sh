set -u
# מספר יומן ומספר לקוח ייחודיים בתוך עסק. השרת הוא הגורם הקובע.
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi }
nchk() { if echo "$3" | grep -q "$2"; then echo "FAIL · $1"; echo "    לא ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1));
  else echo "PASS · $1"; pass=$((pass+1)); fi }
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }

echo "─── הכנה: שני עסקים מאושרים ───"
j POST /api/auth/register '' '{"businessName":"הדברות המספור","contactName":"גיל","email":"gil@num.example","password":"Secret12345"}' > /dev/null
j POST /api/auth/register '' '{"businessName":"הדברות שנייה","contactName":"רן","email":"ran@num.example","password":"Secret12345"}' > /dev/null
TA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}' | tok)
for NAME in המספור שנייה; do
  OID=$(j GET /api/admin/organizations "$TA" | python3 -c "import sys,json;o=[x for x in json.load(sys.stdin)['organizations'] if '$NAME' in x['name']];print(o[0]['id'])")
  j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null
done
T=$(j POST /api/auth/login '' '{"email":"gil@num.example","password":"Secret12345"}' | tok)
T2=$(j POST /api/auth/login '' '{"email":"ran@num.example","password":"Secret12345"}' | tok)

echo "─── מספר יומן ייחודי בעסק ───"
chk "יומן ראשון נקלט כפי שהוא" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"nm-a","payload":{"journalNumber":1,"startedAt":"2026-03-01","status":"draft"}}')"
R2=$(j POST /api/sync "$T" '{"entity":"journals","entityId":"nm-b","payload":{"journalNumber":1,"startedAt":"2026-03-01","status":"draft"}}')
chk "יומן שני באותו מספר מקבל מספר חדש" '"assigned":{"journalNumber":2}' "$R2"
chk "אותו יומן נשלח שוב ואינו ממוספר מחדש" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"nm-a","payload":{"journalNumber":1,"startedAt":"2026-03-01","status":"draft"}}')"
nchk "שליחה חוזרת של אותו יומן אינה מקצה מספר" '"assigned"' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"nm-a","payload":{"journalNumber":1,"startedAt":"2026-03-01","status":"draft"}}')"

echo "─── יומן שהושלם אינו ממוספר מחדש ───"
RD=$(j POST /api/sync "$T" '{"entity":"journals","entityId":"nm-done","payload":{"journalNumber":1,"startedAt":"2026-03-02","status":"completed","customerId":"c1","licenseNumber":"5","customerAcknowledged":true}}')
chk "היומן שהושלם נקלט ולא נדחה" '"ok":true' "$RD"
nchk "והמספר שלו לא שונה" '"assigned"' "$RD"
chk "מוחזרת הערה על ההתנגשות" 'קיים כבר בעסק' "$RD"

echo "─── עסק אחר אינו מושפע ───"
R3=$(j POST /api/sync "$T2" '{"entity":"journals","entityId":"nm-other","payload":{"journalNumber":1,"startedAt":"2026-03-01","status":"draft"}}')
chk "אותו מספר בעסק אחר נשאר 1" '"ok":true' "$R3"
nchk "ואין הקצאה מחדש בין עסקים" '"assigned"' "$R3"

echo "─── מספר לקוח ───"
chk "לקוח ראשון נקלט" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"customers","entityId":"nc-a","payload":{"customerNumber":"1001","name":"לקוח א","address":"רחוב 1"}}')"
RC=$(j POST /api/sync "$T" '{"entity":"customers","entityId":"nc-b","payload":{"customerNumber":"1001","name":"לקוח ב","address":"רחוב 2"}}')
chk "לקוח שני באותו מספר מקבל מספר חדש" '"assigned":{"customerNumber":"1002"}' "$RC"
chk "שני הלקוחות נשמרו ואף אחד לא נמחק" 'לקוח ב' "$(j GET /api/entities/customers "$T")"
chk "הלקוח הראשון עדיין קיים" 'לקוח א' "$(j GET /api/entities/customers "$T")"

echo "─── הביקורת מתעדת מספור מחדש ───"
if [ -n "${DATA_DIR:-}" ]; then
  AUD=$(node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1] + "/pest-journal.db");
    const renum = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE field = ?").get("renumbered");
    const conflict = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = ?").get("number_conflict");
    console.log(JSON.stringify({ renumbered: renum.n, conflicts: conflict.n }));
  ' "$DATA_DIR")
  chk "מספור מחדש נרשם בביקורת" '"renumbered":[1-9]' "$AUD"
  chk "התנגשות שלא תוקנה נרשמה בביקורת" '"conflicts":[1-9]' "$AUD"
fi

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
