#!/bin/sh
# Builds the extension zip and the website (site/) that serves it.
# Usage: sh scripts/build.sh
set -e
cd "$(dirname "$0")/.."
VERSION=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' manifest.json)

rm -rf dist site/js site/icons site/download
mkdir -p dist/chatscape site/js site/download
cp -R manifest.json background.js icons src LICENSE dist/chatscape/
(cd dist && zip -qr "chatscape-$VERSION.zip" chatscape)

cp src/engine.js src/themes.js site/js/
cp -R icons site/icons
cp "dist/chatscape-$VERSION.zip" site/download/chatscape.zip
cp "dist/chatscape-$VERSION.zip" "site/download/chatscape-$VERSION.zip"
echo "Built dist/chatscape-$VERSION.zip and site/"
