// server.js  —  SAFE / Minimal ESM
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import basicAuth from 'basic-auth';
import crypto from 'crypto';
import pkg from 'pg';

const { Pool } = pkg;

// ===== ENV =====
const {
  DATABASE_URL,
  CORS_ORIGIN = '*',
  ADMIN_USER,
  ADMIN_PASS,
  FRAME_ANCESTORS = '',
  PORT = 10000,
} = process.env;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

// ===== DB =====
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ===== APP =====
const app = express();
app.set('trust proxy', true);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---- Security (iframe için env ile izin) ----
const faList = FRAME_ANCESTORS.split(',').map(s => s.trim()).filter(Boolean);
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'frame-ancestors': faList.length ? faList : ["'self'"],
    },
  },
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// ---- Parsers + CORS + Log ----
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// ---- Basic-Auth helper (admin uçları için) ----
function adminOnly(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).send('Auth not configured');
  }
  const u = basicAuth(req);
  if (!u || u.name !== ADMIN_USER || u.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}

// ===== Health =====
app.get('/health', async (_req, res) => {
  try { await pool.query('select 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// ===== Public APIs =====
// 1) form şeması
app.get('/api/forms/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const r = await pool.query(
      'select slug, title, active, schema from forms where slug=$1',
      [slug]
    );
    if (!r.rowCount) return res.status(404).json({ ok:false, error:'Form bulunamadı' });
    if (r.rows[0].active === false) return res.status(403).json({ ok:false, error:'Form pasif' });
    res.json({ ok:true, form: r.rows[0] });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// 2) form submit
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || '';
  const ua = req.headers['user-agent'] || '';
  try {
    const f = await pool.query('select 1 from forms where slug=$1 and active is true', [slug]);
    if (!f.rowCount) return res.status(404).json({ ok:false, error:'Form bulunamadı' });

    await pool.query(
      `insert into responses (form_slug, payload, user_agent, ip)
       values ($1,$2,$3,$4)`,
      [slug, req.body || {}, ua, ip]
    );
    res.json({ ok:true });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// ===== Short-Link (slug gizli, JS ile çözülecek) =====
// 3) kısa kod -> slug (JSON)
app.get('/api/resolve-short/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const r = await pool.query('select slug from short_links where code=$1 and active is true limit 1', [code]);
    if (!r.rowCount) return res.status(404).json({ ok:false, error:'Kısa kod bulunamadı' });
    res.json({ ok:true, slug: r.rows[0].slug });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});

// 4) kısa kod sayfası (redirect YOK, form.html döner -> JS slug’ı çözer)
app.get('/f/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// ===== Admin: kısa kod üret/bağla =====
// POST /admin/api/forms/:slug/short-link   body: { code?: 'kendi-kodum' }
app.post('/admin/api/forms/:slug/short-link', adminOnly, async (req, res) => {
  const { slug } = req.params;
  let   { code = '' } = req.body || {};
  try {
    const f = await pool.query('select 1 from forms where slug=$1 and active is true', [slug]);
    if (!f.rowCount) return res.status(404).json({ ok:false, error:'slug bulunamadı' });

    if (!code) code = crypto.randomBytes(6).toString('base64url'); // 8-10 char
    code = String(code).trim();
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
      return res.status(400).json({ ok:false, error:'Kod yalnızca A-Z a-z 0-9 _ -; 4-64 uzunlukta olmalı' });
    }
    await pool.query(
      `insert into short_links (code, slug, active)
       values ($1,$2,true)
       on conflict (code) do update set slug = excluded.slug, active = true`,
      [code, slug]
    );
    const origin = `${(req.headers['x-forwarded-proto'] || req.protocol)}://${req.get('host')}`;
    res.json({ ok:true, code, url: `${origin}/f/${code}` });
  } catch (e) { res.status(500).json({ ok:false, error:e.message }); }
});
// Admin ekranı ve scripti Basic-Auth ile korunsun
app.get('/admin.html', adminOnly, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/admin.js', adminOnly, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.js'));
});
// ===== Statik dosyalar =====
app.use(express.static(path.join(__dirname, 'public')));

// Kök -> index.html (form seçici varsa)
app.get('/', (req, res) => {
  // anket.mikroar.com köke gelirse admin'e git
  if (req.hostname && req.hostname.startsWith('anket.')) {
    return res.redirect(302, '/admin.html');
  }
  // diğer tüm hostlar (form.mikroar.com dahil) index.html (form seç)
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404
app.use((_req, res) => res.status(404).send('Not found'));

app.listen(Number(PORT), () => console.log(`OK :${PORT}`));
