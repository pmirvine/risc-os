# Deploying the desktop at https://tsihome.mynetgear.com/ro/

The !Browse engine and HostFS run in a locked-down Docker container on the server. Apache
(already serving tsihome.mynetgear.com on 443) adds basic auth and proxies `/ro/` to it,
stripping the `/ro` prefix. Nothing new listens on a public port.

## Files

| File | What it is |
| --- | --- |
| `Dockerfile` | Node 22 + Chromium image; copies only `serve.mjs index.html assets src tools`; runs as `node` (uid 1000). |
| `Dockerfile.dockerignore` | (BuildKit reads it for `-f deploy/Dockerfile`, context = repo root.) Allow-list so tests, vendor, chrome, docs and git history never enter the build context. |
| `compose.yml` | The service: non-root, `cap_drop ALL`, `no-new-privileges`, read-only root fs, tmpfs `/tmp` (1 GB, counted in the 2 GB memory limit), fixed hostname `riscos`, `init`, 2 GB / 2 CPUs / 512 pids, shm 512 MB, published on `127.0.0.1:18371` only, own bridge `br-ro` (172.30.50.0/24, no inter-container traffic), DNS 1.1.1.1 and 9.9.9.9. |
| `chrome-seccomp.json` | Seccomp profile that lets Chromium create its sandbox (see Source below). |
| `apache-ro.conf` | Apache snippet: auth, proxy, WebSocket, MIME types. Keeps the placeholder `__SECRET__`. |
| `install-apache.sh` | Installs the snippet with the real secret, includes it from the 443 vhost, tests, reloads. |
| `ro-firewall.sh`, `ro-firewall.service` | Blocks the container from the host and from private networks. The rules name the bridge `br-ro` and are applied whether or not it exists yet. |
| `backup.sh`, `riscos.cron` | Nightly tarball of data and profile, 7 daily + 4 weekly kept. |
| `check-local.sh` | Builds the image and smoke-tests it where Docker runs (skips if it does not). |

## Source of the seccomp profile

`chrome-seccomp.json` is Playwright's `utils/docker/seccomp_profile.json`, downloaded from
`https://raw.githubusercontent.com/microsoft/playwright/main/utils/docker/seccomp_profile.json`
on 2026-10-05 (branch `main`; no release tag recorded). It is Docker's default profile plus
unprivileged user namespaces. It has not yet been run on the server; Task 7 validates it.

## Layout on the server

```
/srv/riscos/src/            the repo subset, rsynced: index.html assets src tools serve.mjs deploy
/srv/riscos/src/deploy/     compose.yml (build context `..` = /srv/riscos/src), scripts, units
/srv/riscos/data            HostFS "Server" drive          (bind mount, uid 1000)
/srv/riscos/profile         Chromium profile               (bind mount, uid 1000)
/srv/riscos/backups         nightly tarballs
/srv/riscos/.env            RISCOS_PROXY_SECRET (+ optional RISCOS_BROWSER_ARGS), mode 0600
```

Run `docker compose` from `/srv/riscos/src/deploy` (the seccomp path in `compose.yml` is relative
to the file). Everything below that is not source lives outside `src`, so an rsync of the source
never touches data, profile or secret.

## Install order (as root on the server; the controller does this)

1. Create directories and the secret:
   `mkdir -p /srv/riscos/{src,data,profile,backups}`; `chown 1000:1000 /srv/riscos/data /srv/riscos/profile`
   (the container user is uid 1000 and writes both).
   `umask 077; echo "RISCOS_PROXY_SECRET=$(openssl rand -hex 24)" > /srv/riscos/.env`
2. Copy the repo subset (`index.html assets src tools serve.mjs deploy`) to `/srv/riscos/src`
   (the unit and cron file refer to `/srv/riscos/src/deploy`).
3. Password: `htpasswd -B -c /etc/apache2/ro.htpasswd pirvine` (prompts; chmod 0640, group of the
   Apache user, e.g. `chgrp www /etc/apache2/ro.htpasswd`).
4. Re-check that 172.30.50.0/24 is free (`ip route`, `docker network ls`); if not, change the
   subnet in `compose.yml` and `GW` in `ro-firewall.sh`. Then start the container:
   `cd /srv/riscos/src/deploy && docker compose up -d --build`
   (`docker compose ps` should say healthy). This creates `br-ro`.
