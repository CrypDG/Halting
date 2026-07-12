# Deploying the Halting admin panel → halt.loankard.com (94.136.189.234)

**DNS is already correct** — `halt.loankard.com` resolves to `94.136.189.234`,
so no registrar step needed.

**The server already runs Caddy** and has another project on it. Everything
below is additive: a new Docker container + a new Caddy site block. Nothing
here touches your existing project, its containers, or its Caddy config.

## 1. Get the code onto the server

```bash
git clone <your-repo> halting && cd halting     # or scp/rsync the folder
```
Put it anywhere that isn't your existing project's directory, e.g. `~/halting`.

## 2. Check for port conflicts (30 seconds, read-only)

```bash
docker ps                    # see what's already running — don't touch it
ss -tlnp | grep 3100         # is port 3100 already taken on the host?
```
If `3100` is free, skip to step 3. If it's taken, edit `docker-compose.yml`
and change the **host** side of the port mapping, e.g.:
```yaml
ports:
  - "127.0.0.1:3200:3100"   # host:container — only the first number matters
```
(then use that port instead of 3100 in the Caddy block in step 4).

## 3. Build & run

```bash
docker compose up -d --build
```
This builds from the repo root (needed for the `@halting/shared` workspace)
and starts a container named `halting-admin`, bound to **127.0.0.1:3100 only**
— not reachable from the internet directly, and won't collide with your other
project's exposed ports. Verify:
```bash
docker compose logs -f admin
curl -I http://127.0.0.1:3100/login     # expect HTTP 200
```

## 4. Add the Caddy site block (additive, no edits to existing blocks)

Find out how Caddy is configured on this host — it's one of two setups:

**A. Plain Caddyfile** (most common) — find it:
```bash
find / -iname "Caddyfile" 2>/dev/null
```
Then **append** (don't replace anything) the contents of
[`Caddyfile`](Caddyfile) to the end of that file:
```
halt.loankard.com {
    reverse_proxy 127.0.0.1:3100
}
```
Reload (zero downtime, doesn't touch other sites):
```bash
caddy fmt --overwrite /path/to/Caddyfile   # optional sanity check
caddy reload --config /path/to/Caddyfile
# or, if Caddy runs as a system service:
sudo systemctl reload caddy
# or, if Caddy runs in Docker:
docker exec <caddy-container-name> caddy reload --config /etc/caddy/Caddyfile
```

**B. Caddy Docker Proxy** (routes purely from container labels, common in
Coolify/Dokploy-style setups) — check:
```bash
docker inspect <caddy-container-name> --format '{{.Config.Image}}'
# if it's lucaslorentz/caddy-docker-proxy, use labels instead of a Caddyfile
```
If so, edit `docker-compose.yml`: delete the `ports:` block on the `admin`
service and uncomment the `networks:`/`labels:` block already sketched at the
bottom of that file (join whatever Docker network the existing Caddy
container uses — check with `docker inspect <caddy-container-name> | grep -A3 Networks`).
Then `docker compose up -d --build` again — Caddy picks up the new labels
automatically, no reload needed.

Not sure which applies? Run:
```bash
docker ps --filter ancestor=caddy --filter ancestor=lucaslorentz/caddy-docker-proxy
```
and tell me the output — I'll give the exact next command.

## 5. Verify

```bash
curl -I https://halt.loankard.com/login    # expect HTTP 200, valid cert
```
Open `https://halt.loankard.com` and log in with an admin account
(`admin@halting.dev` / `Halting123!`).

## Updating later

```bash
cd ~/halting && git pull
docker compose up -d --build
```
Only rebuilds/restarts the `halting-admin` container — everything else on the
server is untouched.

## Notes
- Container runs as non-root, binds to loopback only — Caddy handles TLS.
- `docker-compose.yml` sets `name: halting` (its own Compose project
  namespace), so `docker compose down` here can never affect containers
  belonging to your other project even if invoked from a parent directory.
- No server secrets in the image — privileged actions go through Supabase
  edge functions (service-role key never leaves Supabase).
