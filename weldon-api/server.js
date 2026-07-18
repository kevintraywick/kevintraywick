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
 *   GET  /api/paint-chips         POST /api/paint-chips       (multipart chip photo → Claude
 *                                 DELETE /api/paint-chips/:id  reads color/brand/code/hex)
 *   GET  /api/maintenance         POST /api/maintenance       PATCH /api/maintenance/:id
 *
 * Storage: SQLite + uploaded files under DATA_DIR (Railway volume → mount at /app/data).
 * Env: ANTHROPIC_API_KEY (receipt/bill reading), SMTP_URL + MAIL_FROM (optional, reminders).
 */
import express from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import Anthropic, { toFile } from '@anthropic-ai/sdk';
import heicConvert from 'heic-convert';
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
CREATE TABLE IF NOT EXISTS paint_chips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  color TEXT NOT NULL, brand TEXT, code TEXT, hex TEXT, room TEXT, store TEXT,
  photo TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

const FILES_BETA = 'files-api-2025-04-14';
// base64 inflates a file by ~33%, and the Messages API caps requests at 32MB —
// so PDFs past this size are uploaded via the Files API and referenced by id
const SCAN_INLINE_MAX = Number(process.env.SCAN_INLINE_MAX || 20 * 1024 * 1024);

async function scanBlock(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf' && fs.statSync(filePath).size > SCAN_INLINE_MAX) {
    const uploaded = await anthropic.beta.files.upload({
      file: await toFile(fs.createReadStream(filePath), path.basename(filePath), { type: 'application/pdf' }),
      betas: [FILES_BETA],
    });
    return { block: { type: 'document', source: { type: 'file', file_id: uploaded.id } }, fileId: uploaded.id };
  }
  const data = fs.readFileSync(filePath).toString('base64');
  if (ext === '.pdf') {
    return { block: { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } };
  }
  const media = MEDIA[ext];
  if (!media) throw new Error('Unsupported file type: ' + ext);
  return { block: { type: 'image', source: { type: 'base64', media_type: media, data } } };
}

async function readScan(filePath, prompt, schema) {
  // max_tokens caps the model's thinking + the JSON combined; sonnet-5 thinks
  // adaptively and long scans need real headroom. Streaming avoids the SDK's
  // HTTP timeout on large caps — 64k comfortably covers ~20 receipts per file.
  const { block, fileId } = await scanBlock(filePath);
  const params = {
    model: MODEL,
    max_tokens: 64000,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
  };
  const stream = fileId
    ? anthropic.beta.messages.stream({ ...params, betas: [FILES_BETA] })
    : anthropic.messages.stream(params);
  try {
    const response = await stream.finalMessage();
    if (response.stop_reason === 'refusal') throw new Error('The model declined to read this document.');
    if (response.stop_reason === 'max_tokens') throw new Error('The scan result was cut off — try a file with fewer pages.');
    const text = response.content.find(b => b.type === 'text')?.text;
    if (!text) throw new Error('No readable result from the scan.');
    return JSON.parse(text);
  } finally {
    // Anthropic file storage is capped per org — clean up after the scan
    if (fileId) anthropic.beta.files.delete(fileId, { betas: [FILES_BETA] }).catch(() => {});
  }
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
      required: ['date', 'vendor', 'description', 'amount', 'category', 'work', 'marked'],
      description: 'Filled when kind=receipt, null otherwise',
      properties: {
        date: { type: ['string', 'null'], description: 'Purchase date as YYYY-MM-DD, or null if not visible' },
        vendor: { type: 'string', description: 'Store or company name' },
        description: { type: 'string', description: 'Short summary of what was bought, a few words' },
        amount: { type: ['number', 'null'], description: 'Grand total paid in dollars — or, when line items are hand-marked, the sum of just the marked items. Null if no total is legible anywhere in the document' },
        marked: {
          type: 'boolean',
          description: 'true when amount covers only hand-marked (circled / highlighted / underlined) line items instead of the receipt grand total',
        },
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
  'exists, unsure if unclear. EXCEPTION — hand-marked items: if a receipt has one or more line ' +
  'items singled out by hand (circled, highlighted, underlined, starred, or an arrow drawn at ' +
  'them), only those items belong in the ledger: set amount to the sum of the marked items\' line ' +
  'prices (include tax only where the receipt itemizes it per line), name the marked item(s) in ' +
  'the description, and set marked=true — ignore every unmarked item (e.g. groceries bought ' +
  'alongside one house item). A mark on the total line itself, or store-printed emphasis, does ' +
  'not count — that\'s still the grand total with marked=false.';

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
  limits: { fileSize: 32 * 1024 * 1024 }, // matches the Claude API's 32MB PDF ceiling
});

