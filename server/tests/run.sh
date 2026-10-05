#!/usr/bin/env bash
# בדיקות שרת מקצה לקצה: בידוד בין עסקים, אישורים, מנוי וניהול עובדים.
# מריץ שרת על מסד נתונים זמני ונקי, ומוחק אותו בסיום.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
# פורט אקראי גבוה כברירת מחדל, כדי לא להתנגש בשרת פיתוח שכבר רץ
PORT="${PORT:-$((3200 + RANDOM % 700))}"
export PORT
if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then
  echo "הפורט $PORT תפוס. יש להריץ עם PORT אחר." >&2
  exit 1
fi

cleanup() { [ -n "${PID:-}" ] && kill "$PID" 2>/dev/null; rm -rf "$TMP"; }
trap cleanup EXIT

DATA_DIR="$TMP" node "$ROOT/server/create-admin.js" yizhak@example.com 'Admin12345' 'יצחק' > /dev/null
DATA_DIR="$TMP" PORT="$PORT" node "$ROOT/server/index.js" > "$TMP/server.log" 2>&1 &
PID=$!

ready=0
for _ in $(seq 1 40); do
  if curl -sf "http://localhost:$PORT/api/health" > /dev/null 2>&1; then ready=1; break; fi
  sleep 0.3
done
if [ "$ready" -ne 1 ]; then
  echo "השרת לא עלה. לוג:" >&2; cat "$TMP/server.log" >&2; exit 1
fi

bash "$HERE/tenancy.sh" || exit 1
echo
bash "$HERE/employees.sh" || exit 1
