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
  uses claude-sonnet-5), optionally `SMTP_URL` + `MAIL_FROM` (maintenance email reminders)
- **Custom domain**: `160weldon.kevintraywick.com` (add the CNAME Railway shows you
  at the DNS provider for kevintraywick.com)

## Updating the sheet-derived data

`site/js/data.js` was generated from the Google Sheet (`Weldon Lakehouse`).
To refresh after the sheet changes, ask Claude to re-run the extraction — or edit
`data/weldon-data.json` and regenerate. New expenses/bills added through the site
live in the Railway database, not in this file.

**Never publish** anything from the sheet's `passwords` / `WK&T Fiber` tabs —
they contain live credentials.

## Still to come

- Privacy gate for the whole site (deliberately last, per Kevin).
- Scanned blueprints / floor plans gallery on the House page.
