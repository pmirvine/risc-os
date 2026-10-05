#!/bin/bash
# Build the image and smoke-test it on this machine. Skipped (exit 0) when Docker is not running.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then echo "docker not available: skipped"; exit 0; fi

NAME=riscos-smoke-check-$$
TMP="$(mktemp -d)"
SECRET="throwaway-secret-$$-$RANDOM$RANDOM"
PORT=28371
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; rm -rf "$TMP"; docker rmi riscos-web:check >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; docker logs "$NAME" 2>&1 | tail -20 >&2 || true; exit 1; }

mkdir -p "$TMP/data" "$TMP/profile"; chmod 777 "$TMP/data" "$TMP/profile"   # container runs as uid 1000
docker build -f deploy/Dockerfile -t riscos-web:check .

docker run -d --name "$NAME" --init --read-only --tmpfs /tmp:rw,uid=1000,gid=1000 --cap-drop ALL \
  --security-opt no-new-privileges:true --security-opt "seccomp=deploy/chrome-seccomp.json" \
  -e RISCOS_PROXY_SECRET="$SECRET" -e RISCOS_BROWSER_ARGS="--no-sandbox --disable-dev-shm-usage" \
  -v "$TMP/data:/data" -v "$TMP/profile:/profile" -p "127.0.0.1:$PORT:8371" riscos-web:check >/dev/null

for _ in $(seq 1 30); do curl -fs -o /dev/null "http://127.0.0.1:$PORT/" && break; sleep 1; done

code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
c="$(code "http://127.0.0.1:$PORT/")";                                             [ "$c" = 200 ] || fail "/ returned $c"
c="$(code -H 'Host: tsihome.mynetgear.com' "http://127.0.0.1:$PORT/__hostfs/")";   [ "$c" = 403 ] || fail "/__hostfs/ without secret returned $c, want 403"
c="$(code -H 'Host: tsihome.mynetgear.com' -H "X-Proxy-Auth: $SECRET" "http://127.0.0.1:$PORT/__hostfs/")"
[ "$c" = 200 ] || fail "/__hostfs/ with secret returned $c, want 200"
body="$(curl -s -H 'Host: tsihome.mynetgear.com' -H "X-Proxy-Auth: $SECRET" "http://127.0.0.1:$PORT/__hostfs/")"
case "$body" in *Server*) ;; *) fail "no Server mount in: $body";; esac
echo "check-local: all checks passed"
