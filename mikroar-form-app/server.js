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

// ───────────────────────────────────────────────────────────
// IP seçimi (CF/Proxy zincirinden güvenle ayıkla)
// ───────────────────────────────────────────────────────────
function pickClientIp(req) {
  const chain = [
    req.headers['cf-connecting-ip'],
    req.headers['x-client-ip'],
    req.headers['x-real-ip'],
    req.headers['x-forwarded-for'], // "a, b, c" zinciri olabilir
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);

  // IPv4 veya IPv6 (IPv6-mapped dahil)
  const ipRE =
    /(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}|(?:(?:[A-F0-9]{1,4}:){1,7}[A-F0-9]{1,4})/i;

  for (const v of chain) {
    const first = String(v).split(',')[0].trim().replace(/:\d+$/, ''); // port varsa at
    const m = first.match(ipRE);
    if (m) return m[0];
  }
  return null; // geçerli bir şey bulunamadı
}

// ───────────────────────────────────────────────────────────
// Env
// ───────────────────────────────────────────────────────────
const PORT         = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN  = process.env.CORS_ORIGIN || '*';

// Admin & Misafir hesapları
const ADMIN_USER = process.env.ADMIN_USER || 'adminfirster';
const ADMIN_PASS = process.env.ADMIN_PASS || '10Yor!!de_';

const GUEST_USER = process.env.GUEST_USER || 'firsterx';
const GUEST_PASS = process.env.GUEST_PASS || '2419_i';

if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil!');
  process.exit(1);
}

// ───────────────────────────────────────────────────────────
// __dirname (ESM)
// ───────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ───────────────────────────────────────────────────────────
// DB
// ───────────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL });

// ───────────────────────────────────────────────────────────
// App
// ───────────────────────────────────────────────────────────
const app = express();
app.set('trust proxy', true);

// Güvenlik (embed uyumlu)
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// ───────────────────────────────────────────────────────────
// Basic Auth yardımcıları
// ───────────────────────────────────────────────────────────
function isAdmin(req) {
  const cred = basicAuth(req);
  return cred && cred.name === ADMIN_USER && cred.pass === ADMIN_PASS;
}
function isGuest(req) {
  const cred = basicAuth(req);
  return cred && cred.name === GUEST_USER && cred.pass === GUEST_PASS;
}

// Sayfa koruması (admin VEYA misafir)
const PROTECTED_PAGES = new Set(['/', '/index.html', '/admin.html', '/results.html']);
app.use((req, res, next) => {
  if (PROTECTED_PAGES.has(req.path)) {
    if (isAdmin(req) || isGuest(req)) return next();
    res.set('WWW-Authenticate', 'Basic realm="MikroAR"');
    return res.status(401).send('Unauthorized');
  }
  next();
});

// Sadece admin için koruma (API’ler)
function adminOnly(req, res, next) {
  if (isAdmin(req)) return next();
  res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin API"');
  return res.status(401).send('Yetkisiz');
}

// ───────────────────────────────────────────────────────────
// Alan adına göre kök yönlendirme
// anket.mikroar.com  -> /admin.html
// form.mikroar.com   -> /index.html
// ───────────────────────────────────────────────────────────
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

// ───────────────────────────────────────────────────────────
// CORS + Parsers + Log
// ───────────────────────────────────────────────────────────
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// ───────────────────────────────────────────────────────────
// PUBLIC API’LER
// ───────────────────────────────────────────────────────────
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

// Form detay (form.html bu rotayı kullanır)
app.get('/api/forms/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, active, schema
         FROM forms
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: 'Form bulunamadı' });
    }
    res.json({ ok: true, form: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Sonuçlar (results.html) — Basic Auth ile korunuyor
app.get('/api/forms/:slug/responses', adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `
      SELECT 
        created_at,
        ip,
        COALESCE(answers, payload) AS answers
      FROM responses
      WHERE form_slug = $1
      ORDER BY created_at DESC
      `,
      [slug]
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cevap Kaydı — TEK (doğru) submit rotası
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const answers = (req.body && (req.body.answers ?? req.body)) || {};

  try {
    // Formu ve şemasını al
    const { rows } = await pool.query(
      'SELECT schema, active FROM forms WHERE slug=$1',
      [slug]
    );
    if (!rows.length || rows[0].active === false) {
      return res.status(404).json({ ok: false, error: 'Form bulunamadı veya pasif' });
    }

    // Zorunlu kontrolü
    const qs = rows[0].schema?.questions || [];
    const missing = [];
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i] || {};
      if (!q.required) continue;

      // Hem q_0/q_1... hem de label anahtarlı gönderimleri kabul et
      const val = answers[`q_${i}`] ?? answers[q.label];
      const filled = (q.type === 'checkbox')
        ? Array.isArray(val) && val.length > 0
        : (val != null && String(val).trim() !== '');
      if (!filled) missing.push(q.label || `Soru ${i + 1}`);
    }
    if (missing.length) {
      return res.status(400).json({ ok: false, error: 'Eksik zorunlu alanlar', missing });
    }

    // IP'yi güvenli şekilde al (inet tipine uygun)
    const ip = pickClientIp(req) || req.ip || null;

    // Kayıt (unique (form_slug, ip) varsa duplicate 409 döner)
    await pool.query(
      'INSERT INTO responses(form_slug, answers, ip) VALUES ($1, $2, $3)',
      [slug, answers, ip]
    );

    res.json({ ok: true });
  } catch (e) {
    if (e && e.code === '23505') {
      // unique ihlali (aynı IP aynı formu tekrar denedi)
      return res.status(409).json({ ok: false, error: 'already_submitted' });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Statik dosyalar
app.use(express.static(path.join(__dirname, 'public')));

// ───────────────────────────────────────────────────────────
// ADMIN API’LER
// ───────────────────────────────────────────────────────────
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

// Form oluştur/güncelle
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

// Admin: yanıtlar (eski/veri uyumluluğu)
app.get('/admin/forms/:slug/responses.json', adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `
      SELECT id,
             COALESCE(answers, payload) AS answers,
             user_agent,
             ip,
             created_at
        FROM responses
       WHERE form_slug=$1
       ORDER BY created_at DESC
      `,
      [slug]
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Sayaç
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
