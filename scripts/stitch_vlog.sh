#!/bin/bash
set -euo pipefail

# Usage: ./stitch_vlog.sh manifest.json output.mp4
# Manifest JSON format:
# {
#   "clips": ["clip1.mp4", "clip2.mp4", ...],
#   "narration": "narration.mp3",
#   "background_music": "music.mp3" (optional),
#   "music_volume": 0.1 (optional, default 0.1)
# }

if [ $# -lt 2 ]; then
  echo "Usage: $0 <manifest.json> <output.mp4>"
  exit 1
fi

MANIFEST="$1"
OUTPUT="$2"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

if ! command -v ffmpeg &>/dev/null; then
  echo "Error: ffmpeg not found"
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq not found"
  exit 1
fi

CLIPS=$(jq -r '.clips[]' "$MANIFEST")
NARRATION=$(jq -r '.narration // empty' "$MANIFEST")
BG_MUSIC=$(jq -r '.background_music // empty' "$MANIFEST")
MUSIC_VOL=$(jq -r '.music_volume // 0.1' "$MANIFEST")

# Build concat list — normalize each clip to 1080x1920 9:16
CONCAT_LIST="$TMPDIR/concat.txt"
IDX=0
for CLIP in $CLIPS; do
  NORMALIZED="$TMPDIR/norm_${IDX}.mp4"
  ffmpeg -y -i "$CLIP" \
    -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1" \
    -c:v libx264 -preset fast -crf 18 \
    -r 30 -pix_fmt yuv420p \
    -an \
    "$NORMALIZED" 2>/dev/null
  echo "file '$NORMALIZED'" >> "$CONCAT_LIST"
  IDX=$((IDX + 1))
done

if [ "$IDX" -eq 0 ]; then
  echo "Error: no clips found in manifest"
  exit 1
fi

# Concatenate all normalized clips (video only)
CONCAT_VIDEO="$TMPDIR/concat.mp4"
ffmpeg -y -f concat -safe 0 -i "$CONCAT_LIST" \
  -c:v libx264 -preset fast -crf 18 \
  -pix_fmt yuv420p \
  "$CONCAT_VIDEO" 2>/dev/null

# Build final audio mix
if [ -n "$NARRATION" ] && [ -n "$BG_MUSIC" ]; then
  ffmpeg -y \
    -i "$CONCAT_VIDEO" \
    -i "$NARRATION" \
    -i "$BG_MUSIC" \
    -filter_complex "[1:a]aresample=44100[narr];[2:a]aresample=44100,volume=${MUSIC_VOL}[music];[narr][music]amix=inputs=2:duration=shortest[aout]" \
    -map 0:v -map "[aout]" \
    -c:v libx264 -preset fast -crf 18 \
    -c:a aac -b:a 192k \
    -pix_fmt yuv420p \
    -movflags +faststart \
    -shortest \
    "$OUTPUT" 2>/dev/null
elif [ -n "$NARRATION" ]; then
  ffmpeg -y \
    -i "$CONCAT_VIDEO" \
    -i "$NARRATION" \
    -map 0:v -map 1:a \
    -c:v libx264 -preset fast -crf 18 \
    -c:a aac -b:a 192k \
    -pix_fmt yuv420p \
    -movflags +faststart \
    -shortest \
    "$OUTPUT" 2>/dev/null
else
  ffmpeg -y \
    -i "$CONCAT_VIDEO" \
    -c:v libx264 -preset fast -crf 18 \
    -c:a aac -b:a 192k \
    -pix_fmt yuv420p \
    -movflags +faststart \
    "$OUTPUT" 2>/dev/null
fi

echo "$OUTPUT"
