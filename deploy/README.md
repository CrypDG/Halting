# Deploying Acting on the Contabo server (94.136.189.234)

Two containers, both behind the existing `fms-caddy` reverse proxy, alongside
the untouched `fleetsathi` project:

| Hostname | Container | Purpose |
|---|---|---|
| `acting.loankard.com` | `acting-landing` (:3200) | Public marketing website |
| `admin.acting.loankard.com` | `acting-admin` (:3100) | Staff operations panel |

Both containers join the `acting-shared` Docker network so `fms-caddy` can
reach them by name. `fms-caddy` mounts `/root/fleetsathi/Caddyfile` at
`/etc/caddy/Caddyfile` — because it's a **single-file bind mount**, config
changes need a container **restart**, not just `caddy reload`.

## 1. DNS (one new record — do this first)

`acting.loankard.com` already points at the server. Add:
```
admin.acting.loankard.com   A   94.136.189.234
```
Wait for it to resolve before step 4 or Caddy can't issue its TLS cert.

## 2. Pull code + build both containers

```bash
cd ~/halting
git pull
# acting-shared network already exists from the earlier admin deploy; if not:
#   docker network create acting-shared && docker network connect acting-shared fms-caddy
docker compose up -d --build
docker compose ps                          # expect acting-admin + acting-landing Up
curl -I http://127.0.0.1:3200/             # website — expect 200
curl -I http://127.0.0.1:3100/login        # admin — expect 200
```

## 3. Swap the Caddy site blocks

Edit `/root/fleetsathi/Caddyfile`. Remove the old single `acting.loankard.com`
block (the one pointing at `acting-admin:3100`) and append the two blocks from
[`Caddyfile`](Caddyfile):
```bash
cp /root/fleetsathi/Caddyfile /root/fleetsathi/Caddyfile.bak
# remove the previous acting block:
sed -i '/^acting\.loankard\.com {$/,/^}$/d' /root/fleetsathi/Caddyfile
cat >> /root/fleetsathi/Caddyfile <<'EOF'

acting.loankard.com {
    reverse_proxy acting-landing:3200
}

admin.acting.loankard.com {
    reverse_proxy acting-admin:3100
}
EOF
```

## 4. Restart Caddy (single-file mount ⇒ restart, not reload)

```bash
docker restart fms-caddy
sleep 5
curl -I https://acting.loankard.com/            # website — 200
curl -I https://admin.acting.loankard.com/login # admin — 200
```

## Updating later
```bash
cd ~/halting && git pull && docker compose up -d --build
```
Rebuilds both Acting containers; fleetsathi and Caddy config are untouched.
