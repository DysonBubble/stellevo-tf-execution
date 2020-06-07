#!/bin/bash
set -e

SCRIPT_PATH="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT_PATH")"

"${SCRIPT_DIR}/run-stellevo-actions.sh" "$1" "$2" '["copy"]'