/* iPhone photos arrive as HEIC, which neither sharp's prebuilt libvips nor
 * the Claude API can read — convert to JPEG on arrival (in place: the file
 * is renamed, so everything downstream sees a plain .jpg). */
async function normalizeHeic(file) {
  if (!/\.hei[cf]$/i.test(file.filename)) return;
  const jpeg = await heicConvert({ buffer: fs.readFileSync(file.path), format: 'JPEG', quality: 0.9 });
  const newName = file.filename.replace(/\.[^.]*$/, '.jpg');
  const newPath = path.join(UPLOADS, newName);
  fs.writeFileSync(newPath, Buffer.from(jpeg));
  fs.unlinkSync(file.path);
  file.filename = newName;
  file.path = newPath;
}

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
  // the scan file is NOT unlinked here — a multi-receipt PDF is shared by
  // several rows, so deleting one row must not break the siblings' links.
  // The daily orphan sweep removes the file once nothing references it.
  res.json({ ok: true });
});

/* unified document intake — classifies the scan and files each document found
   in the right place. One upload may yield several ledger rows. Documents that
   look like duplicates of existing rows are NOT inserted — they come back in
   `suspects` and the page asks the user before posting them to /confirm. */
function insertReceipt(r, scanFile) {
  // marked = the scan had circled/highlighted items and amount covers only those;
  // tag the row so the partial total is explainable (and editable) in the ledger
  const desc = r.marked ? `${r.description} (marked item only)` : r.description;
  const info = db.prepare(
    `INSERT INTO expenses (date, vendor, description, amount, category, work, source, receipt_file) VALUES (?,?,?,?,?,?, 'receipt', ?)`
  ).run(r.date, r.vendor, desc, r.amount > 0 ? r.amount : 0, r.category, workOrNull(r.work), scanFile);
  return { routed: 'expenses', entry: db.prepare(`SELECT * FROM expenses WHERE id=?`).get(info.lastInsertRowid) };
}
function insertBill(b, scanFile) {
  const info = db.prepare(
    `INSERT INTO utility_bills (month, utility, amount, scan_file) VALUES (?,?,?,?)`
  ).run(b.month, b.utility, b.amount, scanFile);
  return { routed: 'utility-bills', entry: db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(info.lastInsertRowid) };
}

app.post('/api/documents', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  try {
    await normalizeHeic(req.file);
    const parsed = await readScan(req.file.path, DOC_PROMPT, DOCS_SCHEMA);
    const results = [];
    const suspects = [];
    for (const doc of parsed.documents || []) {
      if (doc.kind === 'receipt' && doc.receipt) {
        // a receipt with no legible total is still filed (amount 0) — the
        // ledger flags it in red so the user can edit in the real number
        const r = doc.receipt;
        // vendor matched loosely (case/whitespace jitter between scans of the
        // same receipt); amount and date must match exactly
        const match = db.prepare(
          `SELECT * FROM expenses WHERE TRIM(vendor)=TRIM(?) COLLATE NOCASE AND amount=? AND COALESCE(date,'')=COALESCE(?,'')`
        ).get(r.vendor, r.amount > 0 ? r.amount : 0, r.date);
        if (match) { suspects.push({ routed: 'expenses', doc, match }); continue; }
        results.push(insertReceipt(r, req.file.filename));
      } else if (doc.bill) {
        const b = doc.bill;
        const match = db.prepare(`SELECT * FROM utility_bills WHERE month=? AND utility=?`).get(b.month, b.utility);
        if (match) { suspects.push({ routed: 'utility-bills', doc, match }); continue; }
        results.push(insertBill(b, req.file.filename));
      }
    }
    if (!results.length && !suspects.length) return res.status(422).send('could not find any receipt or bill in this document');
    res.json({ results, suspects, scan_file: req.file.filename });
  } catch (e) {
    console.error('document scan failed:', e.message);
    res.status(422).send(e.message);
  }
});

