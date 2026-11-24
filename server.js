'use strict';
const express = require('express'), path = require('path'), fs = require('fs'), crypto = require('crypto');
const Database = require('better-sqlite3'), bcrypt = require('bcryptjs'), jwt = require('jsonwebtoken');
const multer = require('multer'), rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UP = path.join(DATA, 'uploads');
fs.mkdirSync(UP, { recursive: true });

const db = new Database(path.join(DATA, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'masyarakat' CHECK(role IN ('masyarakat','admin')),
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  judul TEXT NOT NULL, kategori TEXT NOT NULL, lokasi TEXT NOT NULL, deskripsi TEXT NOT NULL, foto TEXT,
  status TEXT NOT NULL DEFAULT 'Menunggu', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS status_log(
  id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  status TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id);
`);

let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const f = path.join(DATA, 'secret.key');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
  SECRET = fs.readFileSync(f, 'utf8').trim();
}

const now = () => new Date().toISOString();
if (!db.prepare("SELECT 1 FROM users WHERE role='admin'").get()) {
  const email = (process.env.ADMIN_EMAIL || 'admin@laporfasum.id').toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run('Administrator', email, bcrypt.hashSync(pw, 10), 'admin', now());
  console.log(`\nAkun administrator dibuat.\n  Email   : ${email}\n  Password: ${pw}\nSimpan password ini.\n`);
}

const CAT = ['Jalan rusak atau berlubang', 'Penerangan jalan umum', 'Drainase dan saluran air', 'Trotoar dan jembatan',
  'Taman dan ruang terbuka', 'Halte dan fasilitas transportasi', 'Fasilitas umum lainnya'];
const ST = ['Menunggu', 'Diproses', 'Selesai', 'Ditolak'];
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
const fail = (res, code, error) => res.status(code).json({ error });
const sign = u => jwt.sign({ id: u.id }, SECRET, { expiresIn: '7d' });
const pub = u => ({ id: u.id, name: u.name, email: u.email, role: u.role });

const auth = (req, res, next) => {
  try {
    const p = jwt.verify((req.headers.authorization || '').replace(/^Bearer /, ''), SECRET);
    const u = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(p.id);
    if (!u) throw new Error('no user');
    req.user = u; next();
  } catch (e) { fail(res, 401, 'Sesi berakhir. Silakan masuk kembali.'); }
};
const admin = (req, res, next) => req.user.role === 'admin' ? next() : fail(res, 403, 'Akses ditolak.');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((q, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});
app.use(express.json({ limit: '100kb' }));
const lim = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.' } });

app.post('/api/register', lim, (req, res) => {
  const name = clean(req.body.name, 80), email = clean(req.body.email, 120).toLowerCase();
  const pw = String(req.body.password ?? '');
  if (!name) return fail(res, 400, 'Nama wajib diisi.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Format email tidak valid.');
  if (pw.length < 8 || pw.length > 72) return fail(res, 400, 'Kata sandi harus 8 sampai 72 karakter.');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 409, 'Email ini sudah terdaftar. Silakan masuk.');
  const r = db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(name, email, bcrypt.hashSync(pw, 10), 'masyarakat', now());
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({ token: sign(u), user: pub(u) });
});

app.post('/api/login', lim, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(clean(req.body.email, 120).toLowerCase());
  if (!u || !bcrypt.compareSync(String(req.body.password ?? ''), u.password_hash))
    return fail(res, 401, 'Email atau kata sandi tidak sesuai.');
  res.json({ token: sign(u), user: pub(u) });
});

app.get('/api/me', auth, (req, res) => res.json({ user: req.user }));

const photos = f => { if (!f) return []; if (f[0] !== '[') return [f]; try { return JSON.parse(f); } catch (e) { return []; } };
const SEL = 'SELECT r.*, u.name AS pelapor FROM reports r JOIN users u ON u.id = r.user_id';
function owned(req, res) {
  const id = Number(req.params.id);
  const r = Number.isInteger(id) ? db.prepare(SEL + ' WHERE r.id=?').get(id) : null;
  if (!r || (req.user.role !== 'admin' && r.user_id !== req.user.id)) { fail(res, 404, 'Laporan tidak ditemukan.'); return null; }
  return r;
}

app.get('/api/reports', auth, (req, res) => {
  const rows = req.user.role === 'admin'
    ? db.prepare(SEL + ' ORDER BY r.id DESC').all()
    : db.prepare(SEL + ' WHERE r.user_id=? ORDER BY r.id DESC').all(req.user.id);
  res.json({ reports: rows });
});

app.get('/api/stats', auth, admin, (req, res) => {
  const by = {}; ST.forEach(s => by[s] = 0);
  db.prepare('SELECT status, COUNT(*) n FROM reports GROUP BY status').all().forEach(r => by[r.status] = r.n);
  res.json({ stats: { total: Object.values(by).reduce((a, b) => a + b, 0), by,
    users: db.prepare("SELECT COUNT(*) n FROM users WHERE role='masyarakat'").get().n } });
});

app.get('/api/reports/:id', auth, (req, res) => {
  const r = owned(req, res); if (!r) return;
  r.log = db.prepare('SELECT status, created_at FROM status_log WHERE report_id=? ORDER BY id').all(r.id);
  r.fotos = photos(r.foto);
  res.json({ report: r });
});

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({ destination: UP, filename: (q, f, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[f.mimetype]) }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
  fileFilter: (q, f, cb) => EXT[f.mimetype] ? cb(null, true) : cb(new Error('Foto harus berformat JPG, PNG, atau WebP.'))
});
const up = (req, res, next) => upload.array('foto', 5)(req, res, e =>
  e ? fail(res, 400, e.code === 'LIMIT_FILE_SIZE' ? 'Ukuran tiap foto maksimal 5 MB.'
    : ['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE'].includes(e.code) ? 'Maksimal 5 foto per laporan.'
    : e.message) : next());

app.post('/api/reports', auth, up, (req, res) => {
  const b = req.body || {};
  const v = { judul: clean(b.judul, 100), kategori: clean(b.kategori, 60), lokasi: clean(b.lokasi, 160), deskripsi: clean(b.deskripsi, 1000) };
  const files = req.files || [];
  const drop = () => files.forEach(f => fs.unlink(f.path, () => {}));
  if (!v.judul || !v.lokasi || !v.deskripsi) { drop(); return fail(res, 400, 'Judul, lokasi, dan deskripsi wajib diisi.'); }
  if (!CAT.includes(v.kategori)) { drop(); return fail(res, 400, 'Pilih kategori kerusakan.'); }
  const t = now();
  const id = db.transaction(() => {
    const r = db.prepare('INSERT INTO reports(user_id,judul,kategori,lokasi,deskripsi,foto,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(req.user.id, v.judul, v.kategori, v.lokasi, v.deskripsi, files.length ? JSON.stringify(files.map(f => f.filename)) : null, 'Menunggu', t, t);
    db.prepare('INSERT INTO status_log(report_id,status,created_at) VALUES(?,?,?)').run(r.lastInsertRowid, 'Menunggu', t);
    return r.lastInsertRowid;
  })();
  res.status(201).json({ id });
});

app.patch('/api/reports/:id/status', auth, admin, (req, res) => {
  const r = owned(req, res); if (!r) return;
  const s = String(req.body.status ?? '');
  if (!ST.includes(s)) return fail(res, 400, 'Status tidak valid.');
  if (s !== r.status) db.transaction(() => {
    const t = now();
    db.prepare('UPDATE reports SET status=?, updated_at=? WHERE id=?').run(s, t, r.id);
    db.prepare('INSERT INTO status_log(report_id,status,created_at) VALUES(?,?,?)').run(r.id, s, t);
  })();
  res.json({ ok: true });
});

app.delete('/api/reports/:id', auth, admin, (req, res) => {
  const r = owned(req, res); if (!r) return;
  db.prepare('DELETE FROM reports WHERE id=?').run(r.id);
  photos(r.foto).forEach(n => fs.unlink(path.join(UP, path.basename(n)), () => {}));
  res.json({ ok: true });
});

app.use('/uploads', express.static(UP, { index: false, dotfiles: 'deny' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (q, res) => fail(res, 404, 'Endpoint tidak ditemukan.'));
app.use((e, q, res, n) => {
  if (e.type === 'entity.parse.failed') return fail(res, 400, 'Data tidak valid.');
  if (String(e.code).startsWith('SQLITE_CONSTRAINT')) return fail(res, 409, 'Data sudah ada.');
  console.error(e); fail(res, 500, 'Terjadi kesalahan pada server.');
});

app.listen(PORT, '0.0.0.0', () => console.log(`Lapor Fasum berjalan di http://localhost:${PORT}`));
