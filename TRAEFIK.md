# Adding services to Traefik

Traefik discovers services via Docker labels. No config files to edit in this repo — each service opts itself in.

## Quick start

1. Service must be on the `traefik-public` network (as well as its own internal network).
2. Add `traefik.enable=true` label.
3. Add router + service labels for your hostname and port.

```yaml
services:
  myapp:
    image: myapp:latest
    restart: unless-stopped
    networks:
      - myapp_internal    # for DB, cache, etc.
      - traefik-public    # for Traefik to reach it
    labels:
      - traefik.enable=true
      - traefik.http.routers.myapp.rule=Host(`myapp.example.com`)
      - traefik.http.routers.myapp.entrypoints=websecure
      - traefik.http.routers.myapp.tls=true
      - traefik.http.services.myapp.loadbalancer.server.port=8080

networks:
  myapp_internal:
  traefik-public:
    external: true
```

`tls=true` with no `certresolver` → uses the global default set in `docker-compose.wolfcraig.yml`
(`lestaging` by default; switch to `leprod` when ready for production certs).

---

## www → apex redirect

```yaml
labels:
  # Apex — serves content
  - traefik.http.routers.myapp.rule=Host(`example.com`)
  - traefik.http.routers.myapp.entrypoints=websecure
  - traefik.http.routers.myapp.tls=true
  - traefik.http.services.myapp.loadbalancer.server.port=8080
  # www — permanent redirect to apex
  - traefik.http.routers.myapp-www.rule=Host(`www.example.com`)
  - traefik.http.routers.myapp-www.entrypoints=websecure
  - traefik.http.routers.myapp-www.tls=true
  - traefik.http.routers.myapp-www.middlewares=myapp-www-redirect
  - traefik.http.routers.myapp-www.service=myapp
  - traefik.http.middlewares.myapp-www-redirect.redirectregex.regex=^https://www\.(.+)
  - traefik.http.middlewares.myapp-www-redirect.redirectregex.replacement=https://$${1}
  - traefik.http.middlewares.myapp-www-redirect.redirectregex.permanent=true
```

---

## Path-based routing (multiple services, one hostname)

Split traffic between services on the same host by path.
Traefik auto-prioritises: longer/more specific rules win without explicit `priority`.

```yaml
# Panel service — catches all paths on panel.example.com
panel:
  labels:
    - traefik.enable=true
    - traefik.http.routers.panel.rule=Host(`panel.example.com`)
    - traefik.http.routers.panel.entrypoints=websecure
    - traefik.http.routers.panel.tls=true
    - traefik.http.services.panel.loadbalancer.server.port=8001

# Webhook service — catches /webhook/* on the same host (wins due to longer rule)
webhook:
  labels:
    - traefik.enable=true
    - traefik.http.routers.webhook.rule=Host(`panel.example.com`) && PathPrefix(`/webhook/`)
    - traefik.http.routers.webhook.entrypoints=websecure
    - traefik.http.routers.webhook.tls=true
    - traefik.http.services.webhook.loadbalancer.server.port=8004
```

---

## Path rewrite (strip prefix before forwarding)

```yaml
labels:
  - traefik.http.routers.myapp.rule=Host(`example.com`) && PathPrefix(`/api/`)
  - traefik.http.routers.myapp.middlewares=myapp-strip-prefix
  - traefik.http.middlewares.myapp-strip-prefix.stripprefix.prefixes=/api
```

For regex-based rewrites (e.g. strip a dynamic prefix):

```yaml
labels:
  - traefik.http.middlewares.myapp-rewrite.replacepathregex.regex=^/prefix/(.*)$$
  - traefik.http.middlewares.myapp-rewrite.replacepathregex.replacement=/$$1
```

Note: `$$` in compose labels = literal `$` in the Traefik label.

---

## Security headers

A `security-headers` middleware is defined in `dynamic/middlewares.yml`.
Reference it as `security-headers@file`:

```yaml
labels:
  - traefik.http.routers.myapp.middlewares=security-headers@file
```

This adds HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.
For custom CSP (e.g. map embeds, external fonts), define a per-service middleware inline:

```yaml
labels:
  - traefik.http.middlewares.myapp-headers.headers.customResponseHeaders.Content-Security-Policy=default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org
  - traefik.http.middlewares.myapp-headers.headers.stsSeconds=63072000
  - traefik.http.routers.myapp.middlewares=myapp-headers
```

---

## Tailscale-only routes (dashboard, admin)

```yaml
labels:
  - traefik.http.routers.admin.rule=Host(`admin.example.com`)
  - traefik.http.routers.admin.middlewares=tailscale-only@file
```

`tailscale-only@file` allows only `100.64.0.0/10` (Tailscale CGNAT range).

---

## Switching from staging to production certificates

When you've verified staging certs work (browser shows cert error from "Fake LE" CA — that's expected):

1. Edit `.env` in traefik-proxy: `CERT_RESOLVER=leprod`
2. Delete `acme-staging.json` from the letsencrypt volume (or let acme-prod.json start fresh)
3. Restart Traefik: `docker compose -f docker-compose.yml -f docker-compose.wolfcraig.yml up -d traefik`

---

## Diagnostics

```bash
# View Traefik logs
docker compose logs -f traefik

# List discovered routers/services (requires dashboard enabled)
curl -s http://localhost:8080/api/http/routers | jq '.[] | {name, rule, status}'

# Check which cert resolver a router is using
curl -s http://localhost:8080/api/http/routers | jq '.[] | select(.name=="ghost@docker") | .tls'
```

Dashboard is accessible at `https://${TRAEFIK_DOMAIN}` from Tailscale IPs only.
