import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DATA_DIR is /app/data on Railway, which is where the volume is mounted. If
// the two ever drift apart the writes land on ephemeral container storage and
// vanish on the next deploy, silently -- so default to the same path.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'plan.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DAYS = ['fri', 'sat', 'sun', 'mon'];
const EMPTY = () => ({
  tours: Object.fromEntries(DAYS.map(k => [k, []])),
  items: { places: [], eats: [] },
  hidden: [],
  rev: 0,
  updated: null,
});

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return EMPTY(); }
}

function save(state) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);          // atomic, so a crash can't truncate the plan
}

// The endpoint is unauthenticated, like the rest of this site, so the shape is
// checked rather than trusted: anything unexpected is dropped, not stored.
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

function cleanStops(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const s of list.slice(0, 60)) {
    if (!s || typeof s !== 'object') continue;
    const id = str(s.id, 64), uid = str(s.uid, 40), start = num(s.start, 0, 24 * 60);
    if (id && uid && start !== null) out.push({ id, uid, start });
  }
  return out;
}

function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  const id = str(it.id, 64), name = str(it.name, 120);
  const lat = num(it.lat, -90, 90), lon = num(it.lon, -180, 180);
  if (!id || !name || lat === null || lon === null) return null;
  if (!/^[\w:.@-]{1,64}$/.test(id)) return null;   // it lands in a CSS selector
  const out = { id, name, lat, lon };
  const sub = str(it.sub, 300); if (sub) out.sub = sub;
  // url and img are rendered as links and image sources, so only http(s)
  for (const k of ['url', 'img']) {
    const v = str(it[k], 600);
    if (v && /^https?:\/\//i.test(v) && !/["'<>\s]/.test(v)) out[k] = v;
  }
  const wiki = str(it.wiki, 200); if (wiki) out.wiki = wiki;
  if (it.eat === true) out.eat = true;
  return out;
}

function cleanState(body) {
  const tours = {};
  for (const k of DAYS) tours[k] = cleanStops(body?.tours?.[k]);
  const items = { places: [], eats: [] };
  for (const kind of ['places', 'eats']) {
    const src = Array.isArray(body?.items?.[kind]) ? body.items[kind].slice(0, 200) : [];
    items[kind] = src.map(cleanItem).filter(Boolean);
  }
  const hidden = (Array.isArray(body?.hidden) ? body.hidden.slice(0, 500) : [])
    .map(v => str(v, 64)).filter(Boolean);
  return { tours, items, hidden };
}

const app = express();
app.use(express.json({ limit: '512kb' }));

// Safari otherwise serves stale HTML for days; assets are content-addressed
// by name, so they get a short cache with revalidation instead.
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  else res.set('Cache-Control', /\.(webp|jpg|png|svg|ico|json)$/.test(req.path)
    ? 'public, max-age=86400'
    : 'no-cache');
  next();
});

// One plan, shared by everyone with the link. `rev` is what lets a client tell
// someone else's change from the echo of its own.
app.get('/api/state', (_req, res) => res.json(load()));

app.put('/api/state', (req, res) => {
  const prev = load();
  const next = { ...cleanState(req.body), rev: (prev.rev || 0) + 1, updated: new Date().toISOString() };
  try { save(next); }
  catch (e) { return res.status(500).json({ error: 'write_failed' }); }
  res.json(next);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`nyc2026 listening on ${port} (plan: ${FILE})`));
