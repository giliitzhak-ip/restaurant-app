set -u
# הזמנת עובד ואיפוס סיסמה בלי סיסמה בטקסט גלוי.
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi }
nchk() { if echo "$3" | grep -q "$2"; then echo "FAIL · $1"; echo "    לא ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1));
  else echo "PASS · $1"; pass=$((pass+1)); fi }
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }

echo "─── הכנה ───"
j POST /api/auth/register '' '{"businessName":"הדברות ההזמנות","contactName":"עמית","email":"amit@inv.example","password":"Secret12345"}' > /dev/null
TA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}' | tok)
OID=$(j GET /api/admin/organizations "$TA" | python3 -c 'import sys,json;o=[x for x in json.load(sys.stdin)["organizations"] if "ההזמנות" in x["name"]];print(o[0]["id"])')
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null
T=$(j POST /api/auth/login '' '{"email":"amit@inv.example","password":"Secret12345"}' | tok)

echo "─── הזמנת עובד ───"
EMP="worker$$@inv.example"
INV=$(j POST /api/auth/users/invite "$T" "{\"name\":\"דנה לוי\",\"email\":\"$EMP\",\"role\":\"exterminator\"}")
chk "ההזמנה נוצרה" '"ok":true' "$INV"
chk "ההזמנה מחזירה נתיב" '"path":"#/invite/' "$INV"
chk "ההזמנה מחזירה תוקף" '"expiresAt"' "$INV"
ITOK=$(echo "$INV" | tok)

chk "פרטי ההזמנה נקראים בלי התחברות" 'דנה לוי' "$(curl -s "$B/api/auth/invite/$ITOK")"
chk "פרטי ההזמנה כוללים את שם העסק" 'הדברות ההזמנות' "$(curl -s "$B/api/auth/invite/$ITOK")"
chk "העובד אינו יכול להתחבר לפני קביעת סיסמה" 'שגויים' "$(j POST /api/auth/login '' "{\"email\":\"$EMP\",\"password\":\"Secret12345\"}")"

echo "─── קביעת סיסמה על ידי העובד ───"
chk "סיסמה חלשה נדחית" 'לפחות 8 תווים' "$(j POST "/api/auth/invite/$ITOK" '' '{"password":"123"}')"
ACC=$(j POST "/api/auth/invite/$ITOK" '' '{"password":"DanaWorks123"}')
chk "קביעת הסיסמה מחברת את העובד מיד" '"ok":true' "$ACC"
chk "העובד מקבל אסימון התחברות" '"token"' "$ACC"
chk "העובד משויך לעסק" 'הדברות ההזמנות' "$ACC"
chk "אותו קישור אינו עובד פעמיים" 'הקישור אינו פעיל' "$(j POST "/api/auth/invite/$ITOK" '' '{"password":"Another12345"}')"
chk "העובד מתחבר עם הסיסמה שקבע" '"ok":true' "$(j POST /api/auth/login '' "{\"email\":\"$EMP\",\"password\":\"DanaWorks123\"}")"

echo "─── איפוס סיסמה ───"
EID=$(j GET /api/auth/users "$T" | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin)['users'] if x['email']=='$EMP'];print(u[0]['id'])")
TE=$(j POST /api/auth/login '' "{\"email\":\"$EMP\",\"password\":\"DanaWorks123\"}" | tok)
RST=$(j POST "/api/auth/users/$EID/reset-password" "$T")
chk "בעל העסק מייצר קישור לאיפוס" '"path":"#/invite/' "$RST"
nchk "התשובה אינה מכילה סיסמה" 'password' "$RST"
chk "האיפוס מנתק את העובד מיד" 'נדרשת התחברות' "$(j GET /api/auth/me "$TE")"
RTOK=$(echo "$RST" | tok)
chk "סוג הקישור הוא איפוס" '"kind":"reset"' "$(curl -s "$B/api/auth/invite/$RTOK")"
chk "העובד קובע סיסמה חדשה" '"ok":true' "$(j POST "/api/auth/invite/$RTOK" '' '{"password":"DanaNew12345"}')"
chk "הסיסמה הישנה אינה עובדת" 'שגויים' "$(j POST /api/auth/login '' "{\"email\":\"$EMP\",\"password\":\"DanaWorks123\"}")"
chk "הסיסמה החדשה עובדת" '"ok":true' "$(j POST /api/auth/login '' "{\"email\":\"$EMP\",\"password\":\"DanaNew12345\"}")"

echo "─── הרשאות ───"
chk "עובד אינו יכול להזמין עובדים" 'רק בעל העסק' "$(j POST /api/auth/users/invite "$(j POST /api/auth/login '' "{\"email\":\"$EMP\",\"password\":\"DanaNew12345\"}" | tok)" '{"name":"אחר","email":"other@inv.example","role":"field"}')"
chk "בעל העסק אינו מאפס את עצמו" 'מנהל המערכת' "$(j POST "/api/auth/users/$(j GET /api/auth/users "$T" | python3 -c "import sys,json;u=[x for x in json.load(sys.stdin)['users'] if x['role']=='owner'];print(u[0]['id'])")/reset-password" "$T")"
chk "הזמנה ללא התחברות נדחית" 'נדרשת התחברות' "$(j POST /api/auth/users/invite '' '{"name":"אחר","email":"x@inv.example","role":"field"}')"
chk "אסימון הזמנה שגוי נדחה" 'הקישור אינו פעיל' "$(curl -s "$B/api/auth/invite/לא-קיים")"

T2=$(j POST /api/auth/login '' '{"email":"ronit@south.example","password":"Secret12345"}' | tok)
chk "עסק אחר אינו מאפס את העובד שלי" 'לא נמצא' "$(j POST "/api/auth/users/$EID/reset-password" "$T2")"

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
