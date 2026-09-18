import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Safari otherwise serves stale HTML for days; assets are content-addressed
// by name, so they get a short cache with revalidation instead.
app.use((req, res, next) => {
  res.set('Cache-Control', /\.(webp|jpg|png|svg|ico)$/.test(req.path)
    ? 'public, max-age=86400'
    : 'no-cache');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/healthz', (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`nyc2026 listening on ${port}`));
