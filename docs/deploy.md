# Deployment: GitHub Actions → o2switch

This repo auto-deploys to o2switch on every push to `master`:

- `frontend/**` changes → build the Vue app and rsync `dist/` to the frontend document root
- `backend/**` changes → build the Nest app, rsync `dist/` to the backend app root, then `npm ci --omit=dev` and restart the Node.js app on the server

Workflow files: [.github/workflows/frontend-build.yml](../.github/workflows/frontend-build.yml), [frontend-deploy.yml](../.github/workflows/frontend-deploy.yml), [frontend-pr-check.yml](../.github/workflows/frontend-pr-check.yml), [backend-build.yml](../.github/workflows/backend-build.yml), [backend-deploy.yml](../.github/workflows/backend-deploy.yml), [backend-pr-check.yml](../.github/workflows/backend-pr-check.yml).

o2switch requires the connecting IP to be whitelisted before SSH will accept a connection, so each deploy run adds the GitHub Actions runner's IP to the whitelist via the cPanel API (`SshWhitelist/add`), rsyncs over SSH, then removes only that one entry afterwards (`SshWhitelist/remove`, `if: always()` so it runs even on failure). It only ever touches the entry it just added — it never calls `remove_all`, so any IPs you've whitelisted manually (e.g. your own machine) are left alone. Note: o2switch caps the whitelist at 5 entries total, per their [SSH whitelist FAQ](https://faq.o2switch.fr/cpanel/outils/exception-parefeu/).

## Part A — cPanel setup

Do this section first; you need the values it produces to fill in the GitHub secrets in Part B.

### 1. Find your server hostname

cPanel home page → **Informations générales du compte**. Note the **Serveur** value, e.g. `c123.o2switch.net`. This becomes the `CPANEL_SERVER` secret.

### 2. Create a cPanel API token

cPanel → **Sécurité** → **Gérer les jetons API** → create a token (e.g. `github-actions`) and copy it immediately — it's shown once.

- `CPANEL_USERNAME` = your cPanel login username
- `CPANEL_API_TOKEN` = the token you just created

### 3. Generate an SSH deploy key and authorize it

Generate a dedicated key pair (don't reuse a personal one). On Windows PowerShell:

```powershell
ssh-keygen -t ed25519 -C "github-actions-deploy" -f "$HOME\gh-deploy-key"
```

Press Enter at the passphrase prompts to leave it empty (a passphrase would block the non-interactive CI login).

- cPanel → **Sécurité** → **Accès SSH** → **Gérer les clés SSH** → **Importer une clé** → paste the contents of `gh-deploy-key.pub`
- Click **Authorize** on the imported key
- Confirm SSH access is enabled for the account

Then:
- `SSH_KEY` GitHub secret = the full contents of the **private** key file (`gh-deploy-key`, including the `BEGIN`/`END` lines)
- Delete both local key files once they're stored in GitHub — don't leave the private key on disk.

### 4. Set up the frontend domain

cPanel → **Domaines** → confirm the domain's document root. That path is the `FRONTEND_REMOTE_PATH` secret (e.g. `/home/<user>/jhemery.xyz` for an addon domain, or `/home/<user>/public_html` if it's the account's main domain).

### 5. Set up the backend as a Node.js App

cPanel → **Logiciel** → **Setup Node.js App** → **Create Application**:

- Node version: 24 (or closest available)
- Application mode: Production
- Application root: e.g. `api.jhemery.xyz` → `BACKEND_REMOTE_PATH` = `/home/<user>/api.jhemery.xyz`
- Application URL: `api.jhemery.xyz`
- Application startup file: `main.js`

After creation, cPanel shows a command like:

```
source /home/<user>/nodevenv/api.jhemery.xyz/24/bin/activate && cd /home/<user>/api.jhemery.xyz
```

Copy the `source .../bin/activate` part — that exact path is the `BACKEND_APP_ENTRY` secret. The deploy workflow uses it to run `npm ci` with the right Node version and to restart the app (via `tmp/restart.txt`, the standard Passenger reload convention).

### 6. Create `backend/.env` on the server

`backend/.env` is gitignored and excluded from every rsync deploy on purpose, so it must exist on the server independently:

- cPanel **File Manager** (or SSH, once your key is authorized) → go to `BACKEND_REMOTE_PATH` → create `.env`
- Fill it in based on [backend/.env.example](../backend/.env.example): real `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL=https://jhemery.xyz`, etc.

Because it's excluded from rsync, deploys never overwrite this file — edit it directly on the server when secrets change.

## Part B — GitHub setup

### 1. Add repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|---|---|
| `CPANEL_USERNAME` | cPanel username |
| `CPANEL_API_TOKEN` | token from Part A.2 |
| `CPANEL_SERVER` | hostname from Part A.1 |
| `SSH_KEY` | private key from Part A.3 |
| `FRONTEND_REMOTE_PATH` | document root from Part A.4 |
| `BACKEND_REMOTE_PATH` | application root from Part A.5 |
| `BACKEND_APP_ENTRY` | `source .../bin/activate` path from Part A.5 |

### 2. Trigger a run

Push a commit touching `frontend/` or `backend/` to `master`, or go to **Actions** → pick a deploy workflow → **Run workflow** (all deploy/build workflows support manual `workflow_dispatch`).

### 3. Verify

**Actions** tab → open the run → expand each step. Failures are almost always a wrong secret value (typo'd path, wrong server hostname) rather than a workflow bug — the whitelist and rsync steps print enough output to tell which.

## Apache config

[frontend/public/.htaccess](../frontend/public/.htaccess) is copied into `dist/` by the build and rsynced with everything else. It needs `mod_rewrite` only — no `mod_proxy` — so it works on o2switch shared hosting. It does four things:

- **SPA fallback.** Vue Router uses `createWebHistory`, so every non-file request is handed to `index.html`. Without this, a hard refresh on any path other than `/` 404s before Vue Router ever sees the URL.
- **`curl jhemery.xyz` → the ANSI résumé.** Matches on `User-Agent` at the site root and serves `resume.txt`, generated at build time by [vite-plugins/resume.ts](../frontend/vite-plugins/resume.ts). The same rule covers LLM crawlers, which would otherwise fetch an empty `<div id="app">`.
- **Charset.** `UTF-8` by default, and explicitly for `.txt` so the résumé's box-drawing characters survive.
- **Caching.** Hashed assets are `immutable` for a year; `index.html` and `resume.txt` are `no-cache`, so a deploy takes effect immediately.

If `mod_headers` or `mod_mime` is unavailable the `<IfModule>` guards make those blocks no-ops — the site still works, just without the cache and charset hints.

## Known gaps

- **Backend restart mechanism is unverified.** It assumes the o2switch Node.js App (Passenger) picks up `tmp/restart.txt`. If the app is managed a different way (PM2, systemd, etc.), update the "Install production dependencies & restart app" step in [backend-deploy.yml](../.github/workflows/backend-deploy.yml).
- **Steam live data is unverified.** `GET /steam/activity` has only ever been exercised with no credentials, where it correctly returns `{"configured": false}` and the site falls back to the static game log. The `configured: true` path needs a real `STEAM_API_KEY` / `STEAM_ID` in `backend/.env` and a manual check once set.
- **`POST /ask` cold starts may outrun the 20s timeout.** Verified working against a self-hosted Ollama (`gemma4:e4b`) at ~1.3s per answer *with the model resident*. Ollama's default `keep_alive` is 5 minutes, and a portfolio gets sporadic traffic, so most visitors will arrive to a cold model and pay a load of ~9.6 GB first. If that exceeds the 20s cap the terminal says the model is asleep. Fix it on the server, not in the app: set `OLLAMA_KEEP_ALIVE=-1` to keep it resident.
- **`ask` points the public internet at a home network.** It is the only endpoint that does, which is why `ASK_ENABLED` defaults to `false` and why the real `LLM_BASE_URL` is not committed to `.env.example` — the 5/hour per-IP limit guards the Nest route, not the model behind it. If the Ollama host is reachable without auth, anyone who learns the URL can skip the limiter entirely.