5. Firewall: `cp ro-firewall.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now ro-firewall`.
   The rules do not need `br-ro` to exist (iptables accepts the name early), so they hold even if
   the container starts after the firewall, or is recreated. Only Docker's `DOCKER-USER` chain
   must exist; the script waits up to 60 s for it and fails visibly if it never appears.
6. Apache: `./install-apache.sh` (backs up the vhost, writes `/etc/apache2/conf.d/ro.inc`,
   adds one `Include`, runs `apachectl configtest`, reloads only on `Syntax OK`).
7. Backups: `cp riscos.cron /etc/cron.d/riscos` (mode 0644) and run `./backup.sh` once.
8. Test from outside: the page loads after the password prompt; `/ro` redirects to `/ro/`.

## Sandbox fallback

By default `RISCOS_BROWSER_ARGS` is empty and Chromium tries its own sandbox under the seccomp
profile. If pages do not load and `docker logs riscos` shows sandbox or namespace errors, set
the fallback and recreate: add the line `RISCOS_BROWSER_ARGS=--no-sandbox --disable-dev-shm-usage` to
`/srv/riscos/.env` and run `docker compose up -d`.
The container is still non-root with all capabilities dropped, but the browser then has no
second layer. If SELinux turns out to be enforcing, add `:z` to the two bind mounts.
The seccomp path in `compose.yml` is relative; if compose does not read it, use an absolute path.

`install-apache.sh` reads `RO_VHOST_FILE`, `RO_INC_FILE`, `RO_ENV_FILE`, `RO_HTPASSWD_FILE`, `RO_APACHECTL`,
`RO_SYSTEMCTL` and `RO_OWNER` (setting `RO_OWNER` also skips the root check). They exist for testing only;
leave them unset on the server.

## Rotating secrets

* Proxy secret: replace only that line, keeping the rest of `/srv/riscos/.env`
  (such as `RISCOS_BROWSER_ARGS`):
  `sed -i "s|^RISCOS_PROXY_SECRET=.*|RISCOS_PROXY_SECRET=$(openssl rand -hex 24)|" /srv/riscos/.env`
  (do not use `echo >`, which would wipe the other lines). Then `docker compose up -d` and
  `./install-apache.sh` again: the Apache include carries the same secret and must be regenerated.
* Password: `htpasswd -B /etc/apache2/ro.htpasswd pirvine` (prompts; no reload needed).

## Updating Chromium

Chromium comes from Debian's package inside the image, so it only updates when the image is
rebuilt. Do this about monthly: `cd /srv/riscos/src/deploy && docker compose build --pull && docker compose up -d`.

## Rollback

1. `./ro-firewall.sh remove`; `systemctl disable --now ro-firewall`.
2. Restore the vhost: `cp -p /etc/apache2/vhosts.d/tsihome.mynetgear.com-le-ssl.conf.bak-<date> <same name without .bak>`;
   `rm /etc/apache2/conf.d/ro.inc`; `apachectl configtest && systemctl reload apache2`.
3. `docker compose down`; optionally `docker network rm riscos_ro_net`, `rm /etc/cron.d/riscos`.
4. Data stays in `/srv/riscos/data` and `/srv/riscos/profile` until you delete it.

## Known limits

* `apache-ro.conf` and `install-apache.sh` have not been run against a real httpd. The WebSocket
  rule is `ProxyPass ... upgrade=websocket`, which needs httpd 2.4.47+ (Leap 15.6 ships 2.4.58; check
  `httpd -v`). Modules needed: proxy, proxy_http, headers, auth_basic, authn_file. The snippet changes
  nothing outside `/ro`. It adds no MIME types: the app sets its own Content-Types, so the server's
  missing .woff2/.mjs/.wasm mappings do not matter for proxied responses.
* The seccomp profile and the default (sandboxed) Chromium are unproven on this host until Task 7.
* The firewall script drops the bridge's traffic to private ranges and to the host; it relies on
  Docker's `DOCKER-USER` chain and does not survive a Docker restart that flushes it
  (`systemctl restart ro-firewall` re-applies).
* `/tmp` is a 1 GB tmpfs and counts toward the 2 GB memory limit; large uploads and downloads of
  !Browse are staged there.
* Backups are on the same machine (`/srv` and `/root`); there is no off-site copy.
* The image is not pinned by digest and Chromium comes from Debian's package, so rebuilds move versions.
