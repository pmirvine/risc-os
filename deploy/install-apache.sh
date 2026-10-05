#!/bin/bash
# Install the /ro Apache config. Run as root on the server:  ./install-apache.sh
# Idempotent. On any failure the vhost is restored and Apache is NOT reloaded.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VHOST=/etc/apache2/vhosts.d/tsihome.mynetgear.com-le-ssl.conf
INC=/etc/apache2/conf.d/ro.inc
ENVF=/srv/riscos/.env
LINE="Include $INC"
STAMP="$(date +%Y%m%d-%H%M%S)"
BAK="$VHOST.bak-$STAMP"
INCBAK=""

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
[ -f "$VHOST" ] || { echo "missing $VHOST" >&2; exit 1; }
[ -f /etc/apache2/ro.htpasswd ] || { echo "missing /etc/apache2/ro.htpasswd (see README)" >&2; exit 1; }
SECRET="$(sed -n 's/^RISCOS_PROXY_SECRET=//p' "$ENVF" | head -n1)"
[ "${#SECRET}" -ge 16 ] || { echo "RISCOS_PROXY_SECRET missing or short in $ENVF" >&2; exit 1; }
case "$SECRET" in *[!A-Za-z0-9._~+/=-]*) echo "secret has characters unsafe for the config; use openssl rand -hex 24" >&2; exit 1;; esac

cp -p "$VHOST" "$BAK"
[ -f "$INC" ] && { INCBAK="$INC.bak-$STAMP"; cp -p "$INC" "$INCBAK"; }

restore() {
  echo "FAILED: restoring $VHOST" >&2
  cp -p "$BAK" "$VHOST"
  if [ -n "$INCBAK" ]; then cp -p "$INCBAK" "$INC"; else rm -f "$INC"; fi
  exit 1
}
trap restore ERR

# The config contains the secret: root only.
umask 077
sed "s|__SECRET__|$SECRET|g" "$HERE/apache-ro.conf" > "$INC.new"
chown root:root "$INC.new"; chmod 0640 "$INC.new"
mv "$INC.new" "$INC"

if ! grep -qF "$LINE" "$VHOST"; then
  # Insert just before the </VirtualHost> that closes the *:443 vhost (first such block only).
  awk -v line="    $LINE" '
    /<VirtualHost[^>]*:443>/ { in443=1 }
    in443 && !done && /<\/VirtualHost>/ { print line; done=1; in443=0 }
    { print }
  ' "$VHOST" > "$VHOST.new"
  grep -qF "$LINE" "$VHOST.new" || { echo "no <VirtualHost *:443> block found" >&2; rm -f "$VHOST.new"; false; }
  cat "$VHOST.new" > "$VHOST"; rm -f "$VHOST.new"
fi

OUT="$(apachectl configtest 2>&1)" || { echo "$OUT" >&2; false; }
echo "$OUT"
case "$OUT" in *"Syntax OK"*) ;; *) false;; esac

trap - ERR
systemctl reload apache2
echo "Apache reloaded. Backup: $BAK"
