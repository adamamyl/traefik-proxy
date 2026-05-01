# traefik-proxy

Shared Traefik reverse proxy for wolfcraig (and other hosts).

Handles: TLS termination, HTTP→HTTPS redirect, Let's Encrypt cert management, Tailscale-gated dashboard.

## First-time setup

```bash
cp .env-example .env
# Edit .env: set TRAEFIK_DOMAIN, CERT_RESOLVER, ACME_EMAIL
bash scripts/setup.sh
```

## Start (wolfcraig)

```bash
docker compose -f docker-compose.yml -f docker-compose.wolfcraig.yml up -d
```

## Start (local dev)

```bash
docker compose up -d
```

Local dev uses mkcert-issued certs — browser-trusted, stable across container restarts.
Add `.internal` hostnames to `/etc/hosts` pointing to `127.0.0.1`.

### Local TLS setup (macOS, once per machine)

```bash
brew install mkcert
bash scripts/setup-local-tls
docker compose up -d
```

Generates `certs/local.crt` + `certs/local.key` (gitignored), writes `dynamic/tls-local.yml`,
and installs the mkcert CA into your macOS system keychain. Re-running is safe (idempotent).

### Quick workaround (trust Traefik's built-in self-signed cert)

If you can't use mkcert, trust the self-signed cert directly — but re-run after every container restart:

```bash
bash scripts/trust-cert
```

## Cert resolver progression

| Value | Use |
|---|---|
| `lestaging` | Testing — "Fake LE" certs, rate-limit safe |
| `leprod` | Production — browser-trusted certs |

Start with `lestaging`. Switch to `leprod` in `.env` once routing confirmed working.
See `TRAEFIK.md` for switchover steps.

## Dashboard

Accessible at `https://${TRAEFIK_DOMAIN}` from Tailscale IPs (`100.64.0.0/10`) only.

## Adding services

See `TRAEFIK.md`.