/* second half of the duplicate dialog: the user said "add it anyway" (or, for
   a bill, "replace the existing month") */
app.post('/api/documents/confirm', (req, res) => {
  const { doc, scan_file, replaceId } = req.body || {};
  const scanFile = typeof scan_file === 'string' ? path.basename(scan_file) : null;
  if (doc?.kind === 'receipt' && doc.receipt?.vendor) {
    return res.json(insertReceipt(doc.receipt, scanFile));
  }
  if (doc?.bill?.month && doc.bill.utility) {
    const b = doc.bill;
    if (replaceId) {
      const row = db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(replaceId);
      if (!row) return res.status(404).send('no such bill');
      db.prepare(`UPDATE utility_bills SET month=?, utility=?, amount=?, scan_file=? WHERE id=?`)
        .run(b.month, b.utility, b.amount, scanFile || row.scan_file, row.id);
      return res.json({ routed: 'utility-bills', replaced: true, entry: db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(row.id) });
    }
    return res.json(insertBill(b, scanFile));
  }
  res.status(400).send('nothing to confirm');
});

/* utility bills */
const UTILITIES = ['electricity', 'water', 'internet', 'tax', 'insurance', 'other'];

app.patch('/api/utility-bills/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).send('no such bill');
  const { month, utility, amount } = req.body || {};
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : row.month;
  const u = UTILITIES.includes(utility) ? utility : row.utility;
  const a = Number.isFinite(+amount) && +amount >= 0 ? +amount : row.amount;
  db.prepare(`UPDATE utility_bills SET month=?, utility=?, amount=? WHERE id=?`).run(m, u, a, row.id);
  res.json(db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(row.id));
});

app.delete('/api/utility-bills/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM utility_bills WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).send('no such bill');
  db.prepare(`DELETE FROM utility_bills WHERE id=?`).run(row.id);
  // scan_file deliberately kept — one uploaded PDF can back several rows
  res.json({ ok: true });
});

app.get('/api/utility-bills', (req, res) => {
  res.json(db.prepare(`SELECT * FROM utility_bills ORDER BY month`).all());
});

/* paint chips — photograph a chip / swatch card and Claude reads the color.
   The filename often carries context (room, store) — passed as a hint. */
const PAINT_CHIP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['color', 'brand', 'code', 'hex', 'room', 'store'],
  properties: {
    color: { type: 'string', description: 'The paint color name as printed on the chip (or the best reading of it)' },
    brand: { type: ['string', 'null'], description: 'Paint brand (Sherwin-Williams, Behr, Valspar, ColorPlace, ...) or null if not visible' },
    code: { type: ['string', 'null'], description: 'Printed color code / number on the chip, or null' },
    hex: { type: ['string', 'null'], description: 'Best-estimate #RRGGBB of the swatch color itself, judged from the photo' },
    room: { type: ['string', 'null'], description: 'Room this paint is for, if the filename or photo hints at it; null otherwise' },
    store: { type: ['string', 'null'], description: 'Store it came from, if the filename or photo hints at it; null otherwise' },
  },
};

