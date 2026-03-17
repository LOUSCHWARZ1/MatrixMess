#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v xcodegen >/dev/null 2>&1; then
  brew install xcodegen
fi

cd "$PROJECT_DIR"
xcodegen generate
