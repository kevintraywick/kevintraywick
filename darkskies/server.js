import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const db = await initDb();

const clean = (s, max) => String(s ?? '').trim().slice(0, max);

// One call powers the client's initial load + polling.
app.get('/api/state', async (_req, res) => {
  try {
    const [people, comments] = await Promise.all([db.getPeople(), db.getComments()]);
    res.json({ people, comments });
  } catch (e) { console.error(e); res.status(500).json({ error: 'state_failed' }); }
});

app.post('/api/comments', async (req, res) => {
  const name = clean(req.body.name, 40) || 'Anonymous';
  const body = clean(req.body.body, 2000);
  if (!body) return res.status(400).json({ error: 'empty' });
  try { res.json(await db.addComment(name, body)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'add_comment_failed' }); }
});

app.post('/api/people', async (req, res) => {
  const name = clean(req.body.name, 40);
  if (!name) return res.status(400).json({ error: 'empty' });
  try { res.json(await db.addPerson(name)); }
  catch (e) { console.error(e); res.status(500).json({ error: 'add_person_failed' }); }
});

app.put('/api/people/:id/slots', async (req, res) => {
  const id = Number(req.params.id);
  const slots = Array.isArray(req.body.slots) ? req.body.slots : null;
  if (!id || !slots) return res.status(400).json({ error: 'bad_request' });
  try { await db.setSlots(id, slots); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'set_slots_failed' }); }
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Dark Skies listening on :${port}`));
