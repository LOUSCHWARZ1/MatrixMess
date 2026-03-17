#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR"
DERIVED_DATA_DIR="$PROJECT_DIR/.derived-data"
ARCHIVE_PATH="$PROJECT_DIR/build/MatrixMess.xcarchive"
EXPORT_PATH="$PROJECT_DIR/build/export"

cd "$PROJECT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen ist nicht installiert."
  exit 1
fi

xcodegen generate

rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"

xcodebuild \
  -project MatrixMess.xcodeproj \
  -scheme MatrixMess \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA_DIR" \
  archive \
  -archivePath "$ARCHIVE_PATH"

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$PROJECT_DIR/ExportOptions-Development.plist"

echo "Fertig. IPA liegt unter $EXPORT_PATH"
