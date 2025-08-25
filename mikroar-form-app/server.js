/**
 * mikroar-form-app / server.js (ESM)
 * Tüm dosyayı yapıştır — var olanın yerine koy.
 */

import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import basicAuth from 'basic-auth';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

/* ------------------------------------------------------------------ */
/*  Ortam & DB                                                         */
/* ------------------------------------------------------------------ */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  DATABASE_URL,
  NODE_ENV = 'production',
  DUPLICATE_POLICY = 'INSERT', // INSERT | UPDATE
  BASIC_AUTH_USER = 'adminfirster',
  BASIC_AUTH_PASS = '10Yor!!de_',
} = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL yok.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render/Heroku benzeri ortamlarda gerekli olabilir
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
});

/* ------------------------------------------------------------------ */
/*  App                                                                */
/* ------------------------------------------------------------------ */

const app = express();

// proxy arkasından doğru IP alabilmek için
app.set('trust proxy', 2);

// body
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// log & cors
app.use(morgan('tiny'));
app.use(cors());

/* ------------------------------------------------------------------ */
/*  IP normalizasyonu                                                  */
/* ------------------------------------------------------------------ */

// IPv4 & IPv6 regex
const IPv4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPv6_RE =
  /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(::1)|(([0-9A-Fa-f]{1,4}:){1,7}:)|(:{1,7}[0-9A-Fa-f]{1,4}))$/;

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();

  // IPv6-mapped IPv4 ::ffff:x.x.x.x
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  // X-Forwarded-For gibi "ip1, ip2, ip3" alınmışsa ilkini al
  if (ip.includes(',')) ip = ip.split(',')[0].trim();

  // IPv4 veya IPv6 ise dön; değilse null
  if (IPv4_RE.test(ip) || IPv6_RE.test(ip)) return ip;
  return null;
}

function pickClientIp(req) {
  const chain = [
    req.headers['cf-connecting-ip'],
    req.headers['x-client-ip'],
    req.headers['x-real-ip'],
    req.headers['x-forwarded-for'], // ip zinciri olabilir
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);

  for (const v of chain) {
    const first = String(v).split(',')[0].trim().replace(/:\d+$/, ''); // varsa port at
    const ok = normalizeIp(first);
    if (ok) return ok;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Helmet (CSP)                                                       */
/* ------------------------------------------------------------------ */

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "frame-ancestors": ["'self'"], // istersen env'den de okuyabilirsin
        "script-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "style-src": ["'self'", "'unsafe-inline'"],
      },
    },
    frameguard: false, // X-Frame-Options kapalı (CSP kullanıyoruz)
    crossOriginEmbedderPolicy: false,
  })
);

/* ------------------------------------------------------------------ */
/*  Basic Auth (subdomain bazlı)                                       */
/* ------------------------------------------------------------------ */
/**
 * İstediğimiz kural:
 * - form.mikroar.com ve anket.mikroar.com genel olarak korumalı
 * - Ancak form.mikroar.com/form.html?slug=... şifresiz olmalı (kullanıcıların oyu)
 * - results.html her durumda korumalı olmalı
 */
function wantsAuth(req) {
  const host = (req.headers.host || '').toLowerCase();
  const p = req.path.toLowerCase();

  const isFormSub = host.startsWith('form.');
  const isAnketSub = host.startsWith('anket.');

  // form.html şifresiz (sadece form subdomain)
  const isPublicVotePage = isFormSub && p === '/form.html' && !!req.query.slug;

  // results.html her zaman şifreli (form subdomain de olsa)
  const isResults = p === '/results.html';

  if (isResults) return true; // sonuç sayfası her zaman korumalı

  // admin (anket) ve form genel olarak korumalı; ama public form sayfası hariç
  if ((isFormSub || isAnketSub) && !isPublicVotePage) return true;

  return false;
}

function authMiddleware(req, res, next) {
  if (!wantsAuth(req)) return next();

  const user = basicAuth(req);
  const ok = user && user.name === BASIC_AUTH_USER && user.pass === BASIC_AUTH_PASS;
  if (ok) return next();

  res.set('WWW-Authenticate', 'Basic realm="Restricted"');
  return res.status(401).send('Authentication required.');
}

app.use(authMiddleware);

/* ------------------------------------------------------------------ */
/*  /form.html & /results.html sadece form.mikroar.com                 */
/* ------------------------------------------------------------------ */
/**
 * Statik servisten ÖNCE olmalı.
 * Böylece anket.mikroar.com/form.html?slug=...  => 403
 *      form.mikroar.com/form.html?slug=...     => OK
 * results.html da sadece form subdomain’de ve auth ile açılır.
 */
