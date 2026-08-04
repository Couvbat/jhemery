#!/usr/bin/env bash
#
# Regenerates the raster assets in public/ from their SVG sources.
#
#   public/og-image.svg  ->  og-image.png
#   public/icon.svg      ->  pwa-192.png, pwa-512.png,
#                            pwa-maskable-512.png, apple-touch-icon.png
#
# These are committed rather than built by Vite on purpose. Rasterising them in
# CI would need a native rasteriser plus the exact fonts on the runner, and they
# change roughly never — a stale PNG is a far worse failure mode than a manual
# step, because a broken og:image is invisible until someone shares the link.
#
# Run this after editing either SVG, then commit the PNGs alongside it.
#
# Requires: librsvg (rsvg-convert) and ImageMagick (magick).

set -euo pipefail

cd "$(dirname "$0")/.."

for bin in rsvg-convert magick; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "error: $bin not found." >&2
    echo "  Arch:   sudo pacman -S librsvg imagemagick" >&2
    echo "  Debian: sudo apt install librsvg2-bin imagemagick" >&2
    exit 1
  fi
done

BG="#0d0f0d"

echo "og-image.png (1200x630)"
rsvg-convert -w 1200 -h 630 public/og-image.svg -o public/og-image.png

echo "pwa-192.png, pwa-512.png"
rsvg-convert -w 192 -h 192 public/icon.svg -o public/pwa-192.png
rsvg-convert -w 512 -h 512 public/icon.svg -o public/pwa-512.png

# Maskable icons get cropped to whatever shape the launcher wants, so the mark
# has to sit inside the middle 80% and the background has to bleed to the edge.
echo "pwa-maskable-512.png"
rsvg-convert -w 410 -h 410 public/icon.svg |
  magick - -background "$BG" -gravity center -extent 512x512 public/pwa-maskable-512.png

# iOS ignores the manifest and rounds the corners itself, so it wants the same
# full-bleed treatment.
echo "apple-touch-icon.png (180x180)"
rsvg-convert -w 144 -h 144 public/icon.svg |
  magick - -background "$BG" -gravity center -extent 180x180 public/apple-touch-icon.png

echo "done"
