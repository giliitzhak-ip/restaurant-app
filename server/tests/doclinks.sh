set -u
# קישור מסמך ללקוח: רק ליומן שהושלם, עם תוקף, ניתן לביטול, ובלי גישה לשאר העסק.
B="http://localhost:${PORT:-3100}"
pass=0; fail=0
chk() { if echo "$3" | grep -q "$2"; then echo "PASS · $1"; pass=$((pass+1));
  else echo "FAIL · $1"; echo "    ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1)); fi }
nchk() { if echo "$3" | grep -q "$2"; then echo "FAIL · $1"; echo "    לא ציפיתי: $2"; echo "    קיבלתי: $3"; fail=$((fail+1));
  else echo "PASS · $1"; pass=$((pass+1)); fi }
j() { curl -s -X "$1" "$B$2" -H 'Content-Type: application/json' ${3:+-H "Authorization: Bearer $3"} ${4:+-d "$4"}; }
tok() { python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))'; }

echo "─── הכנה: עסק מאושר עם יומן שהושלם ───"
j POST /api/auth/register '' '{"businessName":"הדברות הקישור","contactName":"מיכל","email":"michal@link.example","password":"Secret12345"}' > /dev/null
TA=$(j POST /api/auth/login '' '{"email":"yizhak@example.com","password":"Admin12345"}' | tok)
OID=$(j GET /api/admin/organizations "$TA" | python3 -c 'import sys,json;o=[x for x in json.load(sys.stdin)["organizations"] if "הקישור" in x["name"]];print(o[0]["id"])')
j POST "/api/admin/organizations/$OID" "$TA" '{"status":"approved","paidUntil":"2099-12-31"}' > /dev/null
T=$(j POST /api/auth/login '' '{"email":"michal@link.example","password":"Secret12345"}' | tok)

j POST /api/sync "$T" '{"entity":"journals","entityId":"lk-draft","payload":{"journalNumber":501,"startedAt":"2026-02-01","status":"draft"}}' > /dev/null
chk "קישור לטיוטה נדחה" 'אין מסמך סופי' "$(j POST /api/doc-links "$T" '{"journalId":"lk-draft"}')"

j POST /api/sync "$T" '{"entity":"journals","entityId":"lk-done","payload":{"journalNumber":502,"startedAt":"2026-02-02","status":"completed","customerId":"lk-c1","licenseNumber":"77","customerAcknowledged":true}}' > /dev/null
j POST /api/sync "$T" '{"entity":"journal_snapshots","entityId":"lk-snp","payload":{"journalId":"lk-done","journalNumber":502,"takenAt":"2026-02-02T10:00:00.000Z","schemaVersion":1,"customer":{"id":"lk-c1","name":"לקוח הקישור"},"full":{"journal":{"id":"lk-done","journalNumber":502,"status":"completed"},"materials":[],"pests":[],"actions":[],"baitStations":[],"signatures":[],"attachments":[]},"materials":[],"materialLabels":[],"treatmentTemplates":[]}}' > /dev/null

echo "─── יצירת קישור וקריאה בלי התחברות ───"
L=$(j POST /api/doc-links "$T" '{"journalId":"lk-done","days":7}')
chk "קישור נוצר ליומן שהושלם" '"ok":true' "$L"
chk "הקישור כולל נתיב" '"path":"#/shared/' "$L"
chk "הקישור כולל תוקף" '"expiresAt"' "$L"
TOKEN=$(echo "$L" | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
DOC=$(curl -s "$B/api/doc/$TOKEN")
chk "המסמך נקרא בלי התחברות" 'לקוח הקישור' "$DOC"
chk "המסמך כולל את שם העסק" 'הדברות הקישור' "$DOC"
nchk "המסמך אינו חושף מסמכים אחרים" 'lk-draft' "$DOC"

echo "─── אסימון לא תקין ───"
chk "אסימון שגוי נדחה" 'הקישור אינו פעיל' "$(curl -s "$B/api/doc/לא-קיים")"
chk "אסימון ריק אינו מחזיר מסמך" 'הקישור אינו פעיל' "$(curl -s "$B/api/doc/")"

echo "─── צפיות וביטול ───"
curl -s "$B/api/doc/$TOKEN" > /dev/null
chk "מספר הצפיות נרשם" '"views":2' "$(j GET "/api/doc-links?journalId=lk-done" "$T")"
chk "הקישור מסומן פעיל" '"active":true' "$(j GET "/api/doc-links?journalId=lk-done" "$T")"
chk "ביטול מצליח" '"revoked":true' "$(j POST /api/doc-links/revoke "$T" '{"journalId":"lk-done"}')"
chk "אחרי ביטול הקישור אינו נפתח" 'הקישור אינו פעיל' "$(curl -s "$B/api/doc/$TOKEN")"
chk "הקישור מסומן לא פעיל" '"active":false' "$(j GET "/api/doc-links?journalId=lk-done" "$T")"

echo "─── עסק אחר ───"
T2=$(j POST /api/auth/login '' '{"email":"ronit@south.example","password":"Secret12345"}' | tok)
chk "עסק אחר אינו יוצר קישור ליומן שלי" 'אין מסמך סופי' "$(j POST /api/doc-links "$T2" '{"journalId":"lk-done"}')"
chk "עסק אחר אינו רואה את הקישורים שלי" '"links":\[\]' "$(j GET "/api/doc-links?journalId=lk-done" "$T2")"
chk "יצירת קישור ללא התחברות נדחית" 'נדרשת התחברות' "$(j POST /api/doc-links '' '{"journalId":"lk-done"}')"

echo
echo "═══ $pass עברו, $fail נכשלו ═══"
[ "$fail" -eq 0 ]