app.use((req, res, next) => {
  const host = (req.headers.host || '').toLowerCase();
  const p = req.path.toLowerCase();

  if ((p === '/form.html' || p === '/results.html') && !host.startsWith('form.')) {
    return res.status(403).send('❌ Bu sayfa sadece form.mikroar.com üzerinden erişilebilir');
  }
  next();
});

/* ------------------------------------------------------------------ */
/*  Statik                                                             */
/* ------------------------------------------------------------------ */

app.use(express.static(path.join(__dirname, 'public'), { index: false }));

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

// Sağlık
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Aktif formlar listesi
app.get('/api/forms-list', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT slug, title FROM forms WHERE active = TRUE ORDER BY created_at DESC'
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Form detayı
app.get('/api/forms/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, schema FROM forms WHERE slug = $1 LIMIT 1',
      [slug]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: 'Form bulunamadı' });

    const f = rows[0];
    const schema = typeof f.schema === 'string' ? JSON.parse(f.schema) : f.schema;

    res.json({
      ok: true,
      form: { ...f, schema },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Submit
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const answers = req.body?.answers ?? req.body;
  const ip = pickClientIp(req) || '0.0.0.0';

  try {
    const f = await pool.query('SELECT slug, active FROM forms WHERE slug = $1', [slug]);
    if (!f.rows.length) return res.status(404).json({ ok: false, error: 'Form bulunamadı' });
    if (!f.rows[0].active) return res.status(403).json({ ok: false, error: 'Form pasif' });

    if (String(DUPLICATE_POLICY).toUpperCase() === 'UPDATE') {
      const q =
        'INSERT INTO responses(form_slug, ip, answers, created_at) VALUES ($1,$2,$3, now()) ' +
        'ON CONFLICT (form_slug, ip) DO UPDATE SET answers = EXCLUDED.answers, created_at = now() ' +
        'RETURNING id, created_at';
      const { rows } = await pool.query(q, [slug, ip, answers]);
      return res.json({ ok: true, updated: true, at: rows[0]?.created_at });
    }

    try {
      const q =
        'INSERT INTO responses(form_slug, ip, answers, created_at) VALUES ($1,$2,$3, now()) RETURNING id, created_at';
      const { rows } = await pool.query(q, [slug, ip, answers]);
      return res.json({ ok: true, created: true, at: rows[0]?.created_at });
    } catch (err) {
      if (err?.code === '23505') {
        const old = await pool.query(
          'SELECT created_at FROM responses WHERE form_slug = $1 AND ip = $2',
          [slug, ip]
        );
        return res.json({
          ok: true,
          alreadySubmitted: true,
          at: old.rows[0]?.created_at || null,
        });
      }
      throw err;
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Basit sonuç endpoint'i (results.js bununla konuşuyor olabilir)
app.get('/api/forms/:slug/responses', async (req, res) => {
  const { slug } = req.params;
  try {
    const meta = await pool.query('SELECT slug, title, active, schema FROM forms WHERE slug=$1', [
      slug,
    ]);
    if (!meta.rows.length) return res.status(404).json({ ok: false, error: 'Form yok' });

    const { rows } = await pool.query(
      `SELECT created_at, ip::text AS ip, answers
       FROM responses
       WHERE form_slug = $1
       ORDER BY created_at DESC`,
      [slug]
    );

    const form = meta.rows[0];
    const schema = typeof form.schema === 'string' ? JSON.parse(form.schema) : form.schema;

    res.json({
      ok: true,
      info: {
        slug: form.slug,
        title: form.title,
        active: form.active,
        questionCount: Array.isArray(schema?.questions) ? schema.questions.length : 0,
      },
      rows,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Host'a göre ana sayfa seçimi (admin/index)                         */
/* ------------------------------------------------------------------ */

app.get('/', (req, res) => {
  const host = (req.headers.host || '').toLowerCase();
  const file = host.startsWith('anket.')
    ? path.join(__dirname, 'public', 'admin.html') // anket builder
    : path.join(__dirname, 'public', 'index.html'); // form seç

  res.sendFile(file);
});

// kök için default index (emniyet)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* ------------------------------------------------------------------ */
/*  Sunucu                                                             */
/* ------------------------------------------------------------------ */

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`✅ mikroar-form-app up: http://localhost:${PORT} (${NODE_ENV})`);
});
