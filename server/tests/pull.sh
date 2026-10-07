set -u
# משיכה מהשרת למכשיר: שינויים, מחיקות, בידוד בין עסקים ואי-כפילות פעולות.
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi }
nchk() { if echo "$3" | grep -q "$2"; then echo "FAIL · $1"; echo "    לא ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1));
  else echo "PASS · $1"; pass=$((pass+1)); fi }
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }
cursor() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("cursor",""))'; }

echo "─── הכנה ───"
j POST /api/auth/register '' '{"businessName":"הדברות המשיכה","contactName":"נועה","email":"noa@pull.example","password":"Secret12345"}' > /dev/null
TA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}' | tok)
OID=$(j GET /api/admin/organizations "$TA" | python3 -c 'import sys,json;o=[x for x in json.load(sys.stdin)["organizations"] if "המשיכה" in x["name"]];print(o[0]["id"])')
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null
T=$(j POST /api/auth/login '' '{"email":"noa@pull.example","password":"Secret12345"}' | tok)

echo "─── שינוי שנכתב נמשך בחזרה ───"
START=$(j GET "/api/sync/pull?since=" "$T" | cursor)
j POST /api/sync "$T" '{"entity":"customers","entityId":"pl-c1","payload":{"name":"לקוח משיכה","address":"רחוב 1"}}' > /dev/null
P1=$(j GET "/api/sync/pull?since=$START" "$T")
chk "המשיכה מחזירה את הלקוח שנכתב" 'לקוח משיכה' "$P1"
C1=$(echo "$P1" | cursor)
chk "המשיכה מחזירה סמן" '"cursor"' "$P1"
P2=$(j GET "/api/sync/pull?since=$C1" "$T")
nchk "משיכה מהסמן אינה מחזירה שוב את אותו שינוי" 'לקוח משיכה' "$P2"

echo "─── מחיקה מגיעה למכשירים האחרים ───"
j POST /api/sync "$T" '{"entity":"signatures","entityId":"pl-s1","payload":{"journalId":"pl-j1","role":"customer","signedAt":"2026-01-01T00:00:00.000Z"}}' > /dev/null
C2=$(j GET "/api/sync/pull?since=$C1" "$T" | cursor)
j POST /api/sync "$T" '{"entity":"signatures","entityId":"pl-s1","deleted":true}' > /dev/null
P3=$(j GET "/api/sync/pull?since=$C2" "$T")
chk "המחיקה מופיעה ברשימת deleted" '"deleted":{"signatures":\["pl-s1"\]}' "$P3"
nchk "הרשומה שנמחקה אינה מופיעה ברשימת items" '"items":{"signatures"' "$P3"

echo "─── בידוד בין עסקים ───"
T2=$(j POST /api/auth/login '' '{"email":"ronit@south.example","password":"Secret12345"}' | tok)
nchk "עסק אחר אינו מושך את הנתונים שלי" 'לקוח משיכה' "$(j GET "/api/sync/pull?since=" "$T2")"
chk "משיכה ללא התחברות נדחית" 'נדרשת התחברות' "$(j GET "/api/sync/pull?since=")"

echo "─── דף חלקי ───"
j POST /api/sync "$T" '{"entity":"tasks","entityId":"pl-t1","payload":{"title":"א","dueDate":"2026-01-01"}}' > /dev/null
j POST /api/sync "$T" '{"entity":"tasks","entityId":"pl-t2","payload":{"title":"ב","dueDate":"2026-01-02"}}' > /dev/null
PP=$(j GET "/api/sync/pull?since=&limit=1" "$T")
chk "דף חלקי מסומן" '"truncated":true' "$PP"
chk "דף חלקי מחזיר סמן להמשך" '"cursor":"2' "$PP"

echo "─── אותה פעולה פעמיים אינה נכתבת פעמיים ───"
OP="op_test_$$"
R1=$(j POST /api/sync "$T" "{\"entity\":\"customers\",\"entityId\":\"pl-c2\",\"opId\":\"$OP\",\"payload\":{\"name\":\"ראשון\",\"address\":\"רחוב 2\"}}")
R2=$(j POST /api/sync "$T" "{\"entity\":\"customers\",\"entityId\":\"pl-c2\",\"opId\":\"$OP\",\"payload\":{\"name\":\"ראשון\",\"address\":\"רחוב 2\"}}")
chk "השליחה הראשונה נקלטה" '"ok":true' "$R1"
chk "השליחה החוזרת מסומנת ככפולה" '"duplicate":true' "$R2"
if [ -n "${DATA_DIR:-}" ]; then
  AUD=$(node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1] + "/pest-journal.db");
    const r = db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE entity=? AND entity_id=?").get("customers", "pl-c2");
    console.log(JSON.stringify({ n: r.n }));
  ' "$DATA_DIR")
  chk "נרשמה רשומת ביקורת אחת בלבד" '"n":1' "$AUD"
fi

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
