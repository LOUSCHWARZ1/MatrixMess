#!/bin/sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT_DIR"
DERIVED_DATA_DIR="$PROJECT_DIR/build/DerivedData"
EXPORT_DIR="$PROJECT_DIR/build/export"

cd "$PROJECT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen ist nicht installiert."
  exit 1
fi

xcodegen generate

rm -rf "$DERIVED_DATA_DIR" "$EXPORT_DIR"

xcodebuild \
  -project MatrixMess.xcodeproj \
  -scheme MatrixMess \
  -configuration Release \
  -sdk iphoneos \
  -destination "generic/platform=iOS" \
  -derivedDataPath "$DERIVED_DATA_DIR" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  build

APP_PATH="$(find "$DERIVED_DATA_DIR/Build/Products/Release-iphoneos" -maxdepth 1 -name '*.app' | head -n1)"

if [ -z "$APP_PATH" ]; then
  echo "Keine .app im Build-Output gefunden."
  exit 1
fi

mkdir -p "$EXPORT_DIR/Payload"
cp -R "$APP_PATH" "$EXPORT_DIR/Payload/"

cd "$EXPORT_DIR"
/usr/bin/zip -qry MatrixMess-unsigned.ipa Payload

echo "Fertig. Unsigned IPA liegt unter $EXPORT_DIR/MatrixMess-unsigned.ipa"
