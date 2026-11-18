#!/usr/bin/env bash
# Script: Copy shared backend code into each Python service
# Purpose: Each Lambda ships only its own folder, so backend/_common/ is copied to
#          backend/<service>/common/ (gitignored). Run before start-dev and deploys,
#          and again after editing anything in backend/_common/.
# Usage: ./bin/sync-common.sh

set -e

if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    echo "Usage: $0"
    echo "Copy backend/_common into backend/<service>/common for every Python service"
    exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" > /dev/null 2>&1 || exit 1; pwd -P)"
BACKEND_DIR="$SCRIPT_DIR/../backend"
COMMON_DIR="$BACKEND_DIR/_common"

shopt -s nullglob
for req in "$BACKEND_DIR"/*/requirements.txt; do
    svc_dir="$(dirname "$req")"
    case "$(basename "$svc_dir")" in _*|.*) continue ;; esac
    rm -rf "$svc_dir/common"
    mkdir -p "$svc_dir/common"
    cp "$COMMON_DIR"/*.py "$COMMON_DIR/schema.sql" "$svc_dir/common/"
    echo "  ✓ Synced common/ into $(basename "$svc_dir")"
done
