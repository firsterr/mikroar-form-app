// server.js  —  MikroAR Form App (ESM)

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import basicAuth from 'basic-auth';
import pkg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const { Pool } = pkg;

// ---- Env
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';
const FRAME_ANCESTORS = process.env.FRAME_ANCESTORS || `'self'`;
const DEFAULT_SLUG = process.env.DEFAULT_SLUG || ''; // kökten slug vermek istersen

if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil!');
  process.exit(1);
}

// ---- __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- DB
const pool = new Pool({ connectionString: DATABASE_URL });

// ---- App
const app = express();
app.set('trust proxy', true);

// .env: FRAME_ANCESTORS ör: "https://*.mikroar.com https://sites.google.com"
const RAW_FRAME = (process.env.FRAME_ANCESTORS || '')
  .replace(/[\r\n]+/g, ' ')             // satır sonlarını at
  .replace(/,+/g, ' ')                  // virgülleri boşluk yap (helmet boşlukla ayırmayı sever)
  .split(/\s+/)                         // boşluklardan ayır
  .map(s => s.trim())
  .filter(Boolean);

// Helmet
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      // kritik satır:
      "frame-ancestors": ["'self'", ...RAW_FRAME],
    },
  },
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));
// Kök: /  -> public/index.html
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Aktif formları listeleyen public API
app.get('/api/forms', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title
         FROM forms
        WHERE (active IS DISTINCT FROM false)
        ORDER BY created_at DESC NULLS LAST, slug ASC`
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
// >>> KOPYALA-YAPIŞTIR — static'in ÜSTÜNE ekle
app.get('/', (req, res) => {
  const h = (req.hostname || '').toLowerCase();
  const q = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  if (h === 'form.mikroar.com')  return res.redirect(302, '/form.html' + q);
  if (h === 'anket.mikroar.com') return res.redirect(302, '/admin.html');
  return res.redirect(302, '/form.html' + q); // default
});

app.get(['/form', '/form.html'], async (req, res, next) => {
  const slug = (req.query.slug || '').trim();
  if (slug) return next(); // slug varsa form.html normal servis edilsin

  try {
    const r = await pool.query(
      "select slug from forms where (active is distinct from false) order by created_at desc limit 1"
    );
    if (r.rowCount) {
      return res.redirect(302, `/form.html?slug=${encodeURIComponent(r.rows[0].slug)}`);
    }
    return res.status(404).send('Aktif form yok.');
  } catch (e) {
    return res.status(500).send('Sunucu hatası');
  }
});
// <<< SON
// CORS + body parsers + logs + static
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// --- API: Aktif formlar listesi (index.html bunu çağırıyor)
app.get('/api/forms-list', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title
         FROM forms
        WHERE active IS DISTINCT FROM false
        ORDER BY created_at DESC`
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: Tek form şeması (form.html bunu çağırıyor)
app.get('/api/forms/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, schema FROM forms WHERE slug=$1',
      [slug]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Form bulunamadı' });
    if (rows[0].active === false) return res.status(403).json({ ok: false, error: 'Form pasif' });
    res.json({ ok: true, form: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- API: Yanıt kaydet (form.html POST eder)
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload = req.body || {};
  try {
    const xff = req.headers['x-forwarded-for'];
    const ip = Array.isArray(xff)
      ? xff[0]
      : (typeof xff === 'string' ? xff.split(',')[0].trim() : req.ip || null);

    await pool.query(
      'INSERT INTO responses (form_slug, payload, user_agent, ip) VALUES ($1, $2, $3, $4)',
      [slug, payload, req.get('user-agent') || null, ip]
    );
    res.json({ ok: true });
  } catch (e) {
    // unique ihlali vb. durumları burada istersen yakalayabilirsin
    res.status(500).json({ ok: false, error: e.message });
  }
});

// >>> KÖK YÖNLENDİRME — MUTLAKA express.static'ten ÖNCE <<<
app.get('/', (req, res) => {
  const host = (req.headers.host || '').toLowerCase();

  // Admin alan adı: anket.mikroar.com → admin.html
  if (host.startsWith('anket.')) {
    return res.redirect(302, '/admin.html');
  }

  // Form alan adı (ve diğerleri) → form.html?slug=DEFAULT
  return res.redirect(
    302,
    `/form.html?slug=${encodeURIComponent(DEFAULT_FORM_SLUG)}`
  );
});

app.use(express.static(path.join(__dirname, 'public')));

// ---- Yardımcılar
function adminOnly(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}


// ---- Sağlık
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- API: form şeması
app.get('/api/forms', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title
         FROM forms
        WHERE active IS DISTINCT FROM false
        ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

// ---- API: cevap kaydet (IP bazlı tek oy için DB tarafında UNIQUE index önerilir)
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload = req.body || {};

  const xff = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(xff)
    ? xff[0]
    : typeof xff === 'string'
    ? xff.split(',')[0].trim()
    : null;
  const ip = forwardedIp || req.ip || req.connection?.remoteAddress || null;

  try {
    const form = await pool.query(
      'SELECT 1 FROM forms WHERE slug=$1 AND (active IS DISTINCT FROM false)',
      [slug]
    );
    if (form.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Form bulunamadı veya pasif' });
    }

    await pool.query(
      'INSERT INTO responses (form_slug, payload, user_agent, ip) VALUES ($1, $2, $3, $4)',
      [slug, payload, req.get('user-agent') || null, ip]
    );

    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Bu IP’den zaten yanıt gönderilmiş.' });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Admin: formlar listesi
app.get('/admin/api/forms', adminOnly, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, created_at FROM forms ORDER BY created_at DESC'
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});
// ---- Admin: form oluştur/güncelle
// Body kabul:
//  A) { slug, title, active, schema:{questions:[...] } }
//  B) { slug, title, active, questions:[...] }
app.post('/admin/api/forms', adminOnly, async (req, res) => {
  try {
    let { slug, title, active = true, schema, questions } = req.body || {};
    if (!slug || !title) {
      return res.status(400).json({ ok: false, error: 'slug ve title gerekli' });
    }
    if (!schema && Array.isArray(questions)) schema = { questions };
    if (!schema || !Array.isArray(schema.questions)) schema = { questions: [] };

    await pool.query(
      `INSERT INTO forms (slug, title, active, schema)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
       SET title=EXCLUDED.title, active=EXCLUDED.active, schema=EXCLUDED.schema`,
      [slug, title, active, schema]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Admin: yanıtlar & sayaç
app.get('/admin/forms/:slug/responses.json', adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, payload, user_agent, ip, created_at FROM responses WHERE form_slug=$1 ORDER BY created_at DESC',
      [slug]
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/admin/forms/:slug/stats', adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM responses WHERE form_slug=$1',
      [slug]
    );
    res.json({ ok: true, count: rows[0].count });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Sunucu
app.listen(PORT, () => {
  console.log(`MikroAR Form API ${PORT} portunda çalışıyor`);
});
