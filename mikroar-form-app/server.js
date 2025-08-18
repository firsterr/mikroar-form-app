// server.js — MikroAR Form App (ESM, basic-auth sabit ve sağlam)

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
const PORT         = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN  = process.env.CORS_ORIGIN || '*';

// KULLANICI/ŞİFRE: Env varsa onu kullan, yoksa aşağıdaki **senin çiftine** düş.
const ADMIN_USER = (process.env.ADMIN_USER || 'firsterx').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || '2419_i').trim();

if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil!');
  process.exit(1);
}

// ---- __dirname (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---- DB
const pool = new Pool({ connectionString: DATABASE_URL });

// ---- App
const app = express();
app.set('trust proxy', true);

// Güvenlik (embed uyumlu; CSP/COEP kapalı)
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// -------------------------------------------------------
// Basic-auth yardımcıları
// -------------------------------------------------------
function needAuth(req) {
  const host = (req.hostname || '').toLowerCase();
  const p = req.path.toLowerCase();

  // 1) anket.mikroar.com -> her şey şifreli
  if (host === 'anket.mikroar.com') return true;

  // 2) form.mikroar.com -> sadece kök/index/results şifreli
  if (host === 'form.mikroar.com') {
    if (p === '/' || p === '/index.html' || p === '/results.html') return true;
  }

  // 3) Admin sayfası ve admin API'leri her yerde şifreli
  if (p === '/admin.html' || p.startsWith('/admin/')) return true;

  return false; // /form.html?slug=... halka açık
}

function checkBasic(req) {
  const u = basicAuth(req);
  // trim’lenmiş beklenen değerlerle birebir karşılaştır
  return u && u.name === ADMIN_USER && u.pass === ADMIN_PASS;
}

function protectPages(req, res, next) {
  if (!needAuth(req)) return next();
  if (checkBasic(req)) return next();
  res.set('WWW-Authenticate', 'Basic realm="MikroAR"');
  return res.status(401).send('Yetkisiz');
}

// Şifre korumasını TÜM route'lardan önce uygula
app.use(protectPages);

// -------------------------------------------------------
// Root davranışı (hosta göre)
// -------------------------------------------------------
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (host === 'anket.mikroar.com') {
    return res.redirect(302, '/admin.html');
  }
  // form.mikroar.com ve digerleri -> form seçme sayfası
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// /form.html (ve /form): slug yoksa en güncel aktif forma yönlendir
app.get(['/form', '/form.html'], async (req, res, next) => {
  const slug = (req.query.slug || '').trim();
  if (slug) return next();

  try {
    const r = await pool.query(
      `SELECT slug
         FROM forms
        WHERE (active IS DISTINCT FROM false)
        ORDER BY created_at DESC NULLS LAST, slug ASC
        LIMIT 1`
    );
    if (r.rowCount) {
      return res.redirect(302, `/form.html?slug=${encodeURIComponent(r.rows[0].slug)}`);
    }
    return res.status(404).send('Aktif form yok.');
  } catch {
    return res.status(500).send('Sunucu hatası');
  }
});

// -------------------------------------------------------
// CORS + body parsers + log
// -------------------------------------------------------
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// =======================================================
// ================   PUBLIC API’LER   ===================
// =======================================================
async function listActiveForms(_req, res) {
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
}
app.get('/api/forms-list', listActiveForms);
app.get('/api/forms',      listActiveForms); // alias

// Tek form şeması
app.get('/api/forms/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, schema FROM forms WHERE slug=$1',
      [slug]
    );
    if (!rows.length)             return res.status(404).json({ ok: false, error: 'Form bulunamadı' });
    if (rows[0].active === false) return res.status(403).json({ ok: false, error: 'Form pasif' });
    res.json({ ok: true, form: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Yanıt kaydet
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload  = req.body || {};
  try {
    const xff = req.headers['x-forwarded-for'];
    const ip  = Array.isArray(xff)
      ? xff[0]
      : (typeof xff === 'string' ? xff.split(',')[0].trim() : req.ip || null);

    // Form aktif mi?
    const chk = await pool.query(
      'SELECT 1 FROM forms WHERE slug=$1 AND (active IS DISTINCT FROM false)',
      [slug]
    );
    if (chk.rowCount === 0) {
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

// ---- Statik dosyalar (public/)
app.use(express.static(path.join(__dirname, 'public')));

// =======================================================
// ===================   ADMIN API   =====================
// =======================================================
app.get('/admin/api/forms', protectPages, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, created_at FROM forms ORDER BY created_at DESC'
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/admin/api/forms', protectPages, async (req, res) => {
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

app.get('/admin/forms/:slug/responses.json', protectPages, async (req, res) => {
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

app.get('/admin/forms/:slug/stats', protectPages, async (req, res) => {
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

// Sağlık
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Start
app.listen(PORT, () => {
  console.log(`MikroAR Form API ${PORT} portunda çalışıyor`);
});
