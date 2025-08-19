// server.js — MikroAR Form App (ESM) + Kısa Link /f/:code

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import basicAuth from 'basic-auth';
import pkg from 'pg';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config();
const { Pool } = pkg;

// ---- Env
const PORT         = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN  = process.env.CORS_ORIGIN || '*';

// Admin & Misafir (ENV varsa onları kullanır)
const ADMIN_USER = (process.env.ADMIN_USER || 'adminfirster').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || '10Yor!!de_').trim();

const GUEST_USER = (process.env.GUEST_USER || 'firsterx').trim();
const GUEST_PASS = (process.env.GUEST_PASS || '2419_i').trim();

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

// -------------------------------------------------------
// Basic Auth yardımcıları
// -------------------------------------------------------
function isAdmin(req) {
  const u = basicAuth(req);
  return u && u.name === ADMIN_USER && u.pass === ADMIN_PASS;
}
function isGuest(req) {
  const u = basicAuth(req);
  return u && u.name === GUEST_USER && u.pass === GUEST_PASS;
}

// Kök ve bazı sayfalar: admin VEYA misafir
const PROTECTED_PAGES = new Set(['/', '/index.html', '/admin.html', '/results.html']);
app.use((req, res, next) => {
  if (PROTECTED_PAGES.has(req.path)) {
    if (isAdmin(req) || isGuest(req)) return next();
    res.set('WWW-Authenticate', 'Basic realm="MikroAR-Portal"');
    return res.status(401).send('Unauthorized');
  }
  next();
});

// Admin API’leri: sadece admin
function adminOnly(req, res, next) {
  if (isAdmin(req)) return next();
  res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin API"');
  return res.status(401).send('Yetkisiz');
}

// -------------------------------------------------------
// KÖK: hosta göre
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

// =======================================================
// ==============  KISA LİNK ÖZELLİĞİ  ===================
// =======================================================

// Basit kod üretici (9 karakter, URL-safe)
function genCode(len = 9) {
  return crypto.randomBytes(12).toString('base64url').slice(0, len);
}

// Kısa kodu çözen API (form.html burayı çağırır), tıklamayı da loglar
app.get('/api/resolve-short/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const r = await pool.query('SELECT slug FROM short_links WHERE code=$1 AND (active IS DISTINCT FROM false)', [code]);
    if (!r.rowCount) return res.status(404).json({ ok:false, error:'kod bulunamadı' });

    // tıklama logu (opsiyonel)
    const xff = req.headers['x-forwarded-for'];
    const ip  = Array.isArray(xff) ? xff[0] : (typeof xff === 'string' ? xff.split(',')[0].trim() : req.ip || null);
    await pool.query('INSERT INTO short_clicks (code, ip, user_agent) VALUES ($1,$2,$3)', [code, ip, req.get('user-agent') || null]);

    res.json({ ok:true, slug:r.rows[0].slug });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
});

// Kısa yolın kendisi: /f/:code → form.html’i servis et (URL değişmeden)
app.get('/f/:code', async (req, res) => {
  // sayfa içeride /api/resolve-short/:code çağırarak slugu bulacak
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// Admin: forma kısa kod üret / sorgula
app.get('/admin/api/forms/:slug/short-link', adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    // mevcut aktif kodu getir ya da oluştur
    let r = await pool.query('SELECT code FROM short_links WHERE slug=$1 AND active IS TRUE LIMIT 1', [slug]);
    if (!r.rowCount) {
      // yeni kod üret, çakışma olmasın
      let code;
      for (;;) {
        code = genCode(9);
        const c = await pool.query('SELECT 1 FROM short_links WHERE code=$1', [code]);
        if (!c.rowCount) break;
      }
      await pool.query('INSERT INTO short_links (code, slug, active) VALUES ($1,$2,true)', [code, slug]);
      r = { rows:[{ code }] };
    }
    const code = r.rows[0].code;
    const url = `${req.protocol}://${req.get('host')}/f/${code}`;
    res.json({ ok:true, code, url });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
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

    // kısa kod yoksa otomatik üret
    let r = await pool.query('SELECT 1 FROM short_links WHERE slug=$1 AND active IS TRUE', [slug]);
    if (!r.rowCount) {
      let code;
      for (;;) {
        code = genCode(9);
        const c = await pool.query('SELECT 1 FROM short_links WHERE code=$1', [code]);
        if (!c.rowCount) break;
      }
      await pool.query('INSERT INTO short_links (code, slug, active) VALUES ($1,$2,true)', [code, slug]);
    }

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
