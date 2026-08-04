# Deployment: GitHub Actions → o2switch

This repo auto-deploys to o2switch on every push to `master`:

- `frontend/**` changes → build the Vue app and upload `dist/` to the frontend document root
- `backend/**` changes → build the Nest app, upload `dist/` to the backend app root, then restart the Node.js app

Transfer happens over **FTPS**. There is also a legacy SSH/rsync path, kept as a manual fallback — see [SSH fallback](#ssh-fallback) for why it is not the default.

Workflow files: [frontend-build.yml](../.github/workflows/frontend-build.yml), [frontend-deploy.yml](../.github/workflows/frontend-deploy.yml), [frontend-deploy-ssh.yml](../.github/workflows/frontend-deploy-ssh.yml), [frontend-pr-check.yml](../.github/workflows/frontend-pr-check.yml), [backend-build.yml](../.github/workflows/backend-build.yml), [backend-deploy.yml](../.github/workflows/backend-deploy.yml), [backend-deploy-ssh.yml](../.github/workflows/backend-deploy-ssh.yml), [backend-pr-check.yml](../.github/workflows/backend-pr-check.yml).

## How the FTP deploy works

Both deploy workflows use [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action). It keeps a `.ftp-deploy-sync-state.json` file on the server listing what it last uploaded, and on each run diffs the fresh build against it — so only changed files go over the wire. The first run has no state file, so it uploads everything and, importantly, **does not delete files it has never tracked**. Leftovers from an older rsync deploy therefore survive the first FTP run; prune them by hand in the cPanel File Manager if any are stale.

The backend has one wrinkle: without SSH there is no way to run `npm ci` on the server, so **dependencies are installed manually from cPanel**. The deploy stores a hash of the deployed `package-lock.json` on the server as `.deploy-deps-hash`, compares it at the start of each run, and if it changed the run ends with a warning and a job summary telling you to click **Run NPM Install**. When the lockfile is unchanged — the usual case — there is nothing to do. See [Updating backend dependencies](#updating-backend-dependencies).

Restarts are done by uploading `tmp/restart.txt`, the standard Passenger reload convention. That one file is uploaded with `curl` rather than the sync action, so it is written unconditionally on every deploy.

Never deleted or overwritten on the backend: `.env`, `uploads/` (guestbook data), and `node_modules/` — all three are in the workflow's `exclude` list.

## Part A — cPanel setup

Do this section first; you need the values it produces to fill in the GitHub secrets in Part B.

### 1. Find your server hostname

cPanel home page → **Informations générales du compte**. Note the **Serveur** value, e.g. `c123.o2switch.net`. This becomes the `FTP_SERVER` secret.

Use this hostname rather than your own domain — it is what the server's TLS certificate is issued for, and the FTPS connection verifies it.

### 2. Set up the frontend domain and its FTP account

cPanel → **Domaines** → confirm the domain's document root, e.g. `/home/<user>/jhemery.xyz` for an addon domain, or `/home/<user>/public_html` if it's the account's main domain.

cPanel → **Fichiers** → **Comptes FTP** → **Ajouter un compte FTP**:

- Log in / username: e.g. `deploy-front` (cPanel appends `@jhemery.xyz`, giving `deploy-front@jhemery.xyz` — the **full** string is the username)
- Password: generate a strong one and store it straight into the GitHub secret
- Directory: the document root above
- Quota: unlimited

That gives you:

- `FTP_FRONTEND_USERNAME` = the full `user@domain` login
- `FTP_FRONTEND_PASSWORD` = its password

Because the account is rooted at the document root, `FTP_FRONTEND_DIR` can be left unset. Only set it if the FTP account lands somewhere above the target, in which case it is the path **relative to the FTP login directory** (e.g. `public_html/`).

### 3. Set up the backend as a Node.js App

cPanel → **Logiciel** → **Setup Node.js App** → **Create Application**:

- Node version: 24 (or closest available)
- Application mode: Production
- Application root: e.g. `api.jhemery.xyz` → the app root is `/home/<user>/api.jhemery.xyz`
- Application URL: `api.jhemery.xyz`
- Application startup file: `main.js`

Keep this page bookmarked — **Run NPM Install** and **Restart** live here.

### 4. Create the backend FTP account

Same as step 2, with the Node.js app root as the directory:

- `FTP_BACKEND_USERNAME` = e.g. `deploy-api@jhemery.xyz`
- `FTP_BACKEND_PASSWORD` = its password
- `FTP_BACKEND_DIR` = leave unset when the account is rooted at the app root

Use a **separate** account from the frontend one. It keeps each deploy unable to touch the other's files, and the two workflows write their own sync-state files.

### 5. Create `backend/.env` on the server

`backend/.env` is gitignored and excluded from every deploy on purpose, so it must exist on the server independently:

- cPanel **File Manager** → go to the app root → create `.env`
- Fill it in based on [backend/.env.example](../backend/.env.example): real `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL=https://jhemery.xyz`, etc.

Because it's excluded from the sync, deploys never overwrite this file — edit it directly on the server when secrets change.

### 6. Install backend dependencies once

The first backend deploy uploads `dist/` (including `package.json` and `package-lock.json`) but no `node_modules`. After it finishes, go to **Setup Node.js App** → the api application → **Run NPM Install**, then **Restart**.

## Part B — GitHub setup

### 1. Add repository secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|---|---|
| `FTP_SERVER` | hostname from Part A.1 |
| `FTP_FRONTEND_USERNAME` | full FTP login from Part A.2 |
| `FTP_FRONTEND_PASSWORD` | its password |
| `FTP_BACKEND_USERNAME` | full FTP login from Part A.4 |
| `FTP_BACKEND_PASSWORD` | its password |
| `FTP_FRONTEND_DIR` | optional, only if the FTP account isn't rooted at the document root |
| `FTP_BACKEND_DIR` | optional, only if the FTP account isn't rooted at the app root |

The `CPANEL_*` / `SSH_KEY` / `*_REMOTE_PATH` secrets are only used by the SSH fallback workflows. Leave them in place if you want that fallback to stay usable.

### 2. Trigger a run

Push a commit touching `frontend/` or `backend/` to `master`, or go to **Actions** → pick a deploy workflow → **Run workflow** (all deploy/build workflows support manual `workflow_dispatch`).

### 3. Verify

**Actions** tab → open the run → expand each step. Failures are almost always a wrong secret value rather than a workflow bug:

| Symptom | Cause |
|---|---|
| `530 Login authentication failed` | wrong username (it must include `@domain`) or password |
| `550 ...: No such file or directory` | `FTP_*_DIR` points somewhere that doesn't exist, or isn't relative to the FTP account's login directory |
| curl `SSL certificate problem` on the restart step | `FTP_SERVER` is set to your domain instead of the `cXXX.o2switch.net` hostname |
| Deploy is green but the API still serves old code | Passenger didn't pick up `tmp/restart.txt` — hit **Restart** in cPanel and see [Known gaps](#known-gaps) |
| API 500s right after a deploy | a dependency changed and `npm ci` hasn't run — see below |

## Updating backend dependencies

Whenever `backend/package-lock.json` changes, the deploy uploads the new code but the server's `node_modules` stays as it was. The run's job summary says so explicitly. Fix it in two clicks:

1. cPanel → **Setup Node.js App** → the api application
2. **Run NPM Install**
3. **Restart**

Between the deploy finishing and that install, the API runs against the old dependencies and may fail to boot. If a release adds or upgrades a package, deploy at a moment when you can follow it up immediately.

## SSH fallback

[frontend-deploy-ssh.yml](../.github/workflows/frontend-deploy-ssh.yml) and [backend-deploy-ssh.yml](../.github/workflows/backend-deploy-ssh.yml) are the previous rsync-over-SSH deploys, now `workflow_dispatch`-only. They handle dependencies themselves (`npm ci --omit=dev` on the server), so they need no manual cPanel step.

They depend on the cPanel API: o2switch requires the connecting IP to be whitelisted before SSH will accept a connection, so each run adds the runner's IP via `SshWhitelist/add`, rsyncs, then removes only that one entry (`SshWhitelist/remove`, `if: always()` so it runs even on failure). It never calls `remove_all`, so IPs you whitelisted manually are left alone. o2switch caps the whitelist at 5 entries, per their [SSH whitelist FAQ](https://faq.o2switch.fr/cpanel/outils/exception-parefeu/).

**o2switch currently has that API disabled**, which is why FTP is the default path — these workflows fail at the whitelist step until it comes back. Their secrets:

| Secret | Value |
|---|---|
| `CPANEL_USERNAME` | cPanel login username |
| `CPANEL_API_TOKEN` | cPanel → **Sécurité** → **Gérer les jetons API** (shown once) |
| `CPANEL_SERVER` | same hostname as `FTP_SERVER` |
| `SSH_KEY` | private half of a dedicated deploy key, imported and authorized under cPanel → **Sécurité** → **Accès SSH** |
| `FRONTEND_REMOTE_PATH` | absolute document root |
| `BACKEND_REMOTE_PATH` | absolute Node.js app root |
| `BACKEND_APP_ENTRY` | the `source /home/<user>/nodevenv/<app>/24/bin/activate` path shown on the Setup Node.js App screen |

Generate the deploy key with `ssh-keygen -t ed25519 -C "github-actions-deploy" -f gh-deploy-key`, leaving the passphrase empty (a passphrase blocks the non-interactive CI login), then delete both local key files once the private one is stored in GitHub.

## Apache config

[frontend/public/.htaccess](../frontend/public/.htaccess) is copied into `dist/` by the build and uploaded with everything else. It needs `mod_rewrite` only — no `mod_proxy` — so it works on o2switch shared hosting. It does four things:

- **SPA fallback.** Vue Router uses `createWebHistory`, so every non-file request is handed to `index.html`. Without this, a hard refresh on any path other than `/` 404s before Vue Router ever sees the URL.
- **`curl jhemery.xyz` → the ANSI résumé.** Matches on `User-Agent` at the site root and serves `resume.txt`, generated at build time by [vite-plugins/resume.ts](../frontend/vite-plugins/resume.ts). The same rule covers LLM crawlers, which would otherwise fetch an empty `<div id="app">`.
- **Charset.** `UTF-8` by default, and explicitly for `.txt` so the résumé's box-drawing characters survive.
- **Caching.** Hashed assets are `immutable` for a year; `index.html` and `resume.txt` are `no-cache`, so a deploy takes effect immediately.

If `mod_headers` or `mod_mime` is unavailable the `<IfModule>` guards make those blocks no-ops — the site still works, just without the cache and charset hints.

## Known gaps

- **The FTP deploy is unverified end to end.** It was written against o2switch's documented FTPS setup but has not yet run against the real account. The first run of each workflow needs watching.
- **Backend restart mechanism is unverified.** It assumes the o2switch Node.js App (Passenger) picks up `tmp/restart.txt`. If the app is managed a different way (PM2, systemd, etc.), replace the "Restart the Node.js app" step in [backend-deploy.yml](../.github/workflows/backend-deploy.yml) — and note that without SSH the only other lever is the **Restart** button in cPanel.
- **Steam live data is unverified.** `GET /steam/activity` has only ever been exercised with no credentials, where it correctly returns `{"configured": false}` and the site falls back to the static game log. The `configured: true` path needs a real `STEAM_API_KEY` / `STEAM_ID` in `backend/.env` and a manual check once set.
