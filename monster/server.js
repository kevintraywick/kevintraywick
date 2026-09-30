import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Static site for Monster Spray post-production: the schedule and the
// festival plan. Same shape as nyc2026 — a standalone Express app in its own
// folder, its own Railway service, served at monster.kevintraywick.com.
const app = express();

// Safari otherwise serves stale HTML for days.
app.use((_req, res, next) => { res.set('Cache-Control', 'no-cache'); next(); });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`monster listening on ${port}`));