const paintChipPrompt = originalName =>
  'This photo shows a paint chip / swatch / sample card (or a paint can label) for a residential ' +
  'house. Read the color name, brand, and any printed color code. Estimate the swatch color ' +
  'itself as a #RRGGBB hex value from the photo (compensate for lighting — chips are usually ' +
  'photographed indoors). The original filename may carry the room and store, use it as a hint: ' +
  JSON.stringify(originalName || '') + '. Use null for anything you cannot determine.';

app.get('/api/paint-chips', (req, res) => {
  res.json(db.prepare(`SELECT * FROM paint_chips ORDER BY created_at, id`).all());
});

app.post('/api/paint-chips', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  try {
    await normalizeHeic(req.file);
    const p = await readScan(req.file.path, paintChipPrompt(req.file.originalname), PAINT_CHIP_SCHEMA);
    if (!p.color) return res.status(422).send('could not read a color name off this photo');
    const hex = /^#[0-9a-fA-F]{6}$/.test(p.hex || '') ? p.hex.toUpperCase() : null;
    const info = db.prepare(
      `INSERT INTO paint_chips (color, brand, code, hex, room, store, photo) VALUES (?,?,?,?,?,?,?)`
    ).run(p.color, p.brand || null, p.code || null, hex, p.room || null, p.store || null, req.file.filename);
    res.json(db.prepare(`SELECT * FROM paint_chips WHERE id=?`).get(info.lastInsertRowid));
  } catch (e) {
    console.error('paint chip scan failed:', e.message);
    res.status(422).send(e.message);
  }
});

app.delete('/api/paint-chips/:id', (req, res) => {
  const row = db.prepare(`SELECT * FROM paint_chips WHERE id=?`).get(req.params.id);
  if (!row) return res.status(404).send('no such chip');
  db.prepare(`DELETE FROM paint_chips WHERE id=?`).run(row.id);
  // photo file is left for the orphan sweep (same policy as receipts)
  res.json({ ok: true });
});

/* photos */
app.get('/api/photos', (req, res) => {
  const rows = db.prepare(`SELECT * FROM photos ORDER BY created_at, id`).all();
  res.json(rows.map(r => ({ ...r, url: '/uploads/' + r.filename })));
});

app.post('/api/photos', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).send('no file');
  try { await normalizeHeic(req.file); } catch { /* fall through to the type check */ }
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

/* upload errors (multer throws before any route logic) — a plain message
   instead of Express's default HTML error page */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? 'that file is too big — the limit is 32MB per upload. Split the PDF (or re-scan at lower quality) and drop the parts separately'
      : 'upload failed: ' + err.message;
    return res.status(413).send(msg);
  }
  next(err);
});

/* ---------- static ---------- */
/* orphan sweep — uploads no expense, bill, or photo row points at. Declined
 * duplicates, failed scans, replaced bill scans, and deleted rows all leave
 * (or strand) a file here. A pending duplicate dialog references its file
 * only in client state, so only files older than 24h are removed. Runs at
 * boot and daily. */
function sweepOrphanUploads() {
  try {
    const keep = new Set([
      ...db.prepare(`SELECT receipt_file f FROM expenses WHERE receipt_file IS NOT NULL`).all(),
      ...db.prepare(`SELECT scan_file f FROM utility_bills WHERE scan_file IS NOT NULL`).all(),
      ...db.prepare(`SELECT filename f FROM photos`).all(),
      ...db.prepare(`SELECT photo f FROM paint_chips WHERE photo IS NOT NULL`).all(),
    ].map(r => r.f));
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(UPLOADS)) {
      if (keep.has(name)) continue;
      const full = path.join(UPLOADS, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) { fs.unlinkSync(full); removed++; }
      } catch {}
    }
    if (removed) console.log('orphan sweep: removed ' + removed + ' unreferenced upload(s)');
  } catch (e) {
    console.error('orphan sweep failed:', e.message);
  }
}
sweepOrphanUploads();
setInterval(sweepOrphanUploads, 24 * 60 * 60 * 1000).unref();

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
