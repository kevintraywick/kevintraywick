import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Static site for Monster Spray post-production: the schedule and the
// festival plan. Same shape as nyc2026 — a standalone Express app in its own
// folder, its own Railway service, served at monster.kevintraywick.com.
//
// The schedule is editable in the browser (drag a pill to another week,
// click to edit, + to add). It lives in one JSON file. DATA_DIR is /app/data
// on Railway (the volume mount) — if it isn't set the file lands on ephemeral
// container storage and every deploy resets it to the seed.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'schedule.json');
const SEED = path.join(__dirname, 'schedule-seed.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch { return { ...JSON.parse(fs.readFileSync(SEED, 'utf8')), rev: 0, updated: null }; }
}
function save(state) {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);          // atomic
}

// Unauthenticated by choice (two people, one link), so the shape is checked
// rather than trusted: anything unexpected is dropped, not stored.
const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null);
const dayRe = /^\d{4}-\d{2}-\d{2}$/;
function cleanItems(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map(it => {
    if (!it || typeof it !== 'object') return null;
    const id = str(it.id, 40), text = str(it.text, 200);
    if (!id || !/^[\w-]{1,40}$/.test(id) || !text || !text.trim()) return null;
    // ms: the exact day of a milestone that lives on the MoveIt sprint (see syncToMoveIt).
    const ms = typeof it.ms === 'string' && dayRe.test(it.ms) ? it.ms : null;
    return ms ? { id, text: text.trim(), ms } : { id, text: text.trim() };
  }).filter(Boolean);
}
function cleanState(body) {
  const people = (Array.isArray(body?.people) ? body.people : []).slice(0, 6).map(p => str(p, 30)).filter(Boolean);
  const weeks = (Array.isArray(body?.weeks) ? body.weeks : []).slice(0, 30).map(w => {
    if (!w || typeof w !== 'object') return null;
    const end = str(w.end, 10);
    if (!end || !dayRe.test(end)) return null;
    const label = str(w.label, 60) || '';
    const items = {};
    for (const p of people) items[p] = cleanItems(w.items?.[p]);
    return { end, label, items };
  }).filter(Boolean);
  return { people: people.length ? people : ['Kevin', 'Nick'], weeks };
}

const app = express();
app.use(express.json({ limit: '256kb' }));

// Safari otherwise serves stale HTML for days.
app.use((req, res, next) => { res.set('Cache-Control', req.path.startsWith('/api/') ? 'no-store' : 'no-cache'); next(); });

app.get('/api/schedule', (_req, res) => res.json(load()));

// ---- Milestones shared with the MoveIt sprint (2026-11-02) ----
// An item with `ms` is one of the sprint's milestones (ms = its exact day; the page shows only the
// name). MoveIt pushes its milestone edits here with x-sync-origin: moveit. Edits made here — a
// rename, a drag to another week (the day moves by whole weeks, keeping its weekday), a delete —
// go back to the sprint as its whole milestone list. Off unless MOVEIT_SPRINT_URL (the sprint's
// PUT /api/sprints/:id) and MOVEIT_KEY (the MoveIt AI_ACCESS_KEY) are set.
const MOVEIT_SPRINT_URL = process.env.MOVEIT_SPRINT_URL || '';
const MOVEIT_KEY = process.env.MOVEIT_KEY || '';
const addDays = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function linkedItems(state) {
  const out = new Map();
  for (const w of state.weeks || []) for (const list of Object.values(w.items || {})) for (const it of list || []) if (it.ms) out.set(it.id, { it, end: w.end });
  return out;
}
// Moves each dragged milestone's day with its week; returns true when the sprint needs telling.
function reconcileMilestones(prev, next) {
  const before = linkedItems(prev), after = linkedItems(next);
  let changed = before.size !== after.size;
  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) { changed = true; continue; }
    // The stored day is the truth (the page may still hold a stale one); a drag moves it by whole weeks.
    if (b.end !== a.end) {
      const weeks = Math.round((new Date(a.end) - new Date(b.end)) / (7 * 864e5));
      a.it.ms = addDays(b.it.ms, weeks * 7);
      changed = true;
    } else a.it.ms = b.it.ms;
    if (b.it.text !== a.it.text) changed = true;
  }
  return changed;
}
async function syncToMoveIt(state) {
  const milestones = [...linkedItems(state).values()].map(({ it }) => ({ id: it.id, day: it.ms, label: it.text.slice(0, 40) }));
  const res = await fetch(MOVEIT_SPRINT_URL, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-ai-key': MOVEIT_KEY, 'x-sync-origin': 'schedule' },
    body: JSON.stringify({ milestones })
  });
  if (!res.ok) throw new Error('MoveIt PUT ' + res.status);
}

app.put('/api/schedule', (req, res) => {
  const prev = load();
  const next = { ...cleanState(req.body), rev: (prev.rev || 0) + 1, updated: new Date().toISOString() };
  const fromMoveIt = req.get('x-sync-origin') === 'moveit';
  const tell = !fromMoveIt && reconcileMilestones(prev, next);
  try { save(next); }
  catch (e) { return res.status(500).json({ error: 'write_failed' }); }
  res.json(next);
  if (tell && MOVEIT_SPRINT_URL && MOVEIT_KEY) syncToMoveIt(next).catch(e => console.error('moveit sync:', e.message));
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`monster listening on ${port} (schedule: ${FILE})`));
