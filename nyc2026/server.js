import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'picks.json');
const PEOPLE = ['Lisa', 'Amy', 'Kevin'];
const FIELDS = ['out', 'back', 'flightOut', 'flightBack', 'hotel'];

fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { picks: {}, updated: null }; }
}
function save(state) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);
}

const app = express();
app.use(express.json({ limit: '16kb' }));
app.use((_req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/state', (_req, res) => res.json(load()));

app.put('/api/picks/:name', (req, res) => {
  const name = req.params.name;
  if (!PEOPLE.includes(name)) return res.status(400).json({ error: 'unknown_person' });
  const body = req.body || {};
  const picks = {};
  for (const f of FIELDS) {
    const v = body[f];
    if (v === null || v === undefined || v === '') continue;
    if (typeof v !== 'string' || v.length > 60) return res.status(400).json({ error: 'bad_value' });
    picks[f] = v;
  }
  const state = load();
  state.picks[name] = { ...picks, savedAt: new Date().toISOString() };
  state.updated = new Date().toISOString();
  save(state);
  res.json(state);
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`nyc2026 listening on ${port} (data: ${FILE})`));
