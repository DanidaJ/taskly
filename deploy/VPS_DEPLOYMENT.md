# 🚀 Taskly VPS Deployment Guide

Taskly deploys via **GitHub Actions → GHCR → VPS**. Every push to the
`production` branch builds both Docker images, pushes them to the GitHub
Container Registry, then SSHes into the VPS and runs `docker compose pull && up`.

- **Domain:** `taskly.danidajay.com`
- **VPS:** `168.231.73.185` (same box as softspace)
- **Reverse proxy:** shared `/root/nginx` container on the external
  `portfolio-net` network (already running)

Steps 0–2 are a **one-time setup**. After that, deploying is just
`git push origin production`.

---

## Architecture

```
Browser
  │  https://taskly.danidajay.com
  ▼
VPS nginx (/root/nginx, portfolio-net)
  ├── /       → taskly-client:80   (React SPA, served by nginx)
  ├── /api    → taskly-server:8000 (FastAPI, routes under /api/v1)
  └── /health → taskly-server:8000/health
```

- Frontend `VITE_*` values are **baked into the image at build time** (GitHub
  secrets). They are NOT needed on the VPS.
- `VITE_API_URL` is the site origin (`https://taskly.danidajay.com`) — the app
  appends `/api/v1` itself, so it must **not** include a `/api` suffix.
- Backend secrets live in `/root/taskly/.env` (runtime only).
- Firebase Admin credentials are bind-mounted at runtime, never baked in.

---

## Step 0: Configure Supabase for Production

**⚠️ CRITICAL** — do this before the first deploy or email/auth links break.

1. Supabase Dashboard → **Authentication → URL Configuration**.
2. **Site URL:** `https://taskly.danidajay.com`
3. **Redirect URLs** — add:
   ```
   https://taskly.danidajay.com/**
   https://taskly.danidajay.com/reset-password
   http://localhost:5173/**   (keep for local dev)
   http://localhost:3000/**   (keep for local dev)
   ```
4. Save.

> Without this, password-reset / verification links redirect to localhost.

---

## Step 1: Configure GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
The workflow (`.github/workflows/deploy.yml`) needs:

| Secret | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `VPS_HOST` | `168.231.73.185` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | Private SSH key that can log into the VPS |
| `GHCR_PAT` | GitHub PAT with `read:packages` (VPS pulls images) |

> `VITE_API_URL` is hardcoded to `https://taskly.danidajay.com` in the workflow,
> so it is not a secret. `GITHUB_TOKEN` is provided automatically for pushing to
> GHCR — you don't create it.

### Make the SSH key work
The public half of `VPS_SSH_KEY` must be in `/root/.ssh/authorized_keys` on the VPS.

### GHCR PAT
Create at GitHub → Settings → Developer settings → **Personal access tokens
(classic)** with the `read:packages` scope. Used by the VPS to pull images. If
you keep the GHCR packages **public**, the VPS `docker login` is optional but
harmless.

---

## Step 2: One-Time VPS Setup

SSH in: `ssh root@168.231.73.185`

### 2.1 Create the app directory
```bash
mkdir -p /root/taskly
cd /root/taskly
```

### 2.2 Upload deploy files (run these from your LOCAL machine)
```bash
# Production compose
scp deploy/docker-compose.yml root@168.231.73.185:/root/taskly/docker-compose.yml

# Firebase Admin credentials (gitignored secret, from backend/)
scp backend/firebase-credentials.json root@168.231.73.185:/root/taskly/firebase-credentials.json
```

> ⚠️ **Do NOT upload `taskly.conf` yet.** The reverse proxy resolves upstream
> hostnames when it loads its config. If `taskly.conf` references the
> `taskly-client` / `taskly-server` containers before they exist — or before the
> SSL cert exists — `nginx -t` fails and the **entire** proxy refuses to start,
> taking down every other site on the box. `taskly.conf` goes on LAST (Step 2.7),
> after the containers are up and the cert is issued.

### 2.3 Create the backend `.env` on the VPS
```bash
cd /root/taskly
nano .env    # paste from deploy/.env.example and fill in real values
```
See [.env.example](.env.example) for the full list. These are **backend runtime**
vars only (Supabase keys, Mistral, Firebase web config, notifications).

### 2.4 Log the VPS into GHCR (only if packages are private)
```bash
echo <YOUR_GHCR_PAT> | docker login ghcr.io -u danidaj --password-stdin
```

### 2.5 Start the taskly containers (BEFORE touching nginx)
The reverse proxy needs these containers to exist before it will accept
`taskly.conf`, so bring them up first.
```bash
cd /root/taskly
docker login ghcr.io -u danidaj      # if the GHCR packages are private
docker compose up -d
docker ps | grep taskly              # taskly-client + taskly-server, both Up
docker logs --tail 15 taskly-client  # ends at "ready for start up", NO [emerg]
```

