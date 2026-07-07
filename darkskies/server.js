import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '8mb' })); // images arrive as downscaled data URLs
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

const db = await initDb();

const clean = (s, max) => String(s ?? '').trim().slice(0, max);

const isHttpUrl = (u) => {
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; }
  catch { return false; }
};

// One call powers the client's initial load + polling.
app.get('/api/state', async (_req, res) => {
  try {
    const [people, comments, ideas] = await Promise.all([db.getPeople(), db.getComments(), db.getIdeas()]);
    res.json({ people, comments, ideas });
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

// Shared "idea board" — group members drop links or images.
app.post('/api/ideas', async (req, res) => {
  const kind = clean(req.body.kind, 10);
  const addedBy = clean(req.body.added_by, 40) || 'Anonymous';
  try {
    if (kind === 'url') {
      const url = clean(req.body.url, 2000);
      if (!isHttpUrl(url)) return res.status(400).json({ error: 'bad_url' });
      const title = clean(req.body.title, 200) || null;
      return res.json(await db.addIdea({ kind, url, title, image: null, addedBy }));
    }
    if (kind === 'image') {
      const image = String(req.body.image ?? '');
      if (!image.startsWith('data:image/') || image.length > 7_500_000)
        return res.status(400).json({ error: 'bad_image' });
      const title = clean(req.body.title, 200) || null;
      return res.json(await db.addIdea({ kind, url: null, title, image, addedBy }));
    }
    return res.status(400).json({ error: 'bad_kind' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'add_idea_failed' }); }
});

app.delete('/api/ideas/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'bad_request' });
  try { await db.deleteIdea(id); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: 'delete_idea_failed' }); }
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Dark Skies listening on :${port}`));
