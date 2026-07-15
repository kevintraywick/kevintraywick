/* weldon-api — backend for 160weldon.kevintraywick.com
 *
 * Serves the static site from ./site plus a small JSON API:
 *   GET  /api/health
 *   GET  /api/expenses            POST /api/expenses          (manual entry)
 *   PATCH /api/expenses/:id       DELETE /api/expenses/:id
 *   POST /api/documents           (multipart scan → Claude classifies receipt vs
 *                                  utility bill vs tax vs insurance and files it)
 *   GET  /api/utility-bills
 *   GET  /api/photos              POST /api/photos            (multipart, field `area`)
 *   GET  /api/maintenance         POST /api/maintenance       PATCH /api/maintenance/:id
 *
 * Storage: SQLite + uploaded files under DATA_DIR (Railway volume → mount at /app/data).
 * Env: ANTHROPIC_API_KEY (receipt/bill reading), SMTP_URL + MAIL_FROM (optional, reminders).
 */
import express from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

/* ---------- database ---------- */
const db = new Database(path.join(DATA_DIR, 'weldon.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT, vendor TEXT NOT NULL, description TEXT NOT NULL,
  amount REAL NOT NULL, category TEXT, source TEXT NOT NULL DEFAULT 'manual',
  receipt_file TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS utility_bills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL, utility TEXT NOT NULL, amount REAL NOT NULL,
  scan_file TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  area TEXT NOT NULL DEFAULT 'general', filename TEXT NOT NULL,
  original_name TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS maintenance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, due_date TEXT, repeat TEXT NOT NULL DEFAULT 'none',
  cost REAL, email TEXT, done_at TEXT, reminded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
`);

// migration: work classification on expenses — 'repair' | 'improvement' | NULL (unknown).
// Improvements add to the house's cost basis; repairs don't.
try { db.exec(`ALTER TABLE expenses ADD COLUMN work TEXT`); } catch { /* already added */ }

// one-time seed of the maintenance schedule from the record book
if (!db.prepare(`SELECT v FROM meta WHERE k='seeded'`).get()) {
  const ins = db.prepare(`INSERT INTO maintenance (title, due_date, repeat, cost, done_at) VALUES (?,?,?,?,?)`);
  ins.run('Flush hot water heater', '2025-06-15', 'annual', null, '2025-06-15');
  ins.run('Flush hot water heater', '2026-06-15', 'annual', null, null);
  ins.run('Replace fridge water filter (W10295370A)', '2026-01-15', 'annual', 45, null);
  ins.run('Insurance photo walk-through — every room + exterior', '2026-07-15', 'annual', null, null);
  ins.run('Test fire detectors', '2026-08-01', 'annual', null, null);
  db.prepare(`INSERT INTO meta (k, v) VALUES ('seeded', '1')`).run();
}

/* ---------- claude vision parsing ---------- */
const anthropic = new Anthropic(); // ANTHROPIC_API_KEY from env
const MODEL = 'claude-sonnet-5';

const MEDIA = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

function scanBlock(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const data = fs.readFileSync(filePath).toString('base64');
  if (ext === '.pdf') {
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  }
  const media = MEDIA[ext];
  if (!media) throw new Error('Unsupported file type: ' + ext);
  return { type: 'image', source: { type: 'base64', media_type: media, data } };
}

async function readScan(filePath, prompt, schema) {
  // max_tokens caps the model's thinking + the JSON combined; sonnet-5 thinks
  // adaptively and long scans need real headroom. Streaming avoids the SDK's
  // HTTP timeout on large caps — 64k comfortably covers ~20 receipts per file.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: [scanBlock(filePath), { type: 'text', text: prompt }] }],
  });
  const response = await stream.finalMessage();
  if (response.stop_reason === 'refusal') throw new Error('The model declined to read this document.');
  if (response.stop_reason === 'max_tokens') throw new Error('The scan result was cut off — try a file with fewer pages.');
  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('No readable result from the scan.');
  return JSON.parse(text);
}

/* One classifier for every document dropped anywhere on the site. `kind`
   decides where it's filed: receipts land in the expenses ledger, everything
   else in utility_bills (tax/insurance as annual totals). A single upload may
   hold several documents (e.g. a PDF of many scanned receipts) — the model
   returns one entry per document found. */
const DOC_ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'receipt', 'bill'],
  properties: {
    kind: {
      type: 'string',
      enum: ['receipt', 'utility-bill', 'tax', 'insurance'],
      description: 'receipt = one-time purchase or service invoice; utility-bill = monthly electricity/water/internet bill; tax = property tax statement or notice; insurance = homeowner insurance premium notice or declarations page',
    },
    receipt: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['date', 'vendor', 'description', 'amount', 'category', 'work'],
      description: 'Filled when kind=receipt, null otherwise',
      properties: {
        date: { type: ['string', 'null'], description: 'Purchase date as YYYY-MM-DD, or null if not visible' },
        vendor: { type: 'string', description: 'Store or company name' },
        description: { type: 'string', description: 'Short summary of what was bought, a few words' },
        amount: { type: ['number', 'null'], description: 'Grand total paid in dollars, or null if no total is legible anywhere in the document' },
        category: {
          type: 'string',
          enum: ['Paint & finishes', 'Garden & grounds', 'Systems & appliances', 'Patio & furnishings', 'Hardware & misc'],
        },
        work: {
          type: 'string',
          enum: ['repair', 'improvement', 'unsure'],
          description: 'improvement = adds value or extends the life of the house (new equipment or fixtures, renovation materials, plantings and landscape installs); repair = fixes or maintains what already exists (replacement parts, service calls, upkeep supplies); unsure if genuinely unclear',
        },
      },
    },
    bill: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['month', 'utility', 'amount'],
      description: 'Filled when kind is utility-bill, tax, or insurance; null for receipts',
      properties: {
        month: {
          type: 'string',
          description: 'Billing month as YYYY-MM (use the service period, not the payment due date). For annual documents (property tax, insurance) use the first month of the tax/policy year.',
        },
        utility: { type: 'string', enum: ['electricity', 'water', 'internet', 'tax', 'insurance', 'other'] },
        amount: {
          type: 'number',
          description: 'Total amount due, in dollars. For annual documents (property tax, insurance) use the full-year total, not an installment.',
        },
      },
    },
  },
};

const DOCS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['documents'],
  properties: {
    documents: {
      type: 'array',
      description: 'One entry per distinct document found in the file. A multi-page scan may hold several separate receipts or bills — list each one. A single receipt spanning multiple pages is ONE entry.',
      items: DOC_ENTRY_SCHEMA,
    },
  },
};

const DOC_PROMPT =
  'This file relates to a residential house in Martin, Tennessee. It may contain one document or ' +
  'several scanned into one file (commonly one receipt per page). Identify each distinct document ' +
  'and classify it: a one-time purchase receipt or service invoice (receipt); a monthly utility ' +
  'bill — electricity, water/sewer/garbage counts as water, WK&T fiber or Spectrum counts as ' +
  'internet (utility-bill); a property tax statement or notice, city or county (tax); or a ' +
  'homeowner\'s insurance premium notice or declarations page (insurance). Fill in `receipt` for ' +
  'receipts and `bill` for everything else. For tax and insurance set bill.utility to "tax" or ' +
  '"insurance" and use the ANNUAL total and the first month of the tax/policy year. For receipts ' +
  'use the grand total (null if no total is legible), pick the closest category, and judge `work`: ' +
  'improvement if it adds value or extends the house\'s life, repair if it fixes or maintains what ' +
  'exists, unsure if unclear.';

/* ---------- app ---------- */
const app = express();
app.use(express.json());

/* ---------- emoji gate ----------
 * The whole site sits behind a 3-emoji sequence (see gate.html). The check is
 * server-side: nothing in the served pages reveals the code, and passing it
 * sets a signed long-lived cookie. Change GATE_CODE to change the combination
 * (which also invalidates everyone's cookies). */
const GATE_CODE = process.env.GATE_CODE || '🏠🦉🗝️'; // dev default — production sets GATE_CODE
const GATE_SECRET = process.env.GATE_SECRET ||
  crypto.createHash('sha256').update('weldon-gate:' + GATE_CODE).digest('hex');
const GATE_TOKEN = crypto.createHmac('sha256', GATE_SECRET).update('weldon-open').digest('hex');

function hasGateCookie(req) {
  const m = /(?:^|;\s*)weldon_gate=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const got = Buffer.from(m[1]);
  const want = Buffer.from(GATE_TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const gateTries = new Map(); // ip -> {count, resetAt}
function gateLimited(ip) {
  const now = Date.now();
  const e = gateTries.get(ip);
  if (!e || now > e.resetAt) { gateTries.set(ip, { count: 1, resetAt: now + 10 * 60_000 }); return false; }
  e.count++;
  return e.count > 20; // 20 tries per 10 minutes per IP
}

app.post('/api/gate', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '?';
  if (gateLimited(ip)) return res.status(429).send('too many tries');
  const picks = Array.isArray(req.body?.picks) ? req.body.picks.join('') : '';
  if (picks !== GATE_CODE) return res.status(403).send('nope');
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `weldon_gate=${GATE_TOKEN}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`);
  res.json({ ok: true });
});

app.use((req, res, next) => {
  if (req.path === '/gate.html' || req.path === '/api/gate' || req.path === '/assets/favicon.svg') return next();
  if (req.path === '/api/backup') return next(); // has its own bearer auth (BACKUP_KEY)
  if (hasGateCookie(req)) return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) {
    return res.status(401).send('locked');
  }
  res.redirect('/gate.html');
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => {
      const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8);
      cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

/* off-site backup — the private weldon-backups repo's weekly GitHub Action
   fetches this tarball (consistent sqlite snapshot + all uploaded scans) */
app.get('/api/backup', async (req, res) => {
  const key = process.env.BACKUP_KEY;
  if (!key || req.headers.authorization !== 'Bearer ' + key) return res.status(401).send('locked');
  const snap = path.join(DATA_DIR, 'weldon-backup.db');
  try {
    await db.backup(snap);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', 'attachment; filename="weldon-data.tar.gz"');
    const tar = spawn('tar', ['-czf', '-', '-C', DATA_DIR, 'weldon-backup.db', 'uploads']);
    tar.stdout.pipe(res);
    tar.on('close', () => { try { fs.unlinkSync(snap); } catch {} });
    tar.on('error', () => { try { fs.unlinkSync(snap); } catch {} res.destroy(); });
  } catch (e) {
    console.error('backup failed:', e.message);
    try { fs.unlinkSync(snap); } catch {}
    if (!res.headersSent) res.status(500).send('backup failed');
  }
});

// current gate combination — sits behind the gate middleware, so only
// visitors who already passed can read it (footer hint on every page)
app.get('/api/gate-hint', (req, res) => res.json({ code: GATE_CODE }));

/* expenses */
app.get('/api/expenses', (req, res) => {
  res.json(db.prepare(`SELECT * FROM expenses ORDER BY date`).all());
});

const workOrNull = w => (['repair', 'improvement'].includes(w) ? w : null);

app.post('/api/expenses', (req, res) => {
  const { date, vendor, description, amount, category, work } = req.body || {};
  if (!vendor || !description || typeof amount !== 'number' || !(amount >= 0)) {
    return res.status(400).send('vendor, description and a non-negative amount are required');
  }
  const info = db.prepare(
    `INSERT INTO expenses (date, vendor, description, amount, category, work, source) VALUES (?,?,?,?,?,?, 'manual')`
  ).run(date || null, vendor, description, amount, category || null, workOrNull(work));
  res.json(db.prepare(`SELECT * FROM expenses WHERE id=?`).get(info.lastInsertRowid));
});

app.patch('/api/expenses/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM expenses WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).send('no such entry');
  const { date, vendor, description, amount, category, work } = req.body || {};
  if (!vendor || !description || typeof amount !== 'number' || !(amount >= 0)) {
    return res.status(400).send('vendor, description and a non-negative amount are required');
  }
  db.prepare(`UPDATE expenses SET date=?, vendor=?, description=?, amount=?, category=?, work=? WHERE id=?`)
    .run(date || null, vendor, description, amount, category || null, workOrNull(work), row.id);
  res.json(db.prepare(`SELECT * FROM expenses WHERE id=?`).get(row.id));
});

app.delete('/api/expenses/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM expenses WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).send('no such entry');
  db.prepare(`DELETE FROM expenses WHERE id=?`).run(row.id);
  if (row.receipt_file) {
    try { fs.unlinkSync(path.join(UPLOADS, row.receipt_file)); } catch {}
  }
  res.json({ ok: true });
});

/* unified document intake — classifies the scan and files each document found
   in the right place. One upload may yield several ledger rows. */
app.post('/api/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  try {
    const parsed = await readScan(req.file.path, DOC_PROMPT, DOCS_SCHEMA);
    const results = [];
    for (const doc of parsed.documents || []) {
      if (doc.kind === 'receipt' && doc.receipt) {
        // a receipt with no legible total is still filed (amount 0) — the
        // ledger flags it in red so the user can edit in the real number
        const r = doc.receipt;
        const info = db.prepare(
          `INSERT INTO expenses (date, vendor, description, amount, category, work, source, receipt_file) VALUES (?,?,?,?,?,?, 'receipt', ?)`
        ).run(r.date, r.vendor, r.description, r.amount > 0 ? r.amount : 0, r.category, workOrNull(r.work), req.file.filename);
        results.push({ routed: 'expenses', entry: db.prepare(`SELECT * FROM expenses WHERE id=?`).get(info.lastInsertRowid) });
      } else if (doc.bill) {
        const b = doc.bill;
        const info = db.prepare(
          `INSERT INTO utility_bills (month, utility, amount, scan_file) VALUES (?,?,?,?)`
        ).run(b.month, b.utility, b.amount, req.file.filename);
        results.push({ routed: 'utility-bills', entry: db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(info.lastInsertRowid) });
      }
    }
    if (!results.length) return res.status(422).send('could not find any receipt or bill in this document');
    res.json({ results });
  } catch (e) {
    console.error('document scan failed:', e.message);
    res.status(422).send(e.message);
  }
});

/* utility bills */
app.get('/api/utility-bills', (req, res) => {
  res.json(db.prepare(`SELECT * FROM utility_bills ORDER BY month`).all());
});

/* photos */
app.get('/api/photos', (req, res) => {
  const rows = db.prepare(`SELECT * FROM photos ORDER BY created_at, id`).all();
  res.json(rows.map(r => ({ ...r, url: '/uploads/' + r.filename })));
});

app.post('/api/photos', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  if (!MEDIA[path.extname(req.file.filename).toLowerCase()]) {
    fs.unlinkSync(req.file.path);
    return res.status(400).send('photos must be images');
  }
  // photos are documentation, not evidence like receipts — recompress to webp
  // (capped at 2400px) to keep the volume lean; gif kept as-is for animation
  let filename = req.file.filename;
  if (!/\.(webp|gif)$/i.test(filename)) {
    const webpName = filename.replace(/\.[^.]*$/, '') + '.webp';
    try {
      await sharp(req.file.path).rotate()
        .resize(2400, 2400, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(UPLOADS, webpName));
      fs.unlinkSync(req.file.path);
      filename = webpName;
    } catch { /* not decodable as an image — keep the original file */ }
  }
  const area = (req.body.area || 'general').slice(0, 60);
  const info = db.prepare(
    `INSERT INTO photos (area, filename, original_name) VALUES (?,?,?)`
  ).run(area, filename, req.file.originalname || null);
  const row = db.prepare(`SELECT * FROM photos WHERE id=?`).get(info.lastInsertRowid);
  res.json({ ...row, url: '/uploads/' + row.filename });
});

/* maintenance */
app.get('/api/maintenance', (req, res) => {
  res.json(db.prepare(`SELECT * FROM maintenance ORDER BY COALESCE(done_at, due_date)`).all());
});

app.post('/api/maintenance', (req, res) => {
  const { title, due_date, repeat, cost, email } = req.body || {};
  if (!title) return res.status(400).send('title is required');
  const rep = ['none', 'monthly', 'annual'].includes(repeat) ? repeat : 'none';
  const info = db.prepare(
    `INSERT INTO maintenance (title, due_date, repeat, cost, email) VALUES (?,?,?,?,?)`
  ).run(title, due_date || null, rep, typeof cost === 'number' ? cost : null, email || null);
  res.json(db.prepare(`SELECT * FROM maintenance WHERE id=?`).get(info.lastInsertRowid));
});

function nextDue(date, repeat) {
  const d = new Date(date + 'T12:00:00');
  if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

app.patch('/api/maintenance/:id', (req, res) => {
  const task = db.prepare(`SELECT * FROM maintenance WHERE id=?`).get(req.params.id);
  if (!task) return res.status(404).send('no such task');
  if (!req.body?.done || task.done_at) return res.json({ task });

  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`UPDATE maintenance SET done_at=? WHERE id=?`).run(today, task.id);

  // cost flows back into the expenses ledger
  let expense = null;
  if (task.cost) {
    const info = db.prepare(
      `INSERT INTO expenses (date, vendor, description, amount, category, work, source) VALUES (?,?,?,?,?, 'repair', 'maintenance')`
    ).run(today, 'Maintenance', task.title, task.cost, 'Systems & appliances');
    expense = db.prepare(`SELECT * FROM expenses WHERE id=?`).get(info.lastInsertRowid);
  }

  // repeating tasks schedule the next occurrence
  let next = null;
  if (task.repeat !== 'none' && task.due_date) {
    const info = db.prepare(
      `INSERT INTO maintenance (title, due_date, repeat, cost, email) VALUES (?,?,?,?,?)`
    ).run(task.title, nextDue(task.due_date, task.repeat), task.repeat, task.cost, task.email);
    next = db.prepare(`SELECT * FROM maintenance WHERE id=?`).get(info.lastInsertRowid);
  }

  res.json({ task: db.prepare(`SELECT * FROM maintenance WHERE id=?`).get(task.id), expense, next });
});

/* ---------- email reminders (optional — needs SMTP_URL) ---------- */
async function sendReminders() {
  if (!process.env.SMTP_URL) return;
  const soon = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const due = db.prepare(
    `SELECT * FROM maintenance WHERE done_at IS NULL AND reminded_at IS NULL AND email IS NOT NULL AND due_date <= ?`
  ).all(soon);
  if (!due.length) return;
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport(process.env.SMTP_URL);
  for (const t of due) {
    try {
      await transport.sendMail({
        from: process.env.MAIL_FROM || 'weldon@kevintraywick.com',
        to: t.email,
        subject: '160 Weldon maintenance due: ' + t.title,
        text: `"${t.title}" is due ${t.due_date}.` +
          (t.cost ? ` Budgeted cost: $${t.cost}.` : '') +
          `\n\nCheck it off at https://160weldon.kevintraywick.com/house.html` +
          (t.repeat !== 'none' ? `\n(repeats ${t.repeat})` : ''),
      });
      db.prepare(`UPDATE maintenance SET reminded_at=datetime('now') WHERE id=?`).run(t.id);
      console.log('reminder sent for task', t.id);
    } catch (e) { console.error('reminder failed for task', t.id, e.message); }
  }
}
setInterval(sendReminders, 12 * 3600_000);
sendReminders();

/* ---------- static ---------- */
app.use('/uploads', express.static(UPLOADS, { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, 'site'), {
  setHeaders(res, filePath) {
    // HTML must revalidate on every load so deploys take effect immediately
    // (Safari's heuristic cache once served a stale page against a newer API);
    // css/js/assets may cache but revalidate via ETag.
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'max-age=0, must-revalidate');
  },
}));
app.get('/160weldon', (req, res) => res.redirect('/'));
app.get('/160weldon/*', (req, res) => res.redirect(req.path.replace(/^\/160weldon/, '') || '/'));

app.listen(PORT, () => {
  console.log(`weldon-api listening on ${PORT}, data in ${DATA_DIR}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY not set — receipt/bill scanning will fail');
  if (!process.env.SMTP_URL) console.log('SMTP_URL not set — maintenance email reminders disabled');
});
