#!/bin/sh
# Builds the extension zip and the website (site/) that serves it.
# Usage: sh scripts/build.sh
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' manifest.json)

rm -rf dist site/js site/icons site/download site/_headers
mkdir -p dist/chatscape site/js site/download
cp -R manifest.json background.js icons src LICENSE dist/chatscape/
node scripts/zip.mjs dist/chatscape "dist/chatscape-$VERSION.zip"

cp src/engine.js src/themes.js site/js/
cp -R icons site/icons
cp "dist/chatscape-$VERSION.zip" site/download/chatscape.zip
cp "dist/chatscape-$VERSION.zip" "site/download/chatscape-$VERSION.zip"
# the stable link saves as chatscape-<version>.zip
printf '/download/chatscape.zip\n  Content-Disposition: attachment; filename="chatscape-%s.zip"\n' "$VERSION" > site/_headers
echo "Built dist/chatscape-$VERSION.zip and site/"
