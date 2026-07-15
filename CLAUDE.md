# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Local dev server (Vite HMR)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run preview      # Preview production build locally
npm test             # Run tests once (Vitest)
npm run test:watch   # Vitest watch mode
```

To run a single test file:
```bash
npx vitest run src/components/FeedOverlay.test.tsx
```

## Architecture

**Stack**: React 19 + TypeScript, Vite, Tailwind CSS v4, React Router DOM v7, Vitest + React Testing Library.

**Deployment**: GitHub Actions → GitHub Pages (kevintraywick.com). The `deploy.yml` workflow builds on push to `main` and injects `VITE_API_URL` and `VITE_POST_SECRET` from GitHub secrets.

**Backend**: External API at `https://kt-feed-api-production.up.railway.app` (Railway). Configured via `VITE_API_URL` env var. The `useFeed` hook handles all API calls. A Bearer token from `VITE_POST_SECRET` gates POST requests.

**Routing** (in `App.tsx`):
- `/` → Homepage with 9-panel (3×3) image-link grid + `FeedOverlay` in left column
- `/blog` → Blog feed (all entries)
- `/blog/:id` → Individual entry with comments

**External links from homepage**:
- FeedOverlay header arrow (→) links to MoveAlong app at `https://movealong-production.up.railway.app`
- FeedOverlay header circle links to `/cc`
- Blackmoor panel links to `https://blackmoor.up.railway.app`
- Wind panel links to `https://meticulous-eagerness-production-411f.up.railway.app`

`index.html` includes a GitHub Pages SPA redirect shim: query param `?path=` is rewritten to the real path via `window.history.replaceState`.

**Data flow**: `useFeed` (custom hook) → fetches entries/comments, exposes `postEntry`/`postComment` → consumed by `FeedOverlay`, `Blog`, `BlogEntry`.

**Entry model**: `{ id, title, link?, note?, created_at, comment_count }`
**Comment model**: `{ id, entry_id, body, created_at }`

**Test co-location**: Test files live alongside source (e.g. `Component.test.tsx` next to `Component.tsx`).

**Public sub-apps**: `public/fast-french/` and `public/justedit/` are static sub-apps served at their respective paths on GitHub Pages.

**CC Flipbook** (`public/cc/`): A standalone flipbook viewer for cheat sheets. Pages defined in `files.json` (images, PDFs, local HTML) plus user-added files/URLs persisted in IndexedDB (migrated from legacy localStorage; localStorage's ~5MB quota dropped large screenshots). User deletions of `files.json` pages are tracked in a `deletedServerNames` list so the server-file merge doesn't resurrect them on reload. Supports drag-to-reorder thumbnails, URL webpage embedding (type `"url"`), and file drop/upload. HTML data URLs use `srcdoc` (not `src`) to avoid browser download behavior.

**Basher** (`public/basher/`, served at `/basher`): Static frontend for the business-plan evaluator. The drop zone uploads to **`basher-api/`** (separate Railway service in this repo) which extracts text, calls Claude, renders 5 HTML report pages, and stores them on a Railway volume at `/app/data/{slug}/` for **10 days**. After upload the user is redirected to the report URL and a download button (zip) is shown in a banner on every report page. `basher/` is a parallel dev workspace that mirrors `public/basher/` — keep them in sync (rsync on changes), or treat `public/basher/` as source of truth.

**Dark Skies** (`darkskies/`, live at `darkskies.kevintraywick.com`): A **standalone** Node + Express + Postgres app (own `package.json`) — NOT part of the Vite build. West Texas 2026 trip planner: shared chat, availability painter (Sep 1–Nov 30, `AV_DAYS=91`), and idea board (URL/image drops), all persisted in Postgres and polled from `/api/state`. Runs as its own Railway service in the **`inspiring-optimism`** project with **GitHub auto-deploy** (root dir `darkskies`, watch paths `darkskies/**`) — pushing to `main` redeploys only when `darkskies/` changes. Gotchas: set `PGSSL=disable` for the internal Postgres connection; Railway root-dir/watch-paths are set via the GraphQL API (`serviceInstanceUpdate`), not the CLI; run admin SQL with `psql "$DATABASE_PUBLIC_URL"` (from `railway variables --service Postgres --json` — internal `DATABASE_URL` only resolves inside Railway); keep `AV_DAYS` in sync between `darkskies/db.js` and `darkskies/public/index.html`; single-file frontend is `darkskies/public/index.html` (Chart.js via CDN).

**160 Weldon** (`weldon/` + `weldon-api/`, live at `160weldon.kevintraywick.com`): House-info site + API for 160 Weldon Dr — a **standalone** Railway service (project `inspiring-optimism`, GitHub auto-deploy: rootDir `weldon-api`, watch `weldon-api/**`), NOT part of the Vite build. Site source of truth is `weldon/site/`; sync before committing: `rsync -a --delete weldon/site/ weldon-api/site/`. Backend is Express + better-sqlite3 + Anthropic SDK (`weldon-api/server.js`), volume at `/app/data`. The whole site sits behind an emoji gate (signed cookie via `POST /api/gate {"picks":[...]}`; live code in Railway var `GATE_CODE`, repo default is dev-only; `/assets/favicon.svg` is exempted). Unified intake `POST /api/documents`: claude-sonnet-5 reads a scan (image or multi-receipt PDF) and returns an **array** of classified documents — receipts → `expenses`, utility-bill/tax/insurance → `utility_bills`; a receipt with no legible total is filed at $0 and flagged red in the ledger (`tr.incomplete`, clears when the amount is edited). Scan calls stream with `max_tokens: 64000` — on sonnet-5 `max_tokens` caps adaptive thinking + JSON **combined**, so a small cap fails intermittently with "No readable result from the scan"; don't lower it. Local test pattern: `DATA_DIR=<scratch> PORT=8899 node server.js` with `ANTHROPIC_API_KEY` from `railway variables --service weldon-api --json`, then curl with the gate cookie jar. Synthetic multi-receipt test PDFs: one-doc-per-page HTML → `chrome --headless --print-to-pdf`.

## Gotchas

- `.gitignore` ignores `*.svg` repo-wide — `git add -f` any SVG that must be committed (e.g. favicons).
- `railway logs` shows the **current deployment only** — a push/redeploy restarts the container and wipes prior output. weldon-api logs errors only, so debug by reproducing the request, not by log archaeology.
- Anthropic structured outputs: enums may not mix strings with null — use an `'unsure'` sentinel and map to NULL server-side; nullable scalars (`type: ['number','null']`) are fine.

## Skills

- **`/archive-version`** — When creating a new version of the website, run this skill. It commits pending changes (with confirmation), pushes, creates a git tag, takes a homepage screenshot, and adds an entry to `archive/WEBSITE_ARCHIVE_CATALOG.md`.
