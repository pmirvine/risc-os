#!/bin/bash
# Sync this checkout to the servers that run the desktop.
#
#   ./deploy.sh [ro|roweb|all] [--dry-run] [--no-restart] [--allow-dirty] [--test]
#
#   ro       the full deployment (login, !Browse's engine, the Server drive): copies the app and deploy/ to the
#            server, rebuilds the Docker image and recreates the container only if something changed.
#   roweb    the plain static copy (no login, no engine): copies index.html, assets/ and src/.
#   all      both (the default).
#
#   --dry-run      show what would be copied; change nothing on the servers
#   --no-restart   copy the files but leave the container alone (ro only)
#   --allow-dirty  deploy even with uncommitted changes (otherwise it refuses, so the servers match a commit)
#   --test         run the core tests first and stop if they fail
#
# Where the servers are comes from .deploy.env (git-ignored; copy deploy.env.example). Nothing about your
# servers is kept in the repository. This script only moves the app's files: Apache, firewall, cron and
# fail2ban changes under deploy/ are copied across but not installed; it says when one of them changed
# (see deploy/README.md).
set -euo pipefail
cd "$(dirname "$0")"

TARGET=all DRY=0 RESTART=1 DIRTY=0 TEST=0
for a in "$@"; do
  case "$a" in
    ro|roweb|all) TARGET=$a ;;
    --dry-run) DRY=1 ;;
    --no-restart) RESTART=0 ;;
    --allow-dirty) DIRTY=1 ;;
    --test) TEST=1 ;;
    -h|--help) sed -n 2,19p "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "deploy.sh: unknown argument '$a' (try --help)" >&2; exit 2 ;;
  esac
done

[ -f .deploy.env ] || { echo "deploy.sh: no .deploy.env here. Copy deploy.env.example to .deploy.env and fill it in." >&2; exit 1; }
# shellcheck disable=SC1091
. ./.deploy.env
: "${DEPLOY_SSH:?set DEPLOY_SSH in .deploy.env}"
want() { [ "$TARGET" = all ] || [ "$TARGET" = "$1" ]; }
if want ro;    then : "${DEPLOY_RO_DIR:?set DEPLOY_RO_DIR in .deploy.env}"; fi
if want roweb; then : "${DEPLOY_ROWEB_DIR:?set DEPLOY_ROWEB_DIR in .deploy.env}"; fi
WEB_OWNER="${DEPLOY_WEB_OWNER:-}"

say() { printf '\n== %s\n' "$*"; }
# the files rsync listed (not the directories or its summary lines), at most 60 of them
show() { local n; n=$(grep -cvE '/$|^(sent |total size|Transfer starting)|^$' "$1" || true); { grep -vE '/$|^(sent |total size|Transfer starting)|^$' "$1" || true; } | head -60; [ "${n:-0}" -le 60 ] || echo "... and $((n - 60)) more"; echo "($n file(s) $([ "$DRY" = 1 ] && echo 'would be copied' || echo copied))"; }
die() { echo "deploy.sh: $*" >&2; exit 1; }

# What goes where. Never the tests, docs, vendor, chrome or git data.
RO_ITEMS=(index.html assets src tools serve.mjs deploy)
WEB_ITEMS=(index.html assets src)
EXCLUDES=(--exclude=.DS_Store --exclude=node_modules)
RO_EXCLUDES=("${EXCLUDES[@]}" --exclude=tools/docs)     # guides are on the disc already (assets/disc)

