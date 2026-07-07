/* weldon-api — backend for 160weldon.kevintraywick.com
 *
 * Serves the static site from ./site plus a small JSON API:
 *   GET  /api/health
 *   GET  /api/expenses            POST /api/expenses          (manual entry)
 *   POST /api/receipts            (multipart scan → Claude reads it → ledger entry)
 *   GET  /api/utility-bills       POST /api/utility-bills     (multipart scan → Claude reads it)
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
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: [scanBlock(filePath), { type: 'text', text: prompt }] }],
  });
  if (response.stop_reason === 'refusal') throw new Error('The model declined to read this document.');
  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('No readable result from the scan.');
  return JSON.parse(text);
}

const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'vendor', 'description', 'amount', 'category'],
  properties: {
    date: { type: ['string', 'null'], description: 'Purchase date as YYYY-MM-DD, or null if not visible' },
    vendor: { type: 'string', description: 'Store or company name' },
    description: { type: 'string', description: 'Short summary of what was bought, a few words' },
    amount: { type: 'number', description: 'Grand total paid in dollars' },
    category: {
      type: 'string',
      enum: ['Paint & finishes', 'Garden & grounds', 'Systems & appliances', 'Patio & furnishings', 'Hardware & misc'],
    },
  },
};

const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['month', 'utility', 'amount'],
  properties: {
    month: { type: 'string', description: 'Billing month as YYYY-MM (use the service period, not the payment due date)' },
    utility: { type: 'string', enum: ['electricity', 'water', 'internet', 'other'] },
    amount: { type: 'number', description: 'Total amount due for the month, in dollars' },
  },
};

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
  if (req.path === '/gate.html' || req.path === '/api/gate') return next();
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

/* expenses */
app.get('/api/expenses', (req, res) => {
  res.json(db.prepare(`SELECT * FROM expenses ORDER BY date`).all());
});

app.post('/api/expenses', (req, res) => {
  const { date, vendor, description, amount, category } = req.body || {};
  if (!vendor || !description || typeof amount !== 'number' || !(amount >= 0)) {
    return res.status(400).send('vendor, description and a non-negative amount are required');
  }
  const info = db.prepare(
    `INSERT INTO expenses (date, vendor, description, amount, category, source) VALUES (?,?,?,?,?, 'manual')`
  ).run(date || null, vendor, description, amount, category || null);
  res.json(db.prepare(`SELECT * FROM expenses WHERE id=?`).get(info.lastInsertRowid));
});

app.post('/api/receipts', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  try {
    const parsed = await readScan(
      req.file.path,
      'This is a receipt for a purchase related to a residential house. Extract the purchase details. Use the grand total. Pick the closest category.',
      RECEIPT_SCHEMA
    );
    const info = db.prepare(
      `INSERT INTO expenses (date, vendor, description, amount, category, source, receipt_file) VALUES (?,?,?,?,?, 'receipt', ?)`
    ).run(parsed.date, parsed.vendor, parsed.description, parsed.amount, parsed.category, req.file.filename);
    res.json(db.prepare(`SELECT * FROM expenses WHERE id=?`).get(info.lastInsertRowid));
  } catch (e) {
    console.error('receipt scan failed:', e.message);
    res.status(422).send(e.message);
  }
});

/* utility bills */
app.get('/api/utility-bills', (req, res) => {
  res.json(db.prepare(`SELECT * FROM utility_bills ORDER BY month`).all());
});

app.post('/api/utility-bills', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  try {
    const parsed = await readScan(
      req.file.path,
      'This is a utility bill for a residential house in Martin, Tennessee. Identify which utility it is (electricity; water/sewer/garbage counts as water; WK&T fiber or Spectrum counts as internet), the billing month, and the total amount due.',
      BILL_SCHEMA
    );
    const info = db.prepare(
      `INSERT INTO utility_bills (month, utility, amount, scan_file) VALUES (?,?,?,?)`
    ).run(parsed.month, parsed.utility, parsed.amount, req.file.filename);
    res.json(db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(info.lastInsertRowid));
  } catch (e) {
    console.error('bill scan failed:', e.message);
    res.status(422).send(e.message);
  }
});

/* photos */
app.get('/api/photos', (req, res) => {
  const rows = db.prepare(`SELECT * FROM photos ORDER BY created_at, id`).all();
  res.json(rows.map(r => ({ ...r, url: '/uploads/' + r.filename })));
});

app.post('/api/photos', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  if (!MEDIA[path.extname(req.file.filename).toLowerCase()]) {
    fs.unlinkSync(req.file.path);
    return res.status(400).send('photos must be images');
  }
  const area = (req.body.area || 'general').slice(0, 60);
  const info = db.prepare(
    `INSERT INTO photos (area, filename, original_name) VALUES (?,?,?)`
  ).run(area, req.file.filename, req.file.originalname || null);
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
      `INSERT INTO expenses (date, vendor, description, amount, category, source) VALUES (?,?,?,?,?, 'maintenance')`
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
app.use(express.static(path.join(__dirname, 'site')));
app.get('/160weldon', (req, res) => res.redirect('/'));
app.get('/160weldon/*', (req, res) => res.redirect(req.path.replace(/^\/160weldon/, '') || '/'));

app.listen(PORT, () => {
  console.log(`weldon-api listening on ${PORT}, data in ${DATA_DIR}`);
  if (!process.env.ANTHROPIC_API_KEY) console.warn('ANTHROPIC_API_KEY not set — receipt/bill scanning will fail');
  if (!process.env.SMTP_URL) console.log('SMTP_URL not set — maintenance email reminders disabled');
});
