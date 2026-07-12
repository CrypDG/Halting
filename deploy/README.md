# Deploying the Halting admin panel → halt.loankard.com (94.136.189.234)

**Confirmed server topology** (from live `docker ps` on 2026-07-12):
- Existing project `fleetsathi`/`fms`: containers `fms-app`, `fms-cron`,
  `fms-backup`, `fleetsathi-postgres`, and **`fms-caddy`** (image
  `caddy:2-alpine`) — `fms-caddy` owns host ports 80/443 and reads a static
  Caddyfile (`docker inspect` its mounts to find the exact path).
- DNS for `halt.loankard.com` already points at this server.

Because Caddy runs in its **own container**, `reverse_proxy 127.0.0.1:3100`
would not work (127.0.0.1 inside `fms-caddy` means itself, not the host). The
fix: put `halting-admin` and `fms-caddy` on a shared Docker network and
reference it by container name. `docker network connect` attaches a network
to an already-running container **without restarting it** — `fms-caddy` and
your other project are never touched.

## 1. Get the code onto the server (done)

```bash
git clone https://github.com/CrypDG/Halting.git ~/halting
```

## 2. Create the shared network and join it to fms-caddy (one-time, non-disruptive)

```bash
docker network create halting-shared
docker network connect halting-shared fms-caddy
```
`docker network connect` on a running container doesn't restart it or drop
its existing connections — this is safe to run against `fms-caddy` live.

## 3. Build & run the admin panel

```bash
cd ~/halting
git pull                      # if you cloned before this compose update
docker compose up -d --build
docker compose ps             # expect "halting-admin" Up
curl -I http://127.0.0.1:3100/login   # expect HTTP 200 (host-side sanity check)
```

## 4. Find the real Caddyfile fms-caddy is using

```bash
docker inspect fms-caddy --format '{{json .Mounts}}' | node -e "process.stdin.resume();process.stdin.on('data',d=>console.log(JSON.parse(d)))"
# or just:
docker inspect fms-caddy --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'

# also grab the exact startup command, so the reload command matches it:
docker inspect fms-caddy --format '{{json .Config.Cmd}}'
```
This tells us the **host path** to edit and the **container path** to pass
to `caddy reload --config`. Send me this output before the next step — I'll
give you the exact append + reload commands rather than guessing paths on a
container that's serving a live project.

## 5. Append the site block (once path is confirmed)

Append (never overwrite) the contents of [`Caddyfile`](Caddyfile) to the end
of the real Caddyfile found in step 4:
```
halt.loankard.com {
    reverse_proxy halting-admin:3100
}
```
Then reload just that one container's config, zero downtime, other sites
untouched:
```bash
docker exec fms-caddy caddy reload --config <container-path-from-step-4>
```

## 6. Verify

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
Only rebuilds/restarts `halting-admin` — nothing else on the server is
touched, and the network attachment persists across rebuilds.

## Notes
- Container runs as non-root; its 3100 port is only exposed to
  `127.0.0.1` (host-side testing) and the `halting-shared` network (for
  `fms-caddy`) — never directly to the internet.
- `docker-compose.yml` sets `name: halting` (its own Compose project
  namespace), so `docker compose down` here can never affect `fleetsathi`/
  `fms` containers even if run from a parent directory.
- No server secrets in the image — privileged actions go through Supabase
  edge functions (service-role key never leaves Supabase).
