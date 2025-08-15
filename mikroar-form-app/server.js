// server.js — MikroAR Anket Sunucusu (tam sürüm)
import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import basicAuth from 'basic-auth';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

// --- Ortam değişkenleri ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'password';

if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil!');
  process.exit(1);
}

// --- DB havuzu ---
const pool = new Pool({ connectionString: DATABASE_URL });

// --- App kurulumu ---
const app = express();
app.set('trust proxy', true); // Render / proxy arkasında gerçek IP için
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// --- Admin koruması ---
function adminOnly(req, res, next) {
  const user = basicAuth(req);
  if (!user || user.name !== ADMIN_USER || user.pass !== ADMIN_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="MikroAR Admin"');
    return res.status(401).send('Yetkisiz');
  }
  next();
}

// --- Sağlık kontrolü ---
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Public: form şemasını getir ===
// forms tablosu: slug (PK/UNIQUE), title, active (bool), schema (jsonb)
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

// === Public: yanıt kaydet (IP bazlı tek oy) ===
// responses tablosu: form_slug, payload(jsonb), user_agent, ip, created_at
// DB’de unique index önerilir: UNIQUE(form_slug, ip)
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload = req.body || {};
  // Gerçek istemci IP'sini al
  const xff = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(xff) ? xff[0] : (typeof xff === 'string' ? xff.split(',')[0].trim() : null);
  const ip = forwardedIp || req.ip || req.connection?.remoteAddress || null;

  try {
    // Form var ve aktif mi?
    const form = await pool.query(
      'SELECT 1 FROM forms WHERE slug=$1 AND (active IS DISTINCT FROM false)',
      [slug]
    );
    if (form.rowCount === 0) {
      return res.status(404).json({ ok: false, error: 'Form bulunamadı veya pasif' });
    }

    // Ekle (UNIQUE ihlalinde 23505 döner)
    await pool.query(
      'INSERT INTO responses (form_slug, payload, user_agent, ip) VALUES ($1, $2, $3, $4)',
      [slug, payload, req.get('user-agent') || null, ip]
    );

    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') {
      // uniq_response_per_ip_per_form index’i tetiklendi
      return res.status(409).json({ ok: false, error: 'Bu IP’den zaten yanıt gönderilmiş.' });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Admin: form listele (özet) ===
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

// === Admin: form oluştur/güncelle ===
// Body: { slug, title, active(true/false), schema(json) }
app.post('/admin/api/forms', adminOnly, async (req, res) => {
  const { slug, title, active = true, schema } = req.body || {};
  if (!slug || !title) {
    return res.status(400).json({ ok: false, error: 'slug ve title gerekli' });
  }
  try {
    await pool.query(
      `INSERT INTO forms (slug, title, active, schema)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
       SET title=EXCLUDED.title, active=EXCLUDED.active, schema=EXCLUDED.schema`,
      [slug, title, active, schema || null]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// === Admin: yanıtları listele (kontrol için) ===
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

// === Admin: sayım ===
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
// 1) responses.json dosyası yolu
const RESP_FILE = path.join(__dirname, 'responses.json');

// 2) Dosyadan okuma fonksiyonu
function readResponses(){
  if(!fs.existsSync(RESP_FILE)) return [];
  return JSON.parse(fs.readFileSync(RESP_FILE));
}

// 3) Dosyaya yazma fonksiyonu
function saveResponses(list){
  fs.writeFileSync(RESP_FILE, JSON.stringify(list, null, 2));
}

// 4) Yeni endpoint: Cevap kaydetme
app.post('/api/responses', (req, res) => {
  try {
    const { slug, answers } = req.body || {};
    
    // Zorunlu kontrol
    if(!slug || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Eksik veri' });
    }
    
    // Mevcut kayıtları oku
    const list = readResponses();
    
    // Yeni cevabı ekle
    list.push({
      slug,
      answers,
      ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString(),
      user_agent: req.headers['user-agent'] || '',
      created_at: new Date().toISOString()
    });
    
    // Kaydet
    saveResponses(list);
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// --- Sunucu başlat ---
app.listen(PORT, () => {
  console.log(`MikroAR Form API ${PORT} portunda çalışıyor`);
});
