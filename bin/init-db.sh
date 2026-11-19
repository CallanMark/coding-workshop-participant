#!/usr/bin/env bash
# Script: Initialise the local PostgreSQL database
# Purpose: Apply backend/_common/schema.sql, then seed mock data from backend/_common/seed.sql
# Usage: ./bin/init-db.sh [--no-seed] [--reset]

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0 [--no-seed] [--reset]"
    echo ""
    echo "  Applies the schema (idempotent) and seeds mock data (idempotent)."
    echo ""
    echo "Options:"
    echo "  --no-seed   Apply the schema only"
    echo "  --reset     Drop all app tables first (LOCAL DATA IS LOST)"
    echo "  -h, --help  Show this help message"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
COMMON_DIR="$SCRIPT_DIR/../backend/_common"

# Local defaults; override with standard libpq env vars if needed
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres123}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGOPTIONS="-c client_min_messages=warning"  # hide "already exists, skipping" notices

PSQL="psql -q -v ON_ERROR_STOP=1"

SEED=true
for arg in "$@"; do
    case "$arg" in
        --no-seed) SEED=false ;;
        --reset)
            echo "  ⚠ Dropping all app tables..."
            $PSQL -c "DROP TABLE IF EXISTS incident_feedback, incident_events, incident_notes, incidents, seats, floors, buildings, users, categories, teams, app_meta CASCADE;"
            ;;
        *) echo "Unknown option: $arg"; exit 1 ;;
    esac
done

$PSQL -f "$COMMON_DIR/schema.sql"
echo "  ✓ Schema applied"

if [ "$SEED" = true ]; then
    $PSQL -f "$COMMON_DIR/seed.sql" > /dev/null
    echo "  ✓ Mock data seeded"
fi
