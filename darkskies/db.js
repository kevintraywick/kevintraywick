// Data layer with two backends:
//   - Postgres  (when DATABASE_URL is set — i.e. on Railway)
//   - JSON file (local fallback so the app runs with no database for dev/testing)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AV_DAYS = 91; // Sep 1 – Nov 30 2026
const AV_START = Date.UTC(2026, 8, 1);

const SEED_PEOPLE = [
  { name: 'Ashley', slots: range('2026-09-07', '2026-09-14', 'yes') },
  { name: 'Ian',    slots: range('2026-09-04', '2026-09-14', 'yes') },
  { name: 'Kevin',  slots: range('2026-09-03', '2026-09-13', 'yes') },
  { name: 'Sean',   slots: range('2026-09-10', '2026-09-18', 'maybe') },
  { name: 'Zelda',  slots: range('2026-09-11', '2026-09-15', 'maybe') }
];
const SEED_COMMENTS = [
  { name: 'Kevin', body: "Kicking this off! Leaning Big Bend for the darkest skies. Sept new moon looks ideal — thoughts?" },
  { name: 'Sean',  body: "Zelda's in if it's not a school week. Watching Seattle fares." }
];

function range(a, b, mode) {
  const s = new Array(AV_DAYS).fill('');
  const ai = Math.round((Date.parse(a + 'T00:00:00Z') - AV_START) / 86400000);
  const bi = Math.round((Date.parse(b + 'T00:00:00Z') - AV_START) / 86400000);
  for (let x = Math.max(0, ai); x <= Math.min(AV_DAYS - 1, bi); x++) s[x] = mode;
  return s;
}
function normalizeSlots(slots) {
  const out = new Array(AV_DAYS).fill('');
  if (Array.isArray(slots)) for (let i = 0; i < Math.min(AV_DAYS, slots.length); i++) out[i] = slots[i] || '';
  return out;
}

/* ---------------- Postgres backend ---------------- */
async function makePgBackend(connectionString) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false }
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS people (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slots JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS ideas (
      id SERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      url TEXT,
      title TEXT,
      image TEXT,
      added_by TEXT NOT NULL DEFAULT 'Anonymous',
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  // seed once if empty
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM people');
  if (rows[0].n === 0) {
    for (const p of SEED_PEOPLE)
      await pool.query('INSERT INTO people(name, slots) VALUES ($1,$2)', [p.name, JSON.stringify(p.slots)]);
    for (const c of SEED_COMMENTS)
      await pool.query('INSERT INTO comments(name, body) VALUES ($1,$2)', [c.name, c.body]);
  }
  return {
    async getPeople() {
      const r = await pool.query('SELECT id, name, slots FROM people ORDER BY lower(name)');
      return r.rows.map(p => ({ id: p.id, name: p.name, slots: normalizeSlots(p.slots) }));
    },
    async addPerson(name) {
      const r = await pool.query('INSERT INTO people(name, slots) VALUES ($1,$2) RETURNING id, name, slots',
        [name, JSON.stringify(new Array(AV_DAYS).fill(''))]);
      const p = r.rows[0]; return { id: p.id, name: p.name, slots: normalizeSlots(p.slots) };
    },
    async setSlots(id, slots) {
      await pool.query('UPDATE people SET slots=$1 WHERE id=$2', [JSON.stringify(normalizeSlots(slots)), id]);
    },
    async getComments() {
      const r = await pool.query('SELECT id, name, body, EXTRACT(EPOCH FROM created_at)*1000 AS ts FROM comments ORDER BY created_at ASC');
      return r.rows.map(c => ({ id: c.id, name: c.name, body: c.body, ts: Number(c.ts) }));
    },
    async addComment(name, body) {
      const r = await pool.query('INSERT INTO comments(name, body) VALUES ($1,$2) RETURNING id, name, body, EXTRACT(EPOCH FROM created_at)*1000 AS ts', [name, body]);
      const c = r.rows[0]; return { id: c.id, name: c.name, body: c.body, ts: Number(c.ts) };
    },
    async getIdeas() {
      const r = await pool.query('SELECT id, kind, url, title, image, added_by, EXTRACT(EPOCH FROM created_at)*1000 AS ts FROM ideas ORDER BY created_at DESC');
      return r.rows.map(i => ({ id: i.id, kind: i.kind, url: i.url, title: i.title, image: i.image, addedBy: i.added_by, ts: Number(i.ts) }));
    },
    async addIdea({ kind, url, title, image, addedBy }) {
      const r = await pool.query(
        'INSERT INTO ideas(kind, url, title, image, added_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, kind, url, title, image, added_by, EXTRACT(EPOCH FROM created_at)*1000 AS ts',
        [kind, url, title, image, addedBy]);
      const i = r.rows[0]; return { id: i.id, kind: i.kind, url: i.url, title: i.title, image: i.image, addedBy: i.added_by, ts: Number(i.ts) };
    },
    async deleteIdea(id) { await pool.query('DELETE FROM ideas WHERE id=$1', [id]); }
  };
}

/* ---------------- JSON-file backend (local dev) ---------------- */
function makeFileBackend() {
  const file = path.join(__dirname, 'data.json');
  let data;
  const save = () => fs.writeFileSync(file, JSON.stringify(data, null, 2));
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    let n = 0;
    data = {
      people: SEED_PEOPLE.map(p => ({ id: ++n, name: p.name, slots: p.slots })),
      comments: SEED_COMMENTS.map(c => ({ id: ++n, name: c.name, body: c.body, ts: Date.now() })),
      ideas: []
    };
    save();
  }
  if (!Array.isArray(data.ideas)) data.ideas = [];
  let seq = Math.max(0, ...[...data.people, ...data.comments, ...data.ideas].map(x => x.id));
  return {
    async getPeople() { return data.people.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ id: p.id, name: p.name, slots: normalizeSlots(p.slots) })); },
    async addPerson(name) { const p = { id: ++seq, name, slots: new Array(AV_DAYS).fill('') }; data.people.push(p); save(); return p; },
    async setSlots(id, slots) { const p = data.people.find(x => x.id === id); if (p) { p.slots = normalizeSlots(slots); save(); } },
    async getComments() { return data.comments.slice().sort((a, b) => a.ts - b.ts); },
    async addComment(name, body) { const c = { id: ++seq, name, body, ts: Date.now() }; data.comments.push(c); save(); return c; },
    async getIdeas() { return data.ideas.slice().sort((a, b) => b.ts - a.ts); },
    async addIdea({ kind, url, title, image, addedBy }) { const i = { id: ++seq, kind, url: url || null, title: title || null, image: image || null, addedBy, ts: Date.now() }; data.ideas.push(i); save(); return i; },
    async deleteIdea(id) { data.ideas = data.ideas.filter(x => x.id !== id); save(); }
  };
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    console.log('[db] using Postgres');
    return await makePgBackend(process.env.DATABASE_URL);
  }
  console.log('[db] no DATABASE_URL — using local data.json (dev mode)');
  return makeFileBackend();
}

export { AV_DAYS };
