set -u
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { # chk "name" "expected substring" "actual"
  if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi
}
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }

echo "─── גישה ללא התחברות ───"
chk "סנכרון ללא התחברות נדחה" '"errors":\["נדרשת התחברות' "$(j POST /api/sync '' '{"entity":"customers","entityId":"x","payload":{"name":"a","address":"b"}}')"
chk "קריאת נתונים ללא התחברות נדחית" 'נדרשת התחברות' "$(j GET /api/entities/customers)"
chk "קונסולת ניהול ללא התחברות נדחית" 'נדרשת התחברות' "$(j GET /api/admin/organizations)"

echo "─── הרשמת עסק ───"
R1=$(j POST /api/auth/register '' '{"businessName":"הדברות הצפון","contactName":"דוד כהן","email":"david@north.example","phone":"050-1111111","licenseNumber":"777","password":"Secret12345"}')
chk "עסק נרשם וממתין לאישור" '"status":"pending"' "$R1"
chk "הרשמה חוזרת עם אותו דוא\"ל נחסמת" 'לא ניתן להירשם' "$(j POST /api/auth/register '' '{"businessName":"אחר","contactName":"דוד","email":"david@north.example","password":"Secret12345"}')"
chk "סיסמה חלשה נדחית" 'לפחות 8 תווים' "$(j POST /api/auth/register '' '{"businessName":"ב","contactName":"ג","email":"weak@x.example","password":"123"}')"
chk "דוא\"ל לא תקין נדחה" 'דוא' "$(j POST /api/auth/register '' '{"businessName":"ב","contactName":"ג","email":"notanemail","password":"Secret12345"}')"

echo "─── עסק ממתין אינו יכול לעבוד ───"
L1=$(j POST /api/auth/login '' '{"email":"david@north.example","password":"Secret12345"}')
T1=$(echo "$L1" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
chk "התחברות מצליחה גם לפני אישור" '"ok":true' "$L1"
chk "המצב הוא חסום עד אישור" 'ממתינה לאישור' "$L1"
chk "כתיבת נתונים נחסמת לפני אישור" 'ממתינה לאישור' "$(j POST /api/sync "$T1" '{"entity":"customers","entityId":"c1","payload":{"name":"לקוח","address":"רחוב 1"}}')"

echo "─── מנהל המערכת מאשר ───"
LA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}')
TA=$(echo "$LA" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
chk "מנהל המערכת מתחבר" '"isSuperAdmin":true' "$LA"
ORGS=$(j GET /api/admin/organizations "$TA")
chk "העסק מופיע ברשימת האישורים" 'הדברות הצפון' "$ORGS"
chk "הרשימה אינה חושפת נתוני לקוחות" '"counts"' "$ORGS"
OID=$(echo "$ORGS" | python3 -c 'import sys,json;print(json.load(sys.stdin)["organizations"][0]["id"])')
chk "אישור עם תאריך תשלום" '"status":"approved"' "$(j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","plan":"basic","paidUntil":"2099-12-31"}')"
chk "עסק אחר אינו יכול לאשר את עצמו" 'נדרשת הרשאת מנהל מערכת' "$(j GET /api/admin/organizations "$T1")"

echo "─── אחרי אישור ───"
L1b=$(j POST /api/auth/login '' '{"email":"david@north.example","password":"Secret12345"}')
T1=$(echo "$L1b" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
chk "גישה מלאה אחרי אישור" '"level":"full"' "$L1b"
chk "כתיבת לקוח מצליחה" '"ok":true' "$(j POST /api/sync "$T1" '{"entity":"customers","entityId":"c1","payload":{"name":"לקוח של הצפון","address":"רחוב 1"}}')"
chk "העסק רואה את הלקוח שלו" 'לקוח של הצפון' "$(j GET /api/entities/customers "$T1")"

echo "─── בידוד בין עסקים ───"
j POST /api/auth/register '' '{"businessName":"הדברות הדרום","contactName":"רונית","email":"ronit@south.example","password":"Secret12345"}' > /dev/null
ORGS2=$(j GET /api/admin/organizations "$TA")
OID2=$(echo "$ORGS2" | python3 -c 'import sys,json;o=[x for x in json.load(sys.stdin)["organizations"] if "הדרום" in x["name"]];print(o[0]["id"])')
j POST "/api/admin/organizations/$OID2" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null
L2=$(j POST /api/auth/login '' '{"email":"ronit@south.example","password":"Secret12345"}')
T2=$(echo "$L2" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
OUT2=$(j GET /api/entities/customers "$T2")
chk "עסק ב' אינו רואה לקוחות של עסק א'" '"items":\[\]' "$OUT2"
chk "עסק ב' אינו יכול לדרוס רשומה של עסק א'" 'שייכת לעסק אחר' "$(j POST /api/sync "$T2" '{"entity":"customers","entityId":"c1","payload":{"name":"חטיפה","address":"רחוב 2"}}')"

echo "─── השעיה ───"
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"suspended"}' > /dev/null
chk "השעיה מנתקת מיד את המשתמשים" 'נדרשת התחברות' "$(j GET /api/entities/customers "$T1")"
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2020-01-01"}' > /dev/null
L1c=$(j POST /api/auth/login '' '{"email":"david@north.example","password":"Secret12345"}')
T1=$(echo "$L1c" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
chk "מנוי שפג מעביר לקריאה בלבד" '"level":"read_only"' "$L1c"
chk "קריאה עדיין אפשרית אחרי שפג התוקף" 'לקוח של הצפון' "$(j GET /api/entities/customers "$T1")"
chk "כתיבה חסומה אחרי שפג התוקף" 'תוקף המנוי פג' "$(j POST /api/sync "$T1" '{"entity":"customers","entityId":"c9","payload":{"name":"חדש","address":"רחוב"}}')"

echo "─── סיסמאות ───"
chk "סיסמה שגויה נדחית" 'דוא״ל או סיסמה שגויים' "$(j POST /api/auth/login '' '{"email":"david@north.example","password":"wrongpass1"}')"
for i in 1 2 3 4 5 6 7 8; do j POST /api/auth/login '' '{"email":"lock@test.example","password":"bad'"$i"'pass"}' > /dev/null; done
chk "נעילה אחרי ניסיונות כושלים" 'יותר מדי ניסיונות' "$(j POST /api/auth/login '' '{"email":"lock@test.example","password":"whatever1"}')"

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
