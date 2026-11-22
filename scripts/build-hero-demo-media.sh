#!/usr/bin/env bash
# Cuts the homepage hero carousel's demo loops (public/hero/demo), all but the
# AI clipping panel's, from two
# CC BY YouTube videos. Not run by any build: rerun by hand to change a cut,
# and keep app/components/landing/hero/demoTimeline.ts in step with it.
#
#   pod.mp4       "EPISODE_001 - Pilot (4K)" by all for Him
#                 https://www.youtube.com/watch?v=zUvXch90sAE  (720p: -f 136+140)
#   pod.en.json3  its English captions (--write-auto-subs --sub-format json3)
#   maldives.mp4  "Maldives | Paradise on Earth" by manisways
#                 https://www.youtube.com/watch?v=wqEHqKZziO4
#
# Usage: scripts/build-hero-demo-media.sh <folder with the three files>
set -euo pipefail
SRC="${1:?folder with pod.mp4, pod.en.json3, maldives.mp4}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/hero/demo"
mkdir -p "$OUT"
POD="$SRC/pod.mp4"
MAL="$SRC/maldives.mp4"

# Muted H.264 loops: small, start instantly (faststart), play everywhere.
enc=(-an -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -r 24)
seg() { echo "[0:v]trim=$1:$2,setpts=PTS-STARTPTS[$3];"; }
poster() { ffmpeg -v error -y -i "$OUT/$1.mp4" -frames:v 1 -c:v libwebp -quality 72 "$OUT/$1.webp"; }

# cut <name> <input> <start> <seconds> <filter>
cut() {
  ffmpeg -v error -y -ss "$3" -t "$4" -i "$2" -vf "$5" "${enc[@]}" "$OUT/$1.mp4"
  poster "$1"
}
# The 1280x720 podcast frame: centred 9:16 and 1:1 windows on a single speaker.
V916="crop=405:720:438:0"
V11="crop=720:720:280:0"

# (The AI clipping panel's rounds come from other footage:
# scripts/build-hero-clipping-media.sh.)

# AI captioning: 10 s of continuous speech, wide (the presets demo).
CAP_START=1673.5
cut captions-wide "$POD" $CAP_START 10 "scale=854:480"

# (AI reframe comes from the live stream: scripts/build-hero-clipping-media.sh.)

# AI B-roll: a vertical talking shot, plus the cutaway track the panel fades
# over it. Only clean aerial shots of the Maldives video are used (its last
# seconds carry the uploader's subscribe overlay). Cutaway track: sandbar at
# 1.05-4.5 s and beach at 6.0-7.5 s are the parts shown (BROLL_WINDOWS).
cut broll-main   "$POD" 1517 10 "$V916,scale=432:768"
MAL_916="crop=ih*9/16:ih,scale=432:768"
ffmpeg -v error -y -i "$MAL" -filter_complex \
  "$(seg 53.25 54.3 a)$(seg 10.9 14.35 b)$(seg 53.25 54.75 c)$(seg 74.05 75.55 d)$(seg 23.45 25.1 e)$(seg 117.95 118.85 f)[a][b][c][d][e][f]concat=n=6:v=1,$MAL_916" \
  "${enc[@]}" "$OUT/broll-insert.mp4"
poster broll-insert
# The timeline under it: ten frames of the main shot side by side.
ffmpeg -v error -y -i "$OUT/broll-main.mp4" -vf "fps=1,scale=-1:88,tile=10x1" -frames:v 1 -c:v libwebp -quality 70 "$OUT/broll-strip.webp"

# AI speech enhance: the picture, plus waveforms of its real audio, clean and
# with room noise mixed in for the "before" (the panel says so).
SP_START=839.5
cut speech       "$POD" $SP_START 10 "scale=854:480"
wave="showwavespic=s=640x80:colors=0x20d68a:split_channels=0"
ffmpeg -v error -y -ss $SP_START -t 10 -i "$POD" -filter_complex "[0:a]aformat=channel_layouts=mono,$wave" -frames:v 1 -c:v libwebp -quality 80 "$OUT/wave-clean.webp"
ffmpeg -v error -y -ss $SP_START -t 10 -i "$POD" -f lavfi -t 10 -i "anoisesrc=color=brown:amplitude=0.45" \
  -filter_complex "[0:a]aformat=channel_layouts=mono[v];[1:a]aformat=channel_layouts=mono[n];[v][n]amix=inputs=2:normalize=0,$wave" -frames:v 1 -c:v libwebp -quality 80 "$OUT/wave-noisy.webp"

# AI voice-over: aerial shots, one group per script line (VOICE_LINES):
# 0-3.25 resort island + beach, 3.25-6.7 sandbar, 6.7-9.1 beach + jetty.
ffmpeg -v error -y -i "$MAL" -filter_complex \
  "$(seg 53.25 54.85 a)$(seg 23.45 25.1 b)$(seg 10.9 14.35 c)$(seg 74.05 75.55 d)$(seg 117.95 118.85 e)[a][b][c][d][e]concat=n=5:v=1,crop=ih*16/9:ih,scale=854:480" \
  "${enc[@]}" "$OUT/voiceover.mp4"
poster voiceover

# Caption words for the captions loop, re-timed to start at 0.
python - "$SRC/pod.en.json3" $CAP_START "$(dirname "$0")/../app/components/landing/hero/captionWords.json" <<'PY'
import json, sys
src, start, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
words = []
for e in json.load(open(src, encoding="utf-8"))["events"]:
    for s in e.get("segs", []):
        w = s["utf8"].strip()
        if w:
            words.append(((e["tStartMs"] + s.get("tOffsetMs", 0)) / 1000, w))
words.sort()
inside = [(t - start, w) for t, w in words if start <= t < start + 10]
res = []
for i, (t, w) in enumerate(inside):
    end = inside[i + 1][0] if i + 1 < len(inside) else min(t + 0.6, 10)
    res.append({"w": w, "s": round(t, 2), "e": round(end, 2)})
with open(out, "w", encoding="utf-8") as f:
    f.write("[\n" + ",\n".join(json.dumps(r) for r in res) + "\n]\n")
print(len(res), "caption words")
PY

ls -la "$OUT"
du -sh "$OUT"
