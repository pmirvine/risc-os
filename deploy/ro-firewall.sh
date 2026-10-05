#!/bin/bash
# Keep the RISC OS container (bridge br-ro) away from the host and the LAN.
#   ro-firewall.sh [apply]   add the rules (idempotent)
#   ro-firewall.sh remove    delete them
set -euo pipefail

BR=br-ro
GW=172.30.50.1
PRIVATE="10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16 100.64.0.0/10"
cmd="${1:-apply}"

wait_for_bridge() {
  local i
  for i in $(seq 1 60); do
    if ip link show "$BR" >/dev/null 2>&1 && iptables -n -L DOCKER-USER >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "ro-firewall: $BR or the DOCKER-USER chain did not appear within 60s; nothing changed" >&2
  echo "ro-firewall: start the stack first (docker compose up -d), then run this again" >&2
  return 1
}

# ensure <tool> <chain> <rule...>: insert at the top if missing
ensure() { local t=$1 c=$2; shift 2; "$t" -C "$c" "$@" 2>/dev/null || "$t" -I "$c" "$@"; }
drop()   { local t=$1 c=$2; shift 2; while "$t" -C "$c" "$@" 2>/dev/null; do "$t" -D "$c" "$@"; done; }

case "$cmd" in
  apply)
    wait_for_bridge || exit 1
    # Private ranges are dropped in DOCKER-USER, which Docker evaluates before its own forwarding rules.
    for net in $PRIVATE; do
      ensure iptables DOCKER-USER -i "$BR" -d "$net" -j DROP
    done
    # The container uses 1.1.1.1/9.9.9.9 for DNS, so nothing on the host is needed: drop all from the bridge.
    # Order matters (ACCEPT must precede DROP), so re-apply always removes both and re-inserts them in order.
    drop iptables INPUT -i "$BR" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    drop iptables INPUT -i "$BR" -j DROP
    iptables -I INPUT 1 -i "$BR" -j DROP
    # Replies to connections the host starts (Apache -> docker-proxy -> container) must still get in; inserted last = first.
    iptables -I INPUT 1 -i "$BR" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    if command -v ip6tables >/dev/null 2>&1; then
      ip6tables -n -L DOCKER-USER >/dev/null 2>&1 && ensure ip6tables DOCKER-USER -i "$BR" -j DROP
      ensure ip6tables INPUT -i "$BR" -j DROP
      ensure ip6tables FORWARD -i "$BR" -j DROP
    fi
    echo "ro-firewall: rules applied for $BR"
    ;;
  remove)
    for net in $PRIVATE; do drop iptables DOCKER-USER -i "$BR" -d "$net" -j DROP; done
    drop iptables INPUT -i "$BR" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
    drop iptables INPUT -i "$BR" -j DROP
    if command -v ip6tables >/dev/null 2>&1; then
      drop ip6tables DOCKER-USER -i "$BR" -j DROP || true
      drop ip6tables INPUT -i "$BR" -j DROP
      drop ip6tables FORWARD -i "$BR" -j DROP
    fi
    echo "ro-firewall: rules removed"
    ;;
  *) echo "usage: $0 [apply|remove]" >&2; exit 2;;
esac