# --- is the tree fit to deploy?
if [ "$DIRTY" = 0 ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no >&2
  die "uncommitted changes (commit them, or use --allow-dirty)"
fi
BRANCH=$(git branch --show-current)
[ "$BRANCH" = main ] || echo "deploy.sh: note: deploying branch '$BRANCH', not main" >&2
echo "deploying $(git rev-parse --short HEAD) ($BRANCH)$([ "$DIRTY" = 1 ] && echo ' + uncommitted changes')  ->  $TARGET$([ "$DRY" = 1 ] && echo '  [dry run]')"

if [ "$TEST" = 1 ]; then
  say "tests"
  node --test tests/core/test-trust.mjs tests/core/test-proxy-mode.mjs tests/core/test-proxy-handlers.mjs \
    tests/core/test-browser-hardening.mjs tests/core/test-devparams.mjs tests/core/test-browser-lifecycle.mjs
fi

ssh -o BatchMode=yes -o ConnectTimeout=10 "$DEPLOY_SSH" true || die "cannot ssh to $DEPLOY_SSH"
RSYNC=(rsync -a -c --delete)   # -c: compare contents, not times (git rewrites times when switching branches)
[ "$DRY" = 1 ] && RSYNC+=(-n)
LOG=$(mktemp); trap 'rm -f "$LOG"' EXIT

# --- ro: the full deployment
if want ro; then
  say "ro: copying to $DEPLOY_SSH:$DEPLOY_RO_DIR"
  ssh "$DEPLOY_SSH" "test -d '$DEPLOY_RO_DIR/deploy'" || die "$DEPLOY_RO_DIR/deploy is not on the server: do the first-time install from deploy/README.md"
  "${RSYNC[@]}" -v "${RO_EXCLUDES[@]}" "${RO_ITEMS[@]}" "$DEPLOY_SSH:$DEPLOY_RO_DIR/" > "$LOG"
  show "$LOG"
  if grep -qE '^deploy/(apache-ro\.conf|install-apache\.sh|ro-firewall\.(sh|service)|riscos\.cron|backup\.sh|fail2ban/)' "$LOG"; then
    echo
    echo "NOTE: files that are installed outside the container changed (see the list above)."
    echo "      They are copied to the server but not installed; see deploy/README.md to install them."
  fi
  if [ "$DRY" = 0 ] && [ "$RESTART" = 1 ]; then
    say "ro: rebuilding and updating the container (only recreated if the image or settings changed)"
    ssh "$DEPLOY_SSH" "cd '$DEPLOY_RO_DIR/deploy' && chmod +x *.sh && docker compose build --quiet && docker compose up -d"
    printf 'waiting for the container to be healthy'
    ok=0
    for _ in $(seq 1 40); do
      s=$(ssh "$DEPLOY_SSH" "cd '$DEPLOY_RO_DIR/deploy' && docker compose ps --format '{{.Health}}' 2>/dev/null | head -1" || true)
      if [ "$s" = healthy ]; then ok=1; break; fi
      printf '.'; sleep 3
    done
    echo
    [ "$ok" = 1 ] || { ssh "$DEPLOY_SSH" "cd '$DEPLOY_RO_DIR/deploy' && docker compose logs --tail 30" >&2 || true; die "the container did not become healthy"; }
    echo "container healthy"
  elif [ "$DRY" = 0 ]; then
    echo "(--no-restart: files copied, container left as it is; rebuild with: cd $DEPLOY_RO_DIR/deploy && docker compose build && docker compose up -d)"
  fi
fi

# --- roweb: the static copy
if want roweb; then
  say "roweb: copying to $DEPLOY_SSH:$DEPLOY_ROWEB_DIR"
  # --exclude keeps files that exist only on the server (e.g. its .htaccess) from being deleted
  "${RSYNC[@]}" -v "${EXCLUDES[@]}" --exclude=.htaccess "${WEB_ITEMS[@]}" "$DEPLOY_SSH:$DEPLOY_ROWEB_DIR/" > "$LOG"
  show "$LOG"
  if [ "$DRY" = 0 ] && [ -n "$WEB_OWNER" ]; then
    ssh "$DEPLOY_SSH" "chown -R '$WEB_OWNER' '$DEPLOY_ROWEB_DIR'"
  fi
fi

# --- look at the result from outside (optional)
if [ "$DRY" = 0 ]; then
  say "checking"
  code() { curl -sk -o /dev/null -m 15 -w '%{http_code}' "$1" || true; }
  if want ro && [ -n "${DEPLOY_RO_URL:-}" ]; then
    c=$(code "$DEPLOY_RO_URL"); echo "ro:    $DEPLOY_RO_URL -> $c (401 = the login is asking, as it should)"
    [ "$c" = 401 ] || echo "deploy.sh: warning: expected 401 from the login-protected address" >&2
  fi
  if want roweb && [ -n "${DEPLOY_ROWEB_URL:-}" ]; then
    c=$(code "$DEPLOY_ROWEB_URL"); echo "roweb: $DEPLOY_ROWEB_URL -> $c"
    [ "$c" = 200 ] || echo "deploy.sh: warning: expected 200 from the static copy" >&2
  fi
fi
echo; echo "done."
