#!/usr/bin/env bash
# Build ShopReturnGifts hero + promo MP4s from generated stills (requires ffmpeg).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERO="$ROOT/public/assets/shopreturngifts/hero/hero-return-gifts.png"
L1="$ROOT/public/assets/shopreturngifts/lifestyle/lifestyle-01.png"
OUT="$ROOT/public/videos"
mkdir -p "$OUT"

ffmpeg -y -loop 1 -i "$HERO" -c:v libx264 -t 10 -r 30 -pix_fmt yuv420p \
  -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
  "$OUT/shopreturngifts-hero.mp4"

ffmpeg -y -loop 1 -i "$L1" -c:v libx264 -t 10 -r 30 -pix_fmt yuv420p \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" \
  "$OUT/shopreturngifts-promo.mp4"

echo "Wrote $OUT/shopreturngifts-hero.mp4 and shopreturngifts-promo.mp4"
