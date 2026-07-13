# Deploying the Acting admin panel → acting.loankard.com (94.136.189.234)

**Confirmed server topology** (from live `docker ps` on 2026-07-12):
- Existing project `fleetsathi`/`fms`: containers `fms-app`, `fms-cron`,
  `fms-backup`, `fleetsathi-postgres`, and **`fms-caddy`** (image
  `caddy:2-alpine`) — `fms-caddy` owns host ports 80/443 and reads a static
  Caddyfile (`docker inspect` its mounts to find the exact path).
- DNS for `acting.loankard.com` already points at this server.

Because Caddy runs in its **own container**, `reverse_proxy 127.0.0.1:3100`
would not work (127.0.0.1 inside `fms-caddy` means itself, not the host). The
fix: put `acting-admin` and `fms-caddy` on a shared Docker network and
reference it by container name. `docker network connect` attaches a network
to an already-running container **without restarting it** — `fms-caddy` and
your other project are never touched.

## 1. Get the code onto the server (done)

```bash
git clone https://github.com/CrypDG/Acting.git ~/acting
```

## 2. Create the shared network and join it to fms-caddy (one-time, non-disruptive)

```bash
docker network create acting-shared
docker network connect acting-shared fms-caddy
```
`docker network connect` on a running container doesn't restart it or drop
its existing connections — this is safe to run against `fms-caddy` live.

## 3. Build & run the admin panel

```bash
cd ~/acting
git pull                      # if you cloned before this compose update
docker compose up -d --build
docker compose ps             # expect "acting-admin" Up
curl -I http://127.0.0.1:3100/login   # expect HTTP 200 (host-side sanity check)
```

## 4. Confirmed: the real Caddyfile

From `docker inspect fms-caddy`:
```
/root/fleetsathi/Caddyfile -> /etc/caddy/Caddyfile
```
Host path to edit: **`/root/fleetsathi/Caddyfile`**.
Container path (for reload): **`/etc/caddy/Caddyfile`** (Caddy's default, so
`fms-caddy` was started with a plain `caddy run --config /etc/caddy/Caddyfile`
or equivalent — no non-standard flags to worry about).

## 5. Append the site block

**Append only** — never overwrite `/root/fleetsathi/Caddyfile`, it serves
your live `fleetsathi` project too:
```bash
cat >> /root/fleetsathi/Caddyfile <<'EOF'

acting.loankard.com {
    reverse_proxy acting-admin:3100
}
EOF
```
Then reload just that one container's config, zero downtime, other sites
untouched:
```bash
docker exec fms-caddy caddy reload --config /etc/caddy/Caddyfile
```

## 6. Verify

```bash
curl -I https://acting.loankard.com/login    # expect HTTP 200, valid cert
```
Open `https://acting.loankard.com` and log in with an admin account
(`admin@acting.dev` / `Acting123!`).

## Updating later

```bash
cd ~/acting && git pull
docker compose up -d --build
```
Only rebuilds/restarts `acting-admin` — nothing else on the server is
touched, and the network attachment persists across rebuilds.

## Notes
- Container runs as non-root; its 3100 port is only exposed to
  `127.0.0.1` (host-side testing) and the `acting-shared` network (for
  `fms-caddy`) — never directly to the internet.
- `docker-compose.yml` sets `name: acting` (its own Compose project
  namespace), so `docker compose down` here can never affect `fleetsathi`/
  `fms` containers even if run from a parent directory.
- No server secrets in the image — privileged actions go through Supabase
  edge functions (service-role key never leaves Supabase).
