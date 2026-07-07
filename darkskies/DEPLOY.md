# Dark Skies — Deploy to Railway (darkskies.kevintraywick.com)

A standalone Node + Express + Postgres app. It serves the site and stores the
group chat + availability in Postgres so everyone shares the same data. It runs
as its **own Railway service** — no coupling to your main kevintraywick.com site.

## What's in here
```
darkskies-app/
├─ server.js        Express server + JSON API
├─ db.js            Data layer (Postgres in prod; local data.json for dev)
├─ package.json
├─ public/          The website (index.html + images)
└─ .env.example
```

## API
- `GET  /api/state`            → `{ people, comments }` (used for load + polling)
- `POST /api/comments`         → `{ name, body }`
- `POST /api/people`           → `{ name }`
- `PUT  /api/people/:id/slots` → `{ slots: [...61] }`

---

## Run it locally first (optional)
```bash
cd darkskies-app
npm install
npm start          # no DATABASE_URL → uses a local data.json file
# open http://localhost:3000
```

---

## Deploy to Railway

You'll do the authenticated steps (I can't log into your Railway/DNS). Two paths —
GitHub is the smoothest.

### Option A — Deploy from GitHub (recommended)
1. Create a new GitHub repo and push this `darkskies-app` folder to it:
   ```bash
   cd darkskies-app
   git init && git add . && git commit -m "Dark Skies app"
   git branch -M main
   git remote add origin https://github.com/<you>/darkskies.git
   git push -u origin main
   ```
2. In Railway, open your **inspiring optimism** project → **New → Service →
   Deploy from GitHub repo** → pick the repo. Railway auto-detects Node and runs
   `npm start`.
3. In the same project: **New → Database → Add PostgreSQL**. Railway injects
   `DATABASE_URL` into the service automatically. The app creates its tables and
   seeds the group on first boot.
4. Open the service's **Settings → Networking → Generate Domain** to get a
   temporary `*.up.railway.app` URL and confirm it works.

### Option B — Deploy with the Railway CLI
```bash
npm i -g @railway/cli
railway login
cd darkskies-app
railway link          # choose the "inspiring optimism" project
railway add           # add PostgreSQL when prompted
railway up            # build & deploy
```

---

## Point darkskies.kevintraywick.com at it
1. Railway service → **Settings → Networking → Custom Domain** →
   enter `darkskies.kevintraywick.com`. Railway shows a **CNAME target**
   (e.g. `xxxx.up.railway.app`).
2. At your DNS host for kevintraywick.com, add:
   ```
   CNAME   darkskies   →   <the-railway-target>
   ```
3. Wait for DNS + the automatic TLS certificate (usually minutes). Done.

> Prefer `kevintraywick.com/dark-skies` instead of a subdomain? That requires the
> main site to reverse-proxy `/dark-skies` to this service. Tell me how the main
> site is built and I'll wire it up — but the subdomain above needs no changes to
> your existing site.

## Notes
- `DATABASE_URL` is the only required env var and Railway sets it for you.
- Images in `public/` are large (hubble.jpg ≈ 9 MB). Fine to start; we can
  compress them later for faster loads.
- To reset the seeded demo data, drop the `people` / `comments` tables (or the
  whole Postgres plugin) and redeploy.
