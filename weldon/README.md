# 160 Weldon

Everything for the house site at **160weldon.kevintraywick.com**.

```
weldon/                    ← materials + website source of truth
├── site/                  ← the website (edit here)
│   ├── assets/weldon-drive.jpg   ← homepage hero photo
│   ├── css/ js/           ← styles, charts, data, API client
│   └── *.html             ← dashboard, expenses, utilities, forecast,
│                            house, projects, location, photos
├── data/weldon-data.json  ← extracted from the "Weldon Lakehouse" Google Sheet
├── materials/             ← scans, photos, bills (originals)
└── 160_Weldon.jpeg        ← original full-res hero photo

weldon-api/                ← Railway service (serves the site + the API)
├── server.js              ← Express + SQLite + Claude receipt/bill reading
├── site/                  ← deployed copy of weldon/site (rsync, see below)
└── Dockerfile, railway.json
```

## Local dev

```bash
cd weldon-api && npm install
rsync -a --delete ../weldon/site/ site/
ANTHROPIC_API_KEY=sk-ant-... PORT=8787 npm run dev
# → http://localhost:8787
```

Without `ANTHROPIC_API_KEY`, everything works except receipt/bill scanning.

## Deploying (Railway)

After editing anything in `weldon/site/`, sync it into the service and push:

```bash
rsync -a --delete weldon/site/ weldon-api/site/
```

Railway service settings:
- **Root directory**: `weldon-api`
- **Volume**: mount at `/app/data` (SQLite DB + uploaded scans/photos live there)
- **Variables**: `DATA_DIR=/app/data`, `ANTHROPIC_API_KEY` (receipt/bill reading,
  uses claude-sonnet-5), `GATE_CODE` (the live 3-emoji gate combination — the repo
  default is dev-only), `BACKUP_KEY` (bearer token for `/api/backup`), optionally
  `SMTP_URL` + `MAIL_FROM` (maintenance email reminders)
- **Custom domain**: `160weldon.kevintraywick.com` (add the CNAME Railway shows you
  at the DNS provider for kevintraywick.com)

## Document intake

Any drop zone accepts photos or PDFs (including multi-receipt PDFs, ~20 docs
per file); iPhone HEIC photos are converted to JPEG on arrival. Claude
classifies each document and files it: receipts → expenses ledger, utility
bills / tax / insurance → utility bills. **Circle, highlight, or underline an
item on a mixed receipt** (a house item among groceries) and only the marked
item is filed — the row is tagged "(marked item only)". Receipts with no
legible total are filed at $0 and flagged red until edited. Every scanned row
gets a 🧾 link to its stored scan. Suspected duplicates are **not** filed —
the page asks per item (receipts: add anyway? bills: replace the existing
month?). Recurring bills also appear inline on the expenses ledger in blue,
with tax + insurance amortized to 1/12 per month, so month subtotals — and
the dashboard "Cost per month" tile — reflect the true monthly cost of the
house.

## Paint chips

The House page's paint section has its own drop zone: photograph a paint chip
and name the file `paint_<room>_<store>` (e.g.
`paint_entrance_foyer_walmart.heic`). Claude reads the color name, brand, and
code off the chip, then looks up the brand's **official published hex** via
web search — a chip photographed indoors shifts badly, so the photo estimate
is only the fallback (cards say "official color" or "photo estimate").
Re-dropping the same filename (or same color name) asks whether the new photo
replaces the existing chip instead of adding a duplicate.

## Backups

Railway's built-in volume backups are Pro-plan only, so backups are DIY:
the private repo **`kevintraywick/weldon-backups`** runs a GitHub Action every
Sunday 08:00 UTC (plus manual runs from its Actions tab) that fetches
`GET /api/backup` — a consistent SQLite snapshot plus all uploaded scans/photos,
authenticated by the `BACKUP_KEY` secret (same value as the Railway var) — and
commits the extracted contents. **Restore**: copy `data/weldon.db` and
`data/uploads/` from that repo onto the volume at `/app/data/` and redeploy;
git history gives point-in-time recovery.

Photos uploaded on the Photos page are recompressed to webp (sharp, 2400px cap)
before hitting the volume; receipt/document scans are kept byte-for-byte as
uploaded — they're documentation (HEIC being the one exception: it's converted
to JPEG so browsers and the scanner can read it). Photos can be deleted from
the slideshow's ✕ button. Files no ledger/photo/chip row references anymore
are removed by a daily orphan sweep after a 24-hour grace period.

## Updating the sheet-derived data

`site/js/data.js` was generated from the Google Sheet (`Weldon Lakehouse`).
To refresh after the sheet changes, ask Claude to re-run the extraction — or edit
`data/weldon-data.json` and regenerate. New expenses/bills added through the site
live in the Railway database, not in this file.

**Never publish** anything from the sheet's `passwords` / `WK&T Fiber` tabs —
they contain live credentials.

## Still to come

- **10–15 year ownership-cost model** (Forecast page): extends the capital-project
  amortization to a long horizon so Keith can see how a roof or HVAC decision
  changes his monthly cost. Waiting on Kevin: capital project list + timing,
  cash vs financed per project, inflation assumptions.
- Scanned blueprints / floor plans gallery on the House page.
- `SMTP_URL` + `MAIL_FROM` so maintenance email reminders actually send.

(The privacy gate shipped 2026-07-07 — the whole site sits behind the emoji
gate in `gate.html` + server-side middleware.)
