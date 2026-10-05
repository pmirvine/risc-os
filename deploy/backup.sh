#!/bin/bash
# Back up the HostFS data and the browser profile. Run as root (cron: riscos.cron).
set -euo pipefail

DIR=/srv/riscos/backups
COPY=/root/backups/riscos
TODAY="$(date +%Y%m%d)"
FILE="$DIR/riscos-$TODAY.tar.gz"

umask 077
mkdir -p "$DIR" "$COPY"
tar -czf "$FILE.tmp" -C / srv/riscos/data srv/riscos/profile
mv "$FILE.tmp" "$FILE"
cp -p "$FILE" "$COPY/"

# Keep the newest 7 daily files and, besides those, the Sunday file of each of the last 4 weeks.
prune() {
  local d=$1 f base day dow age
  local now; now="$(date +%s)"
  for f in "$d"/riscos-????????.tar.gz; do
    [ -e "$f" ] || continue
    base="$(basename "$f")"; day="${base#riscos-}"; day="${day%.tar.gz}"
    age=$(( (now - $(date -d "$day" +%s)) / 86400 ))
    dow="$(date -d "$day" +%u)"
    if [ "$age" -lt 7 ]; then continue; fi
    if [ "$dow" = 7 ] && [ "$age" -lt 35 ]; then continue; fi
    rm -f "$f"
  done
}
prune "$DIR"
prune "$COPY"
echo "backup: $FILE"
