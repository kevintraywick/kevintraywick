// Dungeon Masters' Roundtable — one-page invitation + RSVP.
// Postgres when DATABASE_URL is set (Railway); JSON-file fallback for local dev.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const RESULTS_KEY = process.env.RESULTS_KEY || '';
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';

export const DATES = {
  jul21: 'Tue, July 21',
  jul23: 'Thu, July 23',
  jul28: 'Tue, July 28',
  jul30: 'Thu, July 30',
  none: "Can't make these — but let's get together"
};

/* ---------------- storage ---------------- */
let store;
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS roundtable_rsvps (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      dates JSONB NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  store = {
    async add(name, dates, note) {
      await pool.query(
        'INSERT INTO roundtable_rsvps (name, dates, note) VALUES ($1, $2, $3)',
        [name, JSON.stringify(dates), note]
      );
    },
    async all() {
      const { rows } = await pool.query(
        'SELECT id, name, dates, note, created_at FROM roundtable_rsvps ORDER BY created_at'
      );
      return rows;
    }
  };
} else {
  const FILE = path.join(__dirname, 'rsvps.local.json');
  const read = () => (fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : []);
  store = {
    async add(name, dates, note) {
      const rows = read();
      rows.push({ id: rows.length + 1, name, dates, note, created_at: new Date().toISOString() });
      fs.writeFileSync(FILE, JSON.stringify(rows, null, 2));
    },
    async all() {
      return read();
    }
  };
}

/* ---------------- discord ping (best-effort) ---------------- */
async function notifyDiscord(name, dates, note) {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) return;
  const nice = dates.map((d) => DATES[d] || d);
  let content = `🍻 **Roundtable RSVP** — **${name}**`;
  content += dates.includes('none')
    ? ` can't make any of the dates, but wants to get together.`
    : ` is in for: ${nice.join(' · ')}`;
  if (note) content += `\n> ${note.slice(0, 400)}`;
  try {
    await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
  } catch (err) {
    console.error('discord notify failed:', err.message);
  }
}

/* ---------------- app ---------------- */
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.post('/api/rsvp', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  const note = String(req.body?.note || '').trim().slice(0, 500);
  let dates = Array.isArray(req.body?.dates) ? req.body.dates.filter((d) => d in DATES) : [];
  if (dates.includes('none')) dates = ['none'];
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!dates.length) return res.status(400).json({ error: 'Pick at least one option.' });
  await store.add(name, dates, note);
  notifyDiscord(name, dates, note); // fire and forget
  res.json({ ok: true });
});

// Private results view (key-gated) — JSON and a simple HTML table.
app.get('/api/results', async (req, res) => {
  if (!RESULTS_KEY || req.query.key !== RESULTS_KEY) return res.status(403).json({ error: 'forbidden' });
  res.json(await store.all());
});

app.get('/results', async (req, res) => {
  if (!RESULTS_KEY || req.query.key !== RESULTS_KEY) return res.status(403).send('Forbidden');
  const rows = await store.all();
  const counts = Object.fromEntries(Object.keys(DATES).map((k) => [k, 0]));
  for (const r of rows) for (const d of r.dates) if (d in counts) counts[d]++;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  res.send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roundtable — results</title>
<style>body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#2b2118}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #d8c9ae;padding:.4rem .6rem;text-align:left;vertical-align:top}
th{background:#f3ead8}.tally span{display:inline-block;background:#f3ead8;border:1px solid #d8c9ae;border-radius:6px;padding:.2rem .6rem;margin:.15rem}</style>
<h1>Roundtable RSVPs (${rows.length})</h1>
<p class="tally">${Object.entries(DATES).map(([k, v]) => `<span><b>${counts[k]}</b> — ${esc(v)}</span>`).join(' ')}</p>
<table><tr><th>Name</th><th>Dates</th><th>Note</th><th>When</th></tr>
${rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.dates.map((d) => esc(DATES[d] || d)).join('<br>')}</td><td>${esc(r.note || '')}</td><td>${esc(String(r.created_at).slice(0, 16).replace('T', ' '))}</td></tr>`).join('')}
</table>`);
});

app.listen(PORT, () => console.log(`roundtable listening on :${PORT}`));
