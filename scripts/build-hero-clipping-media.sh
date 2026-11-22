#!/usr/bin/env bash
# Cuts the homepage hero's AI clipping rounds (public/hero/demo/cr*-*) from
# five CC BY YouTube videos: per round, an 8 s long-video loop plus six 4 s
# clip loops (16:9, 9:16, 1:1, 9:16, 9:16, 1:1), each with a WebP poster.
# Not run by any build: rerun by hand to change a cut, and keep
# app/components/landing/hero/features.ts (CLIP_ROUNDS) in step with it.
# Every window below was checked to be one unbroken shot, clear of burned-in
# titles, overlays and sponsor logos.
#
#   p1.mp4      "This Dropshipping Store Selling Neon Signs Is Doing 150K/Yr…"
#               by Unemployable Media  https://www.youtube.com/watch?v=GL2-8q08PMA
#               (a 12:00–17:00 section, 1080p)
#   pattaya.mp4 "INSANE Food Festival in Pattaya" by TRAVEL THAILAND 4K
#               https://www.youtube.com/watch?v=t55fHqNbEhs  (1080p)
#   g3.mp4      "Telugu girl gamer FACE CAM ON BGMI LIVE" by Nanditha Plays
#               https://www.youtube.com/watch?v=BVtEjWIcswM  (a 1:10:00–1:15:00
#               section, 1080p; BGMI's game art belongs to Krafton)
#   p2.mp4      "Nepotism In Jewelry Business" by The Vivek Somani Show
#               https://www.youtube.com/watch?v=uf10UbP9rQM  (720p)
#   g2.mp4      "SuperTuxKart - XR591" by Jooched
#               https://www.youtube.com/watch?v=nNTAPlRDTvM  (1080p)
#
# Usage: scripts/build-hero-clipping-media.sh <folder with the five files>
set -euo pipefail
SRC="${1:?folder with p1.mp4, pattaya.mp4, g3.mp4, p2.mp4, g2.mp4}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/hero/demo"
mkdir -p "$OUT"
enc=(-an -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -r 24)
poster() { ffmpeg -v error -y -i "$OUT/$1.mp4" -frames:v 1 -c:v libwebp -quality 72 "$OUT/$1.webp"; }

# loop <name> <source> <start s> <seconds> <filter>
loop() {
  ffmpeg -v error -y -ss "$3" -t "$4" -i "$SRC/$2.mp4" -vf "$5" "${enc[@]}" "$OUT/$1.mp4"
  poster "$1"
}
# Crops around a subject's centre x on a 1920x1080 frame.
v916() { local x=$(( $1 - 303 )); (( x < 0 )) && x=0; (( x > 1313 )) && x=1313; echo "crop=607:1080:$x:0,scale=270:480"; }
v11()  { local x=$(( $1 - 540 )); (( x < 0 )) && x=0; (( x > 840 )) && x=840; echo "crop=1080:1080:$x:0,scale=360:360"; }
W169="scale=480:270"
LONG="scale=640:360"

# Round 1: neon podcast. Host (white T-shirt) sits right, guest (skyline) centre.
loop cr1-long p1 160 8 "$LONG"
loop cr1-1 p1 45  4 "$W169"
loop cr1-2 p1 177 4 "$(v916 1056)"
loop cr1-3 p1 61  4 "$(v11 1306)"
loop cr1-4 p1 233 4 "$(v916 1306)"
loop cr1-5 p1 286 4 "$(v916 1056)"
loop cr1-6 p1 195 4 "$(v11 1306)"

# Round 2: street food festival.
loop cr2-long pattaya 40 8 "$LONG"
loop cr2-1 pattaya 56  4 "$W169"
loop cr2-2 pattaya 181 4 "$(v916 960)"
loop cr2-3 pattaya 199 4 "$(v11 960)"
loop cr2-4 pattaya 169 4 "$(v916 960)"
loop cr2-5 pattaya 121 4 "$(v916 960)"
loop cr2-6 pattaya 142 4 "$(v11 960)"

# Round 3: live stream. Facecam at x 1390-1916, y 666-1080; gameplay above
# y 880. Vertical clips stack the facecam over a gameplay square (a
# streamer's Short); square clips put the facecam in as a small inset.
FACE="crop=526:414:1390:666"
STACK="[0:v]split[a][b];[a]$FACE,scale=270:212[f];[b]crop=880:880:520:0,scale=270:268[g];[f][g]vstack"
PIP="[0:v]split[a][b];[a]crop=880:880:520:0,scale=360:360[g];[b]$FACE,scale=118:93[f];[g][f]overlay=236:261"
graph() {
  ffmpeg -v error -y -ss "$2" -t 4 -i "$SRC/g3.mp4" -filter_complex "$3" "${enc[@]}" "$OUT/$1.mp4"
  poster "$1"
}
loop  cr3-long g3 42 8 "$LONG"
loop  cr3-1 g3 65 4 "$W169"
graph cr3-2 51  "$STACK"
graph cr3-3 79  "$PIP"
graph cr3-4 99  "$STACK"
graph cr3-5 127 "$STACK"
graph cr3-6 214 "$PIP"

# The AI reframe panel (not a clipping round, but the same stream): 10 s of
# one unbroken shot, wide, and as the "gameplay layout" Short: the facecam
# stacked over the gameplay. The panel's AI boxes mark these two crops
# (REFRAME_BOXES in app/components/landing/hero/demoTimeline.ts).
renc=(-an -c:v libx264 -preset slow -crf 34 -pix_fmt yuv420p -movflags +faststart -r 24)
ffmpeg -v error -y -ss 200 -t 10 -i "$SRC/g3.mp4" -vf "scale=854:480" "${renc[@]}" "$OUT/reframe-before.mp4"
poster reframe-before
ffmpeg -v error -y -ss 200 -t 10 -i "$SRC/g3.mp4" -filter_complex   "[0:v]split[a][b];[a]$FACE,scale=432:340[f];[b]crop=864:856:528:0,scale=432:428[g];[f][g]vstack"   "${renc[@]}" "$OUT/reframe-after.mp4"
poster reframe-after

# Round 4: teal-set podcast, 1280x720. Host (grey jacket) left, guest right.
loop cr4-long p2 884 8 "$LONG"
loop cr4-1 p2 421 4 "$W169"
loop cr4-2 p2 561 4 "crop=405:720:207:0,scale=270:480"
loop cr4-3 p2 461 4 "crop=720:720:408:0,scale=360:360"
loop cr4-4 p2 621 4 "crop=405:720:566:0,scale=270:480"
loop cr4-5 p2 786 4 "crop=405:720:566:0,scale=270:480"
loop cr4-6 p2 701 4 "crop=720:720:408:0,scale=360:360"

# Round 5: kart racing (skips the intro, song credit and results screens).
loop cr5-long g2 21 8 "$LONG"
loop cr5-1 g2 14  4 "$W169"
loop cr5-2 g2 34  4 "$(v916 960)"
loop cr5-3 g2 46  4 "$(v11 960)"
loop cr5-4 g2 58  4 "$(v916 960)"
loop cr5-5 g2 97  4 "$(v916 960)"
loop cr5-6 g2 115 4 "$(v11 960)"

ls -la "$OUT"/cr* | wc -l
du -ch "$OUT"/cr* | tail -1
