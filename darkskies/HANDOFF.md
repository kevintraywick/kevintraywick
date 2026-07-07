# Dark Skies — Handoff to Claude Code

Context for picking this up and shipping it. Written by the Cowork session that
built it. Companion doc: **DEPLOY.md** (step-by-step deploy commands).

## TL;DR
`darkskies/` is a **self-contained Node + Express + Postgres app** that serves a
trip-planning site for a Sept–Oct 2026 West Texas ("Big Bend") group trip. It has
a shared **group chat** and a shared **availability painter**, both persisted in
Postgres. It is meant to run as its **own Railway service** on the subdomain
**darkskies.kevintraywick.com** — NOT merged into the main Vite site's build.

## ⚠️ Read this first (important boundaries)
- This folder lives inside the `kevintraywick` repo for convenience, but it is a
  **separate app with its own `package.json`**. Do **not** wire it into the main
  site's Vite/TS build, ESLint config, or `npm` scripts.
- Deploy it as a **new Railway service** with **Root Directory = `darkskies`**
  (Railway supports a monorepo root path), plus its **own PostgreSQL** plugin.
- URL decision already made with the owner: **subdomain**
  `darkskies.kevintraywick.com` (a subpath under the main site was explicitly
  declined to avoid coupling). No changes to the main site are required.
- Don't commit `node_modules/` or `data.json` (already in `.gitignore`).

## What's here
```
darkskies/
├─ server.js        Express: static hosting + JSON API
├─ db.js            Data layer — Postgres when DATABASE_URL is set, else local data.json
├─ package.json     "type":"module", start = node server.js, deps: express, pg
├─ public/
│  ├─ index.html    The whole site (single file: HTML + CSS + JS), API-wired
│  ├─ hubble.jpg    Best-nights chart backdrop (~9 MB)
│  ├─ purple.jpg    Availability section backdrop
│  └─ adromeda.png  Currently UNUSED (chat moved into hero) — safe to delete
├─ DEPLOY.md        Deploy runbook
└─ HANDOFF.md       This file
```

## Architecture / data model
- **Front end** (`public/index.html`): vanilla JS, Chart.js from CDN. On load it
  calls `GET /api/state` and then polls every 4s. No build step, no framework.
- **API** (`server.js`):
  - `GET  /api/state`            → `{ people, comments }`
  - `POST /api/comments`         → `{ name, body }`
  - `POST /api/people`           → `{ name }`
  - `PUT  /api/people/:id/slots` → `{ slots }`  (61-element array, Sep 1–Oct 31)
  - `GET  /healthz`
- **DB** (`db.js`): two interchangeable backends behind one interface.
  - Prod: Postgres (`DATABASE_URL`). Tables `people(id,name,slots jsonb,…)` and
    `comments(id,name,body,created_at)` are auto-created and seeded on first boot.
  - Dev: `data.json` file fallback when `DATABASE_URL` is unset.
- **Availability model**: each person has a `slots` array of length 61 (one per
  day, Sep 1 → Oct 31 2026); values are `''` | `'yes'` | `'maybe'` | `'no'`.

## Verified already
- Data layer tested end-to-end (seed, addPerson, addComment, setSlots persist &
  pad to 61). Front-end JS passes `node --check`. No `localStorage` remains.
- NOT yet done: a live run against real Postgres, and the actual Railway deploy.

## Deploy checklist (details in DEPLOY.md)
1. Push repo to GitHub (or use existing repo; Railway can target the `darkskies`
   subdirectory as Root Directory).
2. Railway → **inspiring optimism** project → **New Service** from the repo,
   Root Directory `darkskies`, start command `npm start` (auto-detected).
3. Add **PostgreSQL** plugin in the same project → `DATABASE_URL` auto-injects.
4. Generate a temporary domain, verify the site + chat + availability work.
5. Add **Custom Domain** `darkskies.kevintraywick.com`; create the matching
   **CNAME** at the kevintraywick.com DNS host. Wait for TLS. Done.

## Suggested follow-ups (nice-to-have, not blockers)
1. Wire real photos into the transport + lodging thumbnails (currently emoji
   placeholders). Owner will drop images into `public/`; swap the `.tthumb` /
   `.sthumb` tiles to `<img>` (or CSS `background-image`). Files to look for:
   e.g. `stay-gage.jpg`, `stay-indianlodge.jpg`, `stay-chinati.jpg`,
   `stay-terlingua.jpg`, `mid-airport.jpg`, etc.
2. Compress `public/hubble.jpg` (~9 MB) and `adromeda.png` (delete if still
   unused) for faster loads.
3. Consider basic write protection (a shared passphrase or rate limit) before
   sharing the URL widely — chat/availability are currently open POSTs.
4. Optional: replace 4s polling with Server-Sent Events for instant updates.

## Content notes (so nothing gets "corrected" by mistake)
- Availability spans **Sept 1 – Oct 31 2026** on purpose (Milky Way core fades
  after October). Recommended trip window ≈ **Sept 9–14** (new moon Sept 10).
- Lodging picks are intentional: Gage Hotel (Marathon) is the featured first-night
  meetup/carpool spot; Indian Lodge, Chinati Hot Springs, Terlingua round it out.
- The standalone preview `DarkSkies/dark-skies-mockup.html` (in the owner's other
  folder) is the browser-local mock; `public/index.html` here is the real,
  API-wired app. Keep changes in `public/index.html`.
