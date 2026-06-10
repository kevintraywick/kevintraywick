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

## Skills

- **`/archive-version`** — When creating a new version of the website, run this skill. It commits pending changes (with confirmation), pushes, creates a git tag, takes a homepage screenshot, and adds an entry to `archive/WEBSITE_ARCHIVE_CATALOG.md`.
