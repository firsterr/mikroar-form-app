// --- Core/ESM helpers ---
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Packages ---
import express   from 'express';
import dotenv    from 'dotenv';
import helmet    from 'helmet';
import cors      from 'cors';
import morgan    from 'morgan';
import basicAuth from 'basic-auth';
import pgPkg     from 'pg';
import { Parser } from 'json2csv'; // CSV export

dotenv.config();
const { Pool } = pgPkg;

// --- Env ---
const PORT            = process.env.PORT || 3000;
const DATABASE_URL    = process.env.DATABASE_URL;
const CORS_ORIGIN     = process.env.CORS_ORIGIN || '*';
const ADMIN_USER      = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS      = process.env.ADMIN_PASS || 'password';
const DEFAULT_FORM_SLUG = process.env.DEFAULT_FORM_SLUG || 'formayvalik';

// iframe izinleri (virgül ile ayrılmış liste): ör. https://sites.google.com, https://*.mikroar.com
const FRAME_ALLOW = (process.env.FRAME_ANCESTORS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil!');
  process.exit(1);
}
const pool = new Pool({ connectionString: DATABASE_URL });

const app = express();
app.set('trust proxy', true);

// --- Security headers (Google Sites / custom domain iframe) ---
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "frame-ancestors": ["'self'", ...FRAME_ALLOW],
    }
  },
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// --- Parsers / CORS / Logs / Static ---
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Small client config: default slug ---
app.get('/_config.js', (_req, res) => {
  res
    .type('application/javascript')
    .send(`window.__CFG=${JSON.stringify({ defaultSlug: DEFAULT_FORM_SLUG })};`);
});

// --- Host-based root routing (no redirect → URL değişmez) ---
const PUBLIC_DIR = path.join(__dirname, 'public');
app.get('/', (req, res, next) => {
  if (req.hostname === 'form.mikroar.com') {
    return res.sendFile(path.join(PUBLIC_DIR, 'form.html'));
  }
  if (req.hostname === 'anket.mikroar.com') {
    return res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
  }
  return next();
});

// Bookmark için: /admin → admin.html
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'admin.html'));
});

// --- Basic auth helper (admin bölgeleri) ---
function adminOnly(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}

// --- Health ---
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- Public: form schema ---
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

// --- Public: submit (IP bazlı tek oy) ---
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload = req.body || {};

  const xff = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(xff) ? xff[0]
    : (typeof xff === 'string' ? xff.split(',')[0].trim() : null);
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

// --- Admin: list forms ---
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

// --- Admin: upsert form ---
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

// --- Admin: raw responses ---
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

// --- Admin: count ---
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

// --- Admin: CSV export (pivot) ---
app.get('/admin/forms/:slug/export.csv', adminOnly, async (req, res) => {
  const { slug } = req.params;

  const { rows } = await pool.query(
    `select r.created_at, a.key as question, 
            case when jsonb_typeof(a.value) = 'array'
                 then array(select jsonb_array_elements_text(a.value))
                 else array[trim(both '"' from a.value::text)]
            end as answers
       from responses r
       cross join lateral jsonb_each(r.payload->'answers') as a(key, value)
      where r.form_slug = $1
      order by r.created_at`,
    [slug]
  );

  const grouped = {};
  for (const row of rows) {
    const ts = row.created_at?.toISOString ? row.created_at.toISOString() : row.created_at;
    if (!grouped[ts]) grouped[ts] = { created_at: ts };
    grouped[ts][row.question] = row.answers.join(', ');
  }
  const data = Object.values(grouped);

  const parser = new Parser();
  const csv = parser.parse(data);

  res.header('Content-Type', 'text/csv');
  res.attachment(`${slug}_export.csv`);
  res.send(csv);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`MikroAR Form API ${PORT} portunda çalışıyor`);
});
