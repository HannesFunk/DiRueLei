#!/usr/bin/env bash
set -euo pipefail

# Reads APP_VERSION from index.html and appends ?v=<version> to static assets.
# Run this before deploying.

WEBAPP_DIR="$(dirname "$0")/webapp"
INDEX="$WEBAPP_DIR/index.html"
APPJS="$WEBAPP_DIR/app.js"

# Extract version from the HTML comment in index.html
VERSION=$(grep -oP '<!-- APP_VERSION = "\K[^"]+' "$INDEX")
if [[ -z "$VERSION" ]]; then
    echo "ERROR: Could not find APP_VERSION in $INDEX" >&2
    exit 1
fi

VERSION_NUM="${VERSION//./}"
BUILD_TIME=$(date '+%d.%m.%Y, %H:%M')
echo "Building with version $VERSION (v=$VERSION_NUM) at $BUILD_TIME"

# Strip any existing ?v= query strings, then re-add with current version
# Also update the footer version span and upload time
sed -i -E \
    "s|(<script src=\"app\.js)(\?v=[0-9]+)?(\")|\\1?v=${VERSION_NUM}\\3|g;
     s|(<link rel=\"stylesheet\" href=\"style\.css)(\?v=[0-9]+)?(\")|\\1?v=${VERSION_NUM}\\3|g;
     s|(<span class=\"version\">v)[^<]*(</span>)|\\1${VERSION}\\2|g;
     s|(<span class=\"upload-time\">)[^<]*(</span>)|\\1vom ${BUILD_TIME}\\2|g" \
    "$INDEX"

# Update worker version in app.js
sed -i -E \
    "s|(new Worker\('scan-worker\.js\?v=)[0-9]+'|\\1${VERSION_NUM}'|g" \
    "$APPJS"

echo "Done. Updated $INDEX and $APPJS with ?v=$VERSION_NUM, footer v$VERSION, build time $BUILD_TIME"
