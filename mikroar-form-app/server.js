import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import basicAuth from 'basic-auth';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;
const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.set('trust proxy', true); // ← Render/Nginx arkasında gerçek IP için
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*'}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

function adminOnly(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== process.env.ADMIN_USER || user.pass !== process.env.ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}

app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload = req.body;
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;

  try {
    const formExists = await pool.query('SELECT 1 FROM forms WHERE slug=$1', [slug]);
    if (formExists.rowCount === 0) return res.status(404).json({ ok: false, error: 'Form bulunamadı' });

    // IP bazlı tek oy: INSERT dener, unique ihlalini yakalar
    await pool.query(
      'INSERT INTO responses (form_slug, payload, user_agent, ip) VALUES ($1, $2, $3, $4)',
      [slug, payload, req.get('user-agent') || null, ip]
    );
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') { // unique violation
      return res.status(409).json({ ok: false, error: 'Bu IP’den zaten yanıt gönderilmiş.' });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// İstatistik küçük endpoint (isteğe bağlı)
app.get('/admin/forms/:slug/stats', adminOnly, async (req, res) => {
  const { slug } = req.params;
  const { rows } = await pool.query('SELECT COUNT(*)::int as count FROM responses WHERE form_slug=$1', [slug]);
  res.json({ ok: true, count: rows[0].count });
});

app.get('/admin/forms/:slug/responses.json', adminOnly, async (req, res) => {
  const { slug } = req.params;
  const { rows } = await pool.query('SELECT * FROM responses WHERE form_slug=$1 ORDER BY created_at DESC', [slug]);
  res.json({ ok: true, rows });
});

app.listen(PORT, () => console.log(`Server ${PORT} portunda`));
