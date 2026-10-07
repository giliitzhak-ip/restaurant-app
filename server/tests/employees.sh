set -u
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi }
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }

TA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
ORGS=$(j GET /api/admin/organizations "$TA")
OID=$(echo "$ORGS" | python3 -c 'import sys,json;o=[x for x in json.load(sys.stdin)["organizations"] if "הדרום" in x["name"]];print(o[0]["id"])')
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null

OWN=$(j POST /api/auth/login '' '{"email":"ronit@south.example","password":"Secret12345"}')
TO=$(echo "$OWN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
chk "בעל העסק מתחבר" '"role":"owner"' "$OWN"

echo "─── הוספת עובדים ───"
# אין נתיב ליצירת עובד עם סיסמה: ההצטרפות היא דרך הזמנה בלבד,
# והעובד קובע את הסיסמה שלו בעצמו.
E1=$(j POST /api/auth/users/invite "$TO" '{"name":"עובד שטח","email":"worker@south.example","role":"field"}')
chk "בעל העסק מזמין עובד" '"role":"field"' "$E1"
chk "ההזמנה אינה מחזירה סיסמה" '"path":"#/invite/' "$E1"
chk "לא ניתן ליצור בעלים נוסף" 'תפקיד לא חוקי' "$(j POST /api/auth/users/invite "$TO" '{"name":"x","email":"x2@south.example","role":"owner"}')"
chk "רשימת העובדים כוללת את שניהם" 'worker@south.example' "$(j GET /api/auth/users "$TO")"
ITOK=$(echo "$E1" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
chk "העובד קובע סיסמה" '"ok":true' "$(j POST "/api/auth/invite/$ITOK" '' '{"password":"Worker12345"}')"

echo "─── העובד מוגבל ───"
WK=$(j POST /api/auth/login '' '{"email":"worker@south.example","password":"Worker12345"}')
TW=$(echo "$WK" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
chk "העובד מתחבר לעסק שלו" '"role":"field"' "$WK"
chk "העובד אינו יכול להזמין עובדים" 'רק בעל העסק' "$(j POST /api/auth/users/invite "$TW" '{"name":"y","email":"y@south.example","role":"field"}')"
chk "העובד אינו מגיע לקונסולת הניהול" 'נדרשת הרשאת מנהל מערכת' "$(j GET /api/admin/organizations "$TW")"
chk "העובד כן יכול לתעד" '"ok":true' "$(j POST /api/sync "$TW" '{"entity":"customers","entityId":"s1","payload":{"name":"לקוח דרום","address":"רחוב 5"}}')"

echo "─── השבתת עובד ───"
WID=$(j GET /api/auth/users "$TO" | python3 -c 'import sys,json;u=[x for x in json.load(sys.stdin)["users"] if x["role"]=="field"];print(u[0]["id"])')
chk "בעל העסק משבית עובד" '"ok":true' "$(j PATCH "/api/auth/users/$WID" "$TO" '{"status":"disabled"}')"
chk "העובד המושבת מנותק מיד" 'נדרשת התחברות' "$(j GET /api/entities/customers "$TW")"
chk "העובד המושבת אינו יכול להתחבר" 'שגויים' "$(j POST /api/auth/login '' '{"email":"worker@south.example","password":"Worker12345"}')"
chk "בעלים אינו יכול לשנות את עצמו" 'של עצמך' "$(j PATCH "/api/auth/users/$(echo "$OWN" | python3 -c 'import sys,json;print(json.load(sys.stdin)["user"]["id"])')" "$TO" '{"status":"disabled"}')"

echo "─── עסק אחר לא נוגע בעובדים שלי ───"
TD=$(j POST /api/auth/login '' '{"email":"david@north.example","password":"Secret12345"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
chk "בעלים של עסק אחר אינו מעדכן את העובד שלי" 'לא נמצא' "$(j PATCH "/api/auth/users/$WID" "$TD" '{"status":"active"}')"

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
