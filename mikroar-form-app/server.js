// server.js — MikroAR Form App (short-link destekli, slug gizleme yok)
// Node 22.x

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import basicAuth from 'basic-auth';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import crypto from 'crypto';
import pkg from 'pg';

const { Pool } = pkg;

// ----- ENV -----
const {
  DATABASE_URL,
  CORS_ORIGIN = '*',
  ADMIN_USER,
  ADMIN_PASS,
  FRAME_ANCESTORS = '',
  NODE_ENV = 'production',
} = process.env;

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

// ----- PG -----
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ----- App -----
const app = express();
app.set('trust proxy', true);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----- Security: Helmet + CSP (iframe izinleri) -----
const faList = FRAME_ANCESTORS.split(',').map(s => s.trim()).filter(Boolean);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // formu başka sitelerde gömmek istiyorsanız env ile verin (ör: https://sites.google.com, https://*.mikroar.com)
        "frame-ancestors": faList.length ? faList : ["'self'"],
      },
    },
    frameguard: false,                 // X-Frame-Options kapalı
    crossOriginEmbedderPolicy: false, // bazı tarayıcı kısıtlarını gevşet
  })
);

// ----- Parsers + Log + CORS -----
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// ----- Basic-Auth helper -----
function adminOnly(req, res, next) {
  if (!ADMIN_USER || !ADMIN_PASS) return res.status(500).send('Auth not configured');
  const cred = basicAuth(req);
  if (!cred || cred.name !== ADMIN_USER || cred.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}

// ======== Health ========
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======== FORMS API (public) ========

// Form şeması getir
app.get('/api/forms/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, schema FROM forms WHERE slug=$1',
      [slug]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Form bulunamadı' });
    if (rows[0].active === false) return res.status(403).json({ ok: false, error: 'Form pasif' });
    return res.json({ ok: true, form: rows[0] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Form yanıtı kaydet
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() || req.ip || '';
  const ua = req.headers['user-agent'] || '';
  try {
    // form var mı?
    const f = await pool.query('SELECT 1 FROM forms WHERE slug=$1 AND active IS TRUE', [slug]);
    if (!f.rowCount) return res.status(404).json({ ok: false, error: 'Form bulunamadı' });

    await pool.query(
      `INSERT INTO responses (form_slug, payload, user_agent, ip)
       VALUES ($1, $2, $3, $4)`,
      [slug, req.body || {}, ua, ip]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======== SHORT LINK ========
// Kısa kodu slug'a çözen (JSON dönen) public endpoint.
// Not: bilinçli olarak 302 vermiyoruz; form sayfası /f/:code altında kalacak, JS buradan slug'ı çözüp formu çizecek.
app.get('/api/resolve-short/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const r = await pool.query(
      'SELECT slug FROM short_links WHERE code=$1 AND active IS TRUE LIMIT 1',
      [code]
    );
    if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Kısa kod bulunamadı' });
    return res.json({ ok: true, slug: r.rows[0].slug });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// Kısa link public sayfası: URL aynı kalır (slug görünmez). form.html'i döner.
app.get('/f/:code', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

// ======== ADMIN API (short linki el ile üretip yönetmek için) ========

// Kısa link üret (ya da verilen kodu slug'a bağla). Kod parametresi zorunlu değildir; verilmemişse random üretilir.
// Örnek: POST /admin/api/forms/formayvalik/short-link  body: { "code": "kadin-anketi-1" }
app.post('/admin/api/forms/:slug/short-link', adminOnly, async (req, res) => {
  const { slug } = req.params;
  let { code = '' } = req.body || {};
  try {
    const f = await pool.query('SELECT 1 FROM forms WHERE slug=$1 AND active IS TRUE', [slug]);
    if (!f.rowCount) return res.status(404).json({ ok: false, error: 'slug bulunamadı' });

    // kod verilmezse üret
    if (!code) code = crypto.randomBytes(6).toString('base64url'); // 8-10 karakter
    // sadeleştir & doğrula
    code = String(code).trim();
    if (!/^[A-Za-z0-9_-]{4,64}$/.test(code)) {
      return res.status(400).json({ ok: false, error: 'Kod yalnızca A-Z a-z 0-9 _ - ve 4–64 uzunlukta olmalı.' });
    }

    await pool.query(
      `INSERT INTO short_links (code, slug, active)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (code) DO UPDATE SET slug=EXCLUDED.slug, active=TRUE`,
      [code, slug]
    );

    const origin = `${(req.headers['x-forwarded-proto'] || req.protocol)}://${req.get('host')}`;
    res.json({ ok: true, code, url: `${origin}/f/${code}` });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// İsterseniz bir kodu pasifleştirmek için:
app.delete('/admin/api/short-link/:code', adminOnly, async (req, res) => {
  const { code } = req.params;
  try {
    const r = await pool.query('UPDATE short_links SET active=FALSE WHERE code=$1', [code]);
    if (!r.rowCount) return res.status(404).json({ ok: false, error: 'Kod bulunamadı' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ======== Statik dosyalar ========
app.use(express.static(path.join(__dirname, 'public')));

// Kök -> index.html (form seçici sayfa)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404
app.use((_req, res) => res.status(404).send('Not found'));

// Start
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`MikroAR up on :${PORT}`);
});