### 2.6 Get the SSL certificate
```bash
ls -l /etc/letsencrypt/live/taskly.danidajay.com/ 2>&1   # skip if it already exists

# Free port 80 so certbot standalone can bind it (~20s blip on other sites)
cd /root/nginx && docker compose stop
certbot certonly --standalone -d taskly.danidajay.com
cd /root/nginx && docker compose up -d
```

### 2.7 Add taskly.conf LAST, then validate before reloading
```bash
# From LOCAL:
scp deploy/taskly.conf root@168.231.73.185:/root/nginx/conf.d/taskly.conf

# On the VPS — the proxy container is named `nginx-reverse-proxy`:
docker exec nginx-reverse-proxy nginx -t     # MUST say "test is successful"
docker exec nginx-reverse-proxy nginx -s reload
```

> If `nginx -t` fails, **do not reload** and **do not restart** the proxy — the
> already-running instance keeps serving your other sites off the old config.
> Fix (or `rm`) `taskly.conf` first. `taskly.conf` uses a Docker `resolver` so a
> stopped taskly container only 502s taskly instead of taking the proxy down,
> but a missing SSL cert will still fail startup — hence cert before conf.

---

## Step 3: Deploy

```bash
# From local — release by pushing to the production branch
git checkout production      # create it once: git checkout -b production
git merge main
git push origin production
```

Watch the run under the repo's **Actions** tab. On success it will have built,
pushed, and restarted the containers on the VPS automatically.

---

## Step 4: Verify

```bash
# On the VPS
docker ps | grep taskly            # taskly-client + taskly-server, both Up
docker logs taskly-server
docker logs taskly-client

# Health check
curl https://taskly.danidajay.com/health      # {"status":"healthy","version":"..."}
```

Then open **https://taskly.danidajay.com** and confirm login + AI planning work.

---

## 🔧 Useful Commands

```bash
cd /root/taskly

# Logs
docker compose logs -f
docker logs -f taskly-server
docker logs -f taskly-client

# Manual redeploy (pull latest images pushed by CI)
docker login ghcr.io -u danidaj   # if private
docker compose pull
docker compose up -d
docker image prune -f

# Restart / stop
docker compose restart
docker compose down
```

---

## 🐛 Troubleshooting

**502 Bad Gateway**
1. `docker ps` — are `taskly-client` / `taskly-server` up?
2. `docker network inspect portfolio-net` — are both containers attached?
3. `docker exec nginx nginx -t` — is the nginx config valid?

**API not responding**
1. `docker logs taskly-server`
2. Check `/root/taskly/.env` values.
3. `docker exec taskly-server curl -f localhost:8000/health`

**CORS errors in the browser**
- `CORS_ORIGINS` must include `https://taskly.danidajay.com` — it's set in
  `docker-compose.yml` (and `.env`). Restart the server after changing it.

**Frontend calling localhost / wrong API**
- The `VITE_*` values are baked at build time. If they're wrong, fix the GitHub
  secrets and re-run the workflow (rebuild) — editing the VPS won't help.

**SSL issues**
```bash
certbot certificates
certbot renew
```

**VPS can't pull images (`denied` / `unauthorized`)**
- Re-run `docker login ghcr.io -u danidaj` with a `read:packages` PAT, or make
  the GHCR packages public.

---

## 📁 File Structure on VPS

```
/root/
├── nginx/
│   └── conf.d/
│       ├── softspace.conf
│       └── taskly.conf            # NEW
└── taskly/                        # NEW
    ├── docker-compose.yml         # from deploy/docker-compose.yml
    ├── .env                       # backend runtime secrets
    └── firebase-credentials.json  # Firebase Admin key (mounted, not baked)
```

---

## ✅ Deployment Checklist

- [ ] Supabase Site URL + Redirect URLs set (Step 0)
- [ ] DNS: `taskly.danidajay.com` → `168.231.73.185`
- [ ] GitHub secrets added (Step 1)
- [ ] VPS SSH key authorized
- [ ] `/root/taskly/docker-compose.yml` uploaded
- [ ] `/root/taskly/.env` created
- [ ] `/root/taskly/firebase-credentials.json` uploaded
- [ ] `taskly.conf` in `/root/nginx/conf.d/`
- [ ] SSL certificate obtained
- [ ] nginx reloaded
- [ ] Pushed to `production`, Actions run green
- [ ] `https://taskly.danidajay.com/health` returns healthy
- [ ] App loads, login + AI planning work
