#!/usr/bin/env bash
# Applies every migration to a throwaway database and runs the security checks.
# Requires a local PostgreSQL with postgis and pgcrypto available.
set -euo pipefail

DB="${1:-getservice_verify}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

dropdb --if-exists "$DB"
createdb "$DB"

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/local-shim.sql"
for migration in "$HERE"/../migrations/*.sql; do
  echo "→ $(basename "$migration")"
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$migration"
done

psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/rls-verification.sql"
