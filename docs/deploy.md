# Deployment: GitHub Actions → o2switch

This repo auto-deploys to o2switch on every push to `master`:

- `frontend/**` changes → build the Vue app and rsync `dist/` to the frontend document root
- `backend/**` changes → build the Nest app, rsync it into `dist/` under the backend app root, then `npm ci --omit=dev` and restart the Node.js app on the server

Transfer happens over **SSH**. There is a second, FTPS-based path kept for when the cPanel API is unavailable — see [FTP fallback](#ftp-fallback).

Workflow files: [frontend-build.yml](../.github/workflows/frontend-build.yml), [frontend-deploy.yml](../.github/workflows/frontend-deploy.yml), [frontend-deploy-ftp.yml](../.github/workflows/frontend-deploy-ftp.yml), [frontend-pr-check.yml](../.github/workflows/frontend-pr-check.yml), [backend-build.yml](../.github/workflows/backend-build.yml), [backend-deploy.yml](../.github/workflows/backend-deploy.yml), [backend-deploy-ftp.yml](../.github/workflows/backend-deploy-ftp.yml), [backend-pr-check.yml](../.github/workflows/backend-pr-check.yml).

## How the deploy works

o2switch requires the connecting IP to be whitelisted before SSH will accept a connection, so each deploy run adds the GitHub Actions runner's IP to the whitelist via the cPanel API (`SshWhitelist/add`), rsyncs over SSH, then removes only that one entry afterwards (`SshWhitelist/remove`, `if: always()` so it runs even on failure). It only ever touches the entry it just added — it never calls `remove_all`, so any IPs you've whitelisted manually (e.g. your own machine) are left alone. Note: o2switch caps the whitelist at 5 entries total, per their [SSH whitelist FAQ](https://faq.o2switch.fr/cpanel/outils/exception-parefeu/).

Two runs at once would put two entries in that 5-slot whitelist and race the firewall with them, which is exactly how the 4 August run failed — the frontend connected 13 seconds after whitelisting and worked, the backend connected 4 seconds after and had its TCP connection reset. So all four deploy workflows share a `concurrency: o2switch-deploy` group and queue behind each other, and each one probes SSH in a retry loop before rsyncing rather than assuming the packet filter has caught up with the API.

### Frontend configuration

`VITE_API_URL` is **inlined into the JavaScript at build time**, so it has to be set where the build runs. It comes from a repository **variable** (not a secret — it ships in the JavaScript either way):

Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** → `VITE_API_URL` = `https://api.jhemery.xyz`

A `.env` placed on the server does nothing for a static bundle; the file is read by Vite during `npm run build`, never by the browser.

Getting this wrong is quiet rather than loud: `src/lib/api.ts` falls back to `http://localhost:3000`, so the site deploys and renders perfectly while every API call goes nowhere. [frontend-build.yml](../.github/workflows/frontend-build.yml) therefore fails the build outright when the variable is unset rather than letting the fallback through. To check what a deployed bundle actually contains:

```bash
curl -s https://jhemery.xyz/$(curl -s https://jhemery.xyz/ | grep -oE '/assets/[^"]+\.js' | head -1) | grep -o 'https://api[^"]*'
```

Unlike the backend, the frontend deploys to the document root itself, so `--delete` has no subdirectory to be scoped to. Anything living there that the build doesn't produce — `.env`, `.well-known` (AutoSSL's ACME challenges), `cgi-bin`, `error_log` — has to be named in the rsync's `--exclude` list or it gets removed on the next deploy.

### Backend directory layout

The build goes into **`dist/` under the app root**, not into the app root itself:

```
/home/<user>/api.jhemery.xyz/     <- BACKEND_REMOTE_PATH
  dist/                           <- rsync --delete target, build output only
    main.js, package.json, package-lock.json, …
  package.json                    <- lifted out of dist/ each deploy
  package-lock.json               <- same; npm ci refuses to run without it
  node_modules -> …/nodevenv/…    <- symlink into the cPanel virtualenv
  .htaccess                       <- CloudLinux Passenger config, DO NOT REMOVE
  .env                            <- created by hand, never deployed
  public/  tmp/  uploads/
```

Two constraints force this shape, and they pull in opposite directions:

- **Passenger runs `dist/main.js`.** That's what cPanel wrote into `.htaccess` as `PassengerStartupFile`, so the compiled entry point has to be at that path.
- **`npm ci` has to run at the app root.** That's where cPanel puts the `node_modules` symlink; Node resolves it from `dist/main.js` by walking up. Installing inside `dist/` would create a second, real `node_modules` and orphan the virtualenv.

Hence the deploy rsyncs into `dist/`, then copies `package.json` and `package-lock.json` up one level before installing. The build workflow puts both into `dist/` for exactly this purpose.

The payoff is that `--delete` is confined to a directory containing nothing but build output. `.htaccess`, the `node_modules` symlink, `public/`, `tmp/`, `.env` and `uploads/` all sit above it and cannot be caught by it — no exclude list to keep in sync, and no way for a new server-side file to be deleted because someone forgot to add it.

## Part A — cPanel setup

Do this section first; you need the values it produces to fill in the GitHub secrets in Part B.

### 1. Find your server hostname

cPanel home page → **Informations générales du compte**. Note the **Serveur** value, e.g. `c123.o2switch.net`. This becomes the `CPANEL_SERVER` secret.

### 2. Create a cPanel API token

cPanel → **Sécurité** → **Gérer les jetons API** → create a token (e.g. `github-actions`) and copy it immediately — it's shown once.

- `CPANEL_USERNAME` = your cPanel login username
- `CPANEL_API_TOKEN` = the token you just created

Both are required. A request with an empty token doesn't fail loudly — cPanel answers with the HTML login page, and the deploy fails one step later at the whitelist check. See the troubleshooting table below.

### 3. Generate an SSH deploy key and authorize it

Generate a dedicated key pair (don't reuse a personal one):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/gh-deploy-key
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

### Where the frontend's API URL comes from

The frontend needs to know where the API lives, via `VITE_API_URL` (e.g. `https://api.jhemery.xyz`). It behaves unlike every other setting on this page, and the difference is the whole reason this section exists:

> **`VITE_API_URL` is consumed at build time, not at runtime.** `vite build` replaces `import.meta.env.VITE_API_URL` with a string literal, and what deploys is static files served by Apache. The URL is frozen into `assets/index-*.js` before anything reaches the server, and there is no process on the server to read a `.env` afterwards. This is exactly where `backend/.env` differs — Nest reads that one at runtime, so it can live on the server; a `frontend/.env` on the server is inert.

So `VITE_API_URL` has to be set **wherever `npm run build` runs**. In CI that is a GitHub runner, and `frontend/.env` is gitignored, so the runner never has one — the value comes from a **repository variable** instead:

Repo → **Settings** → **Secrets and variables** → **Actions** → **Variables** → **New repository variable**, named `VITE_API_URL`, e.g. `https://api.jhemery.xyz`.

A variable rather than a secret: the value is inlined verbatim into a public bundle, so there is nothing to hide, and masking it would only make the build log harder to read.

[frontend-build.yml](../.github/workflows/frontend-build.yml) checks it before building and **fails the run** if it is unset. That guard is the point of the section: [frontend/src/lib/api.ts](../frontend/src/lib/api.ts) falls back to an empty base in a production build, which deploys and renders perfectly while every live-data call quietly goes to the SPA and comes back as `index.html`. A red run beats a green one that ships a site with no live data.

Whatever value you use has to agree with the CORS allowlist in the other direction — `FRONTEND_URL` in `backend/.env`.

Building locally instead — a `frontend/.env` on your machine, then deploying that `dist/` by hand — works the same way, and is the only route that does not go through the variable.

### 5. Set up the backend as a Node.js App

cPanel → **Logiciel** → **Setup Node.js App** → **Create Application**:

- Node version: 24 (or closest available)
- Application mode: Production
- Application root: e.g. `api.jhemery.xyz` → `BACKEND_REMOTE_PATH` = `/home/<user>/api.jhemery.xyz`
- Application URL: `api.jhemery.xyz`
- Application startup file: `dist/main.js`

`BACKEND_REMOTE_PATH` is the **app root**, with no `/dist` on the end — the workflow appends that itself. Pointing it at `.../api.jhemery.xyz/dist` would deploy into `dist/dist/` and run `npm ci` in the wrong directory.

After creation, cPanel shows a command like:

```
source /home/<user>/nodevenv/api.jhemery.xyz/24/bin/activate && cd /home/<user>/api.jhemery.xyz
```

Copy the `source .../bin/activate` part — that exact path is the `BACKEND_APP_ENTRY` secret. The deploy workflow uses it to run `npm ci` with the right Node version and to restart the app.

### 6. Create `backend/.env` on the server

`backend/.env` is gitignored and excluded from every deploy on purpose, so it must exist on the server independently:

- cPanel **File Manager** (or SSH, once your key is authorized) → go to `BACKEND_REMOTE_PATH` → create `.env`
- Fill it in based on [backend/.env.example](../backend/.env.example): real `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL=https://jhemery.xyz`, etc.

Because it's excluded from the rsync, deploys never overwrite this file — edit it directly on the server when secrets change.

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
| `BACKEND_REMOTE_PATH` | application root from Part A.5, **without** a trailing `/dist` |
| `BACKEND_APP_ENTRY` | `source .../bin/activate` path from Part A.5 |

All seven are required. Check them with `gh secret list` before expecting a deploy to pass — a missing secret expands to an empty string rather than failing the run outright.

`VITE_API_URL` is deliberately **not** in this table — it is a repository *variable*, not a secret, because it ends up inlined in a public bundle. See [Where the frontend's API URL comes from](#where-the-frontends-api-url-comes-from). Without it the frontend build fails outright.

### 2. Trigger a run

Push a commit touching `frontend/` or `backend/` to `master`, or go to **Actions** → pick a deploy workflow → **Run workflow** (all deploy/build workflows support manual `workflow_dispatch`).

### 3. Verify

**Actions** tab → open the run → expand each step. Failures are almost always a wrong or missing secret rather than a workflow bug:

| Symptom | Cause |
|---|---|
| "Whitelisting the runner IP" exits 1 with *"the response was not JSON"* | `CPANEL_API_TOKEN` is empty or invalid. An unauthenticated cPanel API call returns the login page, not a JSON error — easy to mistake for the API being disabled. Check the masked header in the log: `Authorization: cpanel ***:***` is right, `cpanel ***:` means the token is missing. |
| "Whitelisting the runner IP" exits 1 with *"Vous avez atteint la limite d'exceptions autorisées"* | The whitelist is full — it holds **five distinct addresses**, not five entries. Prune it in cPanel → **Accès SSH** → **Gérer les exceptions de pare-feu**, removing the leftover GitHub-runner addresses (Azure ranges: `13.*`, `20.*`, `52.*`, `64.*`). Two of the five slots are your own machines and should stay. |
| The whitelist keeps filling up with runner IPs | Deploys before 4 August 2026 removed only the `direction=in` entry, while cPanel's `add` creates `in` **and** `out` — so each run leaked one address permanently. The cleanup step now removes both directions; anything leaked before that has to be pruned by hand, once. A leftover is recognisable as a port-22 `out` entry with no matching `in` — your own machines were whitelisted in both directions. |
| "Making sure the IP is whitelisted" exits 1 | The `add` was accepted but the entry is not in the list. Re-run; if it persists, add it by hand in cPanel to confirm the account can hold another address at all. |
| `Permission denied (publickey)` on rsync | `SSH_KEY` isn't the private half of the authorized key, or the key was imported but never **Authorized** in cPanel |
| `kex_exchange_identification: Connection reset by peer` | The firewall hadn't applied the whitelist entry yet. The "Waiting for the firewall" step retries for two minutes; if it exhausts them, the entry was accepted by the API but never loaded. |
| rsync succeeds but lands in the wrong place | `FRONTEND_REMOTE_PATH` / `BACKEND_REMOTE_PATH` typo — they're absolute paths |
| Files end up in `api.jhemery.xyz/dist/dist/` | `BACKEND_REMOTE_PATH` has `/dist` on the end; it should be the app root |
| Backend deploy fails at `npm ci` | `BACKEND_APP_ENTRY` doesn't point at the venv's `activate` script, or `package-lock.json` never made it to the app root |
| App boots but 404s everything | `.htaccess` was deleted from the app root. Recreate it from [backend/.htaccess](../backend/.htaccess), fixing the paths for your account. |
| Deploy is green but the API still serves old code | Passenger didn't pick up `tmp/restart.txt` — hit **Restart** in cPanel and see [Known gaps](#known-gaps) |

## FTP fallback

[frontend-deploy-ftp.yml](../.github/workflows/frontend-deploy-ftp.yml) and [backend-deploy-ftp.yml](../.github/workflows/backend-deploy-ftp.yml) deploy the same builds over FTPS, with no dependency on the cPanel API or on SSH. They are `workflow_dispatch`-only: **Actions** → **Deploy Frontend (FTP)** / **Deploy Backend (FTP)** → **Run workflow**.

Reach for them if o2switch disables the API again, or if the SSH whitelist is jammed and you need to ship.

Both use [SamKirkland/FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action), which keeps a `.ftp-deploy-sync-state.json` on the server listing what it last uploaded and diffs the fresh build against it, so only changed files go over the wire. The first run has no state file, so it uploads everything and **does not delete files it has never tracked** — leftovers from an rsync deploy survive it. Restarts are done by uploading `tmp/restart.txt` with `curl`, so it is written unconditionally.

Setup, if you want this path ready before you need it:

1. cPanel → **Fichiers** → **Comptes FTP** → add one account rooted at the document root and another at the Node.js app root. The username is the **full** `user@domain` string cPanel builds.
2. Add the secrets below. `FTP_SERVER` must be the `cXXX.o2switch.net` hostname, not your domain — it's what the TLS certificate is issued for, and the restart step's `curl` verifies it.

| Secret | Value |
|---|---|
| `FTP_SERVER` | same hostname as `CPANEL_SERVER` |
| `FTP_FRONTEND_USERNAME` / `FTP_FRONTEND_PASSWORD` | frontend FTP account |
| `FTP_BACKEND_USERNAME` / `FTP_BACKEND_PASSWORD` | backend FTP account |
| `FTP_FRONTEND_DIR` / `FTP_BACKEND_DIR` | optional, only if an account isn't rooted at its target. Relative to the FTP login directory. |

**The one manual step:** without SSH there is no way to run `npm ci` on the server, so when `backend/package-lock.json` changes you have to install dependencies from cPanel → **Setup Node.js App** → the api application → **Run NPM Install** → **Restart**. The workflow stores a hash of the deployed lockfile on the server as `.deploy-deps-hash`, compares it each run, and ends with a warning annotation plus a job summary when it differs. Until you do it, the API runs against the old dependencies and may fail to boot.

## Apache config

[frontend/public/.htaccess](../frontend/public/.htaccess) is copied into `dist/` by the build and deployed with everything else — but only because [frontend-build.yml](../.github/workflows/frontend-build.yml) sets `include-hidden-files: true` on the artifact upload. `actions/upload-artifact@v4` drops dotfiles by default, and with `.htaccess` missing from the artifact the deploy's `rsync --delete` removes the copy on the server too. The symptom is easy to misread: the site builds, deploys and renders fine, but deep links 404 and `curl jhemery.xyz` returns HTML instead of the résumé. It needs `mod_rewrite` only — no `mod_proxy` — so it works on o2switch shared hosting. It does four things:

- **SPA fallback.** Vue Router uses `createWebHistory`, so every non-file request is handed to `index.html`. Without this, a hard refresh on any path other than `/` 404s before Vue Router ever sees the URL.
- **`curl jhemery.xyz` → the ANSI résumé.** Matches on `User-Agent` at the site root and serves `resume.txt`, generated at build time by [vite-plugins/resume.ts](../frontend/vite-plugins/resume.ts). The same rule covers LLM crawlers, which would otherwise fetch an empty `<div id="app">`.
- **Charset.** `UTF-8` by default, and explicitly for `.txt` so the résumé's box-drawing characters survive.
- **Caching.** Hashed assets are `immutable` for a year; `index.html` and `resume.txt` are `no-cache`, so a deploy takes effect immediately.

If `mod_headers` or `mod_mime` is unavailable the `<IfModule>` guards make those blocks no-ops — the site still works, just without the cache and charset hints.

## Verified in production

Both tiers are live. Checked against `https://api.jhemery.xyz` on 4 August 2026:

| Endpoint | Result |
|---|---|
| `GET /github/activity` | 200, `{"configured":true,"commits":[…]}` |
| `GET /github/contributions` | 200, `{"configured":true,"total":894,…}` |
| `GET /github/pinned-repos` | 200, `{"configured":true,"repos":[…]}` |
| `GET /steam/activity` | 200, `{"configured":true,"profile":{"name":"Couvbat",…}}` |
| `GET /guestbook` | 200, `{"enabled":true,"entries":[…]}` |

So the app boots under Passenger, `.htaccess` routes to `dist/main.js`, and the hand-written `.env` from Part A.6 is populated — every integration reports `configured: true`, which means the GitHub token and the `STEAM_API_KEY` / `STEAM_ID` pair are all present and accepted upstream. Steam's `configured: true` branch is exercised in production, not just the credential-less `{"configured": false}` fallback.

CORS works in both directions: a request carrying `Origin: https://jhemery.xyz` comes back with `access-control-allow-origin: https://jhemery.xyz`, and the `OPTIONS /guestbook` preflight returns 204 with `access-control-allow-methods: GET,POST,DELETE` and `access-control-allow-headers: Content-Type,x-admin-password`.

The running build also answers `POST /ask`, which merged on 4 August 2026 at 13:48 UTC, so the deployed code postdates every CI deploy attempt listed below.

**The CI deploy works.** It first completed end to end on 4 August 2026 at 15:40 UTC, after ten runs that never reached the transfer, and has succeeded on every run since — 15:40, 15:46 and 16:20 UTC. Run `30928557796` shipped `dd9377a`, and its log shows the whole path finally executing against the real server for the first time: rsync transferring, `cp dist/package.json dist/package-lock.json .`, `npm ci --omit=dev` reporting *"added 135 packages"*, and `touch tmp/restart.txt`. Everything the gaps below called unproven has now run.

So the live backend carries the three commits that make `ask` work — the corpus fetch off the request path, the cold-load detach, and the endpoint's response ceiling — rather than the hand-placed 13:48 UTC build.

> **What this does not prove: that Passenger acted on the restart.** `touch tmp/restart.txt` succeeding means the file was touched, nothing more. The observable test is the response ceiling: the deployed code answers `POST /ask` within 45 seconds under every failure it has (20s to detach a cold model, 45s absolute). **A request that runs past 45 seconds is the old process still serving, not a slow model** — see the gap below.

## Known gaps

- ~~**The automated backend deploy has never completed a run.**~~ **Fixed 4 August 2026.** Ten runs died before the transfer; the last of them never reached SSH at all, because the whitelist was full of leaked runner addresses, `add` was refused, and an unchecked `curl` let the run walk into a two-minute SSH timeout. Both were fixed in [backend-deploy.yml](../.github/workflows/backend-deploy.yml) and the deploy has completed cleanly on every run since — see [Verified in production](#verified-in-production).
- **Backend restart mechanism is still unverified**, and it is now the only unproven link in the chain. `touch tmp/restart.txt` runs and succeeds, but nothing checks that o2switch's Passenger acts on it, so a green deploy is not evidence that the new code is serving. If the app is managed some other way (PM2, systemd), update the "Install production dependencies & restart app" step in [backend-deploy.yml](../.github/workflows/backend-deploy.yml).

  Test it with the response ceiling rather than by reading a log — the deployed `/ask` cannot stay silent for 45 seconds:

  ```bash
  curl -sS -m 90 -o /dev/null -w 'status=%{http_code} time=%{time_total}\n' \
    -X POST https://api.jhemery.xyz/ask \
    -H 'Origin: https://jhemery.xyz' -H 'Content-Type: application/json' \
    -d '{"question":"are you awake","locale":"en"}'
  ```

  A status inside 45s means the new process is live. A run to the 90s timeout means Passenger is still serving the old one, whatever the deploy said — restart the app from cPanel's Node.js app manager and try again. **This is the cheapest way to tell a stale process from a slow model, and worth reaching for first whenever the backend behaves like a version you did not ship.**
- **The FTP fallback is unverified.** Written against o2switch's documented FTPS setup, never run against the real account.
- **The first visitor to a cold `ask` model is told it is asleep, on purpose.** A cold load measures ~34s against a 20s deadline, so that visitor cannot be served. Rather than cancel — which used to abort the load itself and left the model permanently cold, since Ollama drops a load when its client disconnects — the request detaches and finishes loading in the background. The next visitor gets an answer in ~1.4s. Setting `OLLAMA_KEEP_ALIVE=-1` on the model host makes even that first miss a once-per-reboot event rather than once per idle period.
- **Nothing on the server reports why `ask` failed.** The service logs latency and outcome to stdout, which on Passenger goes to the app's stderr log. When `ask` misbehaves that log is the only account of it, and both diagnoses above had to be reconstructed from black-box probing plus the *model host's* log instead — see [ask-command-design.md](superpowers/specs/2026-08-04-ask-command-design.md).
- **A backend hang reaches the browser as a CORS error, not a timeout.** Cloudflare gives the origin 100s to send response headers, then substitutes its own 524 — which carries no `Access-Control-Allow-Origin`, so the console reports a missing CORS header against an endpoint whose CORS is fine (verified above, in both directions). Worth knowing before chasing `enableCors` or `FRONTEND_URL`: on `api.jhemery.xyz`, *"CORS header missing"* plus a 5xx status usually means the origin was silent, not misconfigured. `/ask` now bounds its own response at 45s so it cannot produce one; no other endpoint has a slow path long enough to matter.
