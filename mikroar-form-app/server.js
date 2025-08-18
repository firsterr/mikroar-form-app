// server.js — MikroAR Form App (ESM)

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
// Misafir (genel) giriş — ENV yoksa bu değerler kullanılır
const GUEST_USER = process.env.GUEST_USER || 'firsterx';
const GUEST_PASS = process.env.GUEST_PASS || '2419_i';
// Tek yerde tanımlayalım (env yoksa verilen değerlere düşer)
const ADMIN_USER   = process.env.ADMIN_USER || 'adminfirster';
const ADMIN_PASS   = process.env.ADMIN_PASS || '10Yor!!de_';
// İstemci (host bazlı) koruma aynı bilgileri kullansın
const FRONT_USER   = process.env.FRONT_USER || ADMIN_USER;
const FRONT_PASS   = process.env.FRONT_PASS || ADMIN_PASS;

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

// Güvenlik (embed uyumlu)
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// ---- Basit basic-auth yardımcıları
function checkBasic(req, user, pass) {
  const u = basicAuth(req);
  return u && u.name === user && u.pass === pass;
}
function requireBasic(realm = 'MikroAR') {
  return (req, res, next) => {
    if (!checkBasic(req, FRONT_USER, FRONT_PASS)) {
      res.set('WWW-Authenticate', `Basic realm="${realm}"`);
      return res.status(401).send('Yetkisiz');
    }
    next();
  };
}
function adminOnly(req, res, next) {
  if (!checkBasic(req, ADMIN_USER, ADMIN_PASS)) {
    res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin API"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}

// ---- Host bazlı koruma (STATİK ve sayfalar için) — routes’tan ÖNCE
app.use((req, res, next) => {
  const host = (req.hostname || '').toLowerCase();
  const p = req.path;

  // 1) anket.mikroar.com -> tamamı şifreli (admin sayfası ve admin API’ler)
  if (host === 'anket.mikroar.com') {
    return requireBasic('MikroAR Anket (Admin)')(req, res, next);
  }

  // 2) form.mikroar.com -> sadece kök ve sonuçlar şifreli
  if (host === 'form.mikroar.com') {
    if (p === '/' || p === '/index.html' || p === '/results.html') {
      return requireBasic('MikroAR Form Seçici')(req, res, next);
    }
  }

  return next();
});

// -------------------------------------------------------
// KÖK: alan adına göre davranış
// - anket.mikroar.com  -> admin.html
// - form.mikroar.com   -> index.html (form seç)
// -------------------------------------------------------
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();

  if (host === 'anket.mikroar.com') {
    return res.redirect(302, '/admin.html');
  }
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
    if (!rows.length)            return res.status(404).json({ ok: false, error: 'Form bulunamadı' });
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
// --- Basic Auth (genel): Kök ve bazı sayfalar "admin YA DA misafir" girişi ister
const PROTECTED = new Set(['/', '/index.html', '/admin.html', '/results.html']);

app.use((req, res, next) => {
  if (PROTECTED.has(req.path)) {
    const cred = basicAuth(req);
    const ok =
      cred &&
      (
        (cred.name === ADMIN_USER && cred.pass === ADMIN_PASS) ||   // admin kabul
        (cred.name === GUEST_USER && cred.pass === GUEST_PASS)      // misafir kabul
      );

    if (!ok) {
      res.set('WWW-Authenticate', 'Basic realm="MikroAR"');
      return res.status(401).send('Unauthorized');
    }
  }
  next();
});
// ---- Statik dosyalar (public/)
app.use(express.static(path.join(__dirname, 'public')));

// =======================================================
// ===================   ADMIN API   =====================
// =======================================================
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

// Admin: form oluştur/güncelle
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

// Admin: yanıtlar
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

// Admin: sayaç
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
