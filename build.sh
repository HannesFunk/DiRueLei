#!/usr/bin/env bash
set -euo pipefail

# Reads APP_VERSION from index.html and appends ?v=<version> to static assets.
# Run this before deploying.

WEBAPP_DIR="$(dirname "$0")/webapp"
INDEX="$WEBAPP_DIR/index.html"

# Extract version from the JS constant in index.html
VERSION=$(grep -oP 'const APP_VERSION = "\K[^"]+' "$INDEX")
if [[ -z "$VERSION" ]]; then
    echo "ERROR: Could not find APP_VERSION in $INDEX" >&2
    exit 1
fi

VERSION_NUM="${VERSION//./}"
echo "Building with version $VERSION (v=$VERSION_NUM)"

# Strip any existing ?v= query strings, then re-add with current version
sed -i -E \
    "s|(<script src=\"app\.js)(\?v=[0-9]+)?(\")|\\1?v=${VERSION_NUM}\\3|g;
     s|(<link rel=\"stylesheet\" href=\"style\.css)(\?v=[0-9]+)?(\")|\\1?v=${VERSION_NUM}\\3|g" \
    "$INDEX"

echo "Done. Updated $INDEX with ?v=$VERSION_NUM"
