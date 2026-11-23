#!/usr/bin/env bash
# Cuts Home's three AutoClip sample videos (lib/sample-projects.ts) from their
# CC BY YouTube sources: a 10-minute 720p MP4 and a JPEG still each, for the
# bucket (scripts/upload-sample-projects.ts puts them under samples/), and a
# small WebP poster each for the tile, into public/samples. Not run by any
# build: rerun by hand to change a cut, and keep lib/sample-projects.ts (the
# credit, the 600 s duration) in step with it.
#
#   podcast  "Where Are Rich Indians Investing Globally?" by Sonia Shenoy
#            https://www.youtube.com/watch?v=DnvvJvObuPs
#   gaming   "Replacing EVERY Minecraft texture with my FACE!" by Bandi
#            https://www.youtube.com/watch?v=-fueAmTcIDQ
#   vlog     "Our FIRST DAY in INDIA! Exploring India's Vibrant Street Food"
#            by THE DEPARTURE BRIEF  https://www.youtube.com/watch?v=iY_U9VZfdzg
#
# Usage: scripts/build-sample-projects.sh <empty work folder>
#   (needs yt-dlp, as `yt-dlp` or `python -m yt_dlp`, and ffmpeg)
set -euo pipefail
WORK="${1:?an empty work folder for the downloads and cuts}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POSTERS="$ROOT/public/samples"
mkdir -p "$WORK/src" "$WORK/out" "$POSTERS"
if command -v yt-dlp >/dev/null; then YTDLP=(yt-dlp); else YTDLP=(python -m yt_dlp); fi

LEN=600
# id | YouTube id | start (s) | still at (s, into the cut)
SAMPLES=(
  "podcast|DnvvJvObuPs|90|200"
  "gaming|-fueAmTcIDQ|0|150"
  "vlog|iY_U9VZfdzg|60|240"
)

for row in "${SAMPLES[@]}"; do
  IFS='|' read -r id yt start still <<<"$row"
  src="$WORK/src/$id.mp4"
  if [[ ! -f "$src" ]]; then
    "${YTDLP[@]}" -q -f "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]" \
      --merge-output-format mp4 -o "$src" "https://www.youtube.com/watch?v=$yt"
  fi
  # 720p H.264 + AAC, faststart: 55-290 MB. Samples skip the per-user file and
  # storage caps (one shared object), so quality wins over size here.
  ffmpeg -v error -y -ss "$start" -t "$LEN" -i "$src" \
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=30" \
    -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -ac 2 -movflags +faststart \
    "$WORK/out/$id.mp4"
  ffmpeg -v error -y -ss "$still" -i "$WORK/out/$id.mp4" -frames:v 1 -vf scale=640:360 -q:v 4 "$WORK/out/$id.jpg"
  ffmpeg -v error -y -ss "$still" -i "$WORK/out/$id.mp4" -frames:v 1 -vf scale=480:270 -c:v libwebp -quality 72 "$POSTERS/$id.webp"
  printf '%s: %s\n' "$id" "$(du -h "$WORK/out/$id.mp4" | cut -f1)"
done
echo "Cuts in $WORK/out; posters in public/samples. Upload: npx tsx scripts/upload-sample-projects.ts $WORK/out"
