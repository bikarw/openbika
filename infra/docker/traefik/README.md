Edge proxy for workloads started by the worker with `OPENBIKA_TRAEFIK_ROUTING=true`.

Set **`OPENBIKA_TRAEFIK_ACME_EMAIL`** for Let’s Encrypt (Compose injects `TRAEFIK_CERTIFICATESRESOLVERS_LETSENCRYPT_ACME_EMAIL`; copy **`../.env.example`** → **`../.env`** in this folder).

Start Traefik alongside the usual stack (**from `infra/docker`**):


```sh
touch traefik/dynamic/acme.json && chmod 600 traefik/dynamic/acme.json
docker compose --profile edge up -d traefik
```

Expose **`OPENBIKA_TRAEFIK_ROUTING=true`** plus **either**:

- **`OPENBIKA_PUBLIC_BASE_DOMAIN`** on the worker/API (your DNS **A / AAAA (+ wildcard)** for that zone must aim at Traefik — HTTP‑01 validation), **or**
- **`OPENBIKA_INGRESS_FREE_DNS_ZONE=nip.io`** or **`sslip.io`** with **`OPENBIKA_INGRESS_PUBLIC_IPV4`** — use **`loopback`** for Docker Traefik on the same laptop, or **`auto`** / a literal egress IPv4 on a VPS (embed that routable IPv4 in the free-DNS hostname). Hostnames: **`{label}.{IPv4}.nip.io`** or **`{label}-{dotted-IPv4-with-dashes}.sslip.io`** (no registrar). HTTP‑01 must still reach `:80`; purely private egress will not validate with Let’s Encrypt.

Set the same nip/sslip vars on the **API** (`OPENBIKA_EDGE_PUBLIC_BASE_DOMAIN` unchanged) when you want **`workload.edge`** hints for the dashboard.

On a **dev laptop**, set **`OPENBIKA_INGRESS_PUBLIC_IPV4=loopback`** (alias for **127.0.0.1**) on **API + worker**. If you use **`auto`** instead, nip hostnames embed your **WAN** address and HTTP from this machine will usually miss Docker Traefik entirely.

### nip/sslip HTTP vs HTTPS

By default, when **`OPENBIKA_INGRESS_FREE_DNS_ZONE`** is set on the worker, OpenBika **does not** attach Traefik’s `redirect-to-https` middleware so **HTTP on port 80** reaches the workload immediately (URLs in `ingressRoutes` use **`http://`**). Let’s Encrypt can still mint certs on **443**, but forcing browsers through **HTTPS before a cert exists** tends to hang. To restore owned-domain-like behavior (**301 to HTTPS**, **`https://` links**) on nip/sslip installs, set **`OPENBIKA_TRAEFIK_SECURE_INGRESS=true`** on the **worker** (and API if you want consistent hints).

**Rebuild/redeploy the workload container** after changing ingress env vars so Docker labels refresh.
