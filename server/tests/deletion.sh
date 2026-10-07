set -u
# מחיקה בסנכרון: מצבה בשרת, ללא מחיקת ראיה, וללא מחיקת יומן שהושלם.
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { # chk "name" "expected substring" "actual"
  if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi
}
nchk() { # nchk "name" "forbidden substring" "actual"
  if echo "$3" | grep -q "$2"; then echo "FAIL · $1"; echo "    לא ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1));
  else echo "PASS · $1"; pass=$((pass+1)); fi
}
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }

echo "─── הכנה: עסק מאושר ───"
j POST /api/auth/register '' '{"businessName":"הדברות המרכז","contactName":"אורי","email":"uri@center.example","password":"Secret12345"}' > /dev/null
TA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}' | tok)
OID=$(j GET /api/admin/organizations "$TA" | python3 -c 'import sys,json;o=[x for x in json.load(sys.stdin)["organizations"] if "המרכז" in x["name"]];print(o[0]["id"])')
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null
T=$(j POST /api/auth/login '' '{"email":"uri@center.example","password":"Secret12345"}' | tok)
chk "העסק מאושר ויכול לכתוב" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"customers","entityId":"ctr-c1","payload":{"name":"לקוח המרכז","address":"רחוב 5"}}')"

echo "─── מחיקת חתימה מגיעה לשרת ───"
chk "חתימה נשמרת" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"signatures","entityId":"sgn-1","payload":{"journalId":"jr-1","role":"customer","image":"data:image/png;base64,AAA","signedAt":"2026-01-01T10:00:00.000Z"}}')"
chk "החתימה מופיעה בקריאה מהשרת" 'sgn-1' "$(j GET /api/entities/signatures "$T")"
chk "מחיקה מאושרת" '"deleted":true' "$(j POST /api/sync "$T" '{"entity":"signatures","entityId":"sgn-1","deleted":true}')"
nchk "החתימה אינה חוזרת בקריאה מהשרת" 'sgn-1' "$(j GET /api/entities/signatures "$T")"
chk "מחיקה חוזרת אינה שגיאה" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"signatures","entityId":"sgn-1","deleted":true}')"
chk "מחיקת רשומה שאינה קיימת אינה תוקעת את התור" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"signatures","entityId":"sgn-never","deleted":true}')"
chk "חתימה חדשה באותו מזהה מחזירה את הרשומה" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"signatures","entityId":"sgn-1","payload":{"journalId":"jr-1","role":"customer","image":"data:image/png;base64,BBB","signedAt":"2026-01-02T10:00:00.000Z"}}')"
chk "הרשומה שחזרה נקראת מהשרת" 'sgn-1' "$(j GET /api/entities/signatures "$T")"

echo "─── יומן שהושלם אינו נמחק ───"
chk "טיוטת יומן נשמרת" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"jr-draft","payload":{"journalNumber":101,"startedAt":"2026-01-01","status":"draft"}}')"
chk "טיוטה נמחקת" '"deleted":true' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"jr-draft","deleted":true}')"
chk "יומן שהושלם נשמר" '"ok":true' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"jr-done","payload":{"journalNumber":102,"startedAt":"2026-01-01","status":"completed","customerId":"ctr-c1","licenseNumber":"555","customerAcknowledged":true}}')"
chk "מחיקת יומן שהושלם נדחית" 'אינו נמחק' "$(j POST /api/sync "$T" '{"entity":"journals","entityId":"jr-done","deleted":true}')"
chk "היומן שהושלם נשאר בשרת" 'jr-done' "$(j GET /api/entities/journals "$T")"

echo "─── מחיקה חוצה-עסקים ───"
T2=$(j POST /api/auth/login '' '{"email":"ronit@south.example","password":"Secret12345"}' | tok)
chk "עסק אחר אינו מוחק את הרשומה שלי" 'שייכת לעסק אחר' "$(j POST /api/sync "$T2" '{"entity":"signatures","entityId":"sgn-1","deleted":true}')"
chk "הרשומה שרדה את הניסיון" 'sgn-1' "$(j GET /api/entities/signatures "$T")"

echo "─── המחיקה מתועדת והראיה נשמרת ───"
if [ -n "${DATA_DIR:-}" ]; then
  AUDIT=$(node -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(process.argv[1] + "/pest-journal.db");
    const a = db.prepare("SELECT action, before FROM audit_log WHERE entity=? AND entity_id=? AND action=?").get("signatures", "sgn-1", "delete");
    const d = db.prepare("SELECT deleted_at, payload FROM sync_documents WHERE entity=? AND entity_id=?").get("signatures", "sgn-1");
    console.log(JSON.stringify({ audited: Boolean(a), beforeKept: Boolean(a && a.before && a.before.includes("AAA")), revived: Boolean(d && d.deleted_at === null) }));
  ' "$DATA_DIR")
  chk "המחיקה נרשמה ביומן הביקורת" '"audited":true' "$AUDIT"
  chk "תוכן החתימה שנמחקה נשמר לביקורת" '"beforeKept":true' "$AUDIT"
  chk "כתיבה חדשה מבטלת את המצבה" '"revived":true' "$AUDIT"
else
  echo "דילוג על בדיקת יומן הביקורת: DATA_DIR לא הוגדר"
fi

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
