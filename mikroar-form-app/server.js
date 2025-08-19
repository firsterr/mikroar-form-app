// server.js — MikroAR Forms (final)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import basicAuth from 'basic-auth';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

// --- __dirname/__filename (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- ENV
const PORT           = process.env.PORT || 3000;
const DATABASE_URL   = process.env.DATABASE_URL;
const CORS_ORIGIN    = process.env.CORS_ORIGIN || '*';
const ADMIN_USER     = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS     = process.env.ADMIN_PASS || 'password';
const GUEST_USER     = process.env.GUEST_USER || '';   // opsiyonel
const GUEST_PASS     = process.env.GUEST_PASS || '';   // opsiyonel
const FRAME_ANCESTORS= process.env.FRAME_ANCESTORS || ''; // "https://sites.google.com, https://*.mikroar.com"

if (!DATABASE_URL) {
  console.error('DATABASE_URL tanımlı değil!');
  process.exit(1);
}

// --- DB
const pool = new Pool({ connectionString: DATABASE_URL });

// --- APP
const app = express();
app.set('trust proxy', true);

// --- Helmet + CSP (frame-ancestors)
const faList = FRAME_ANCESTORS.split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "frame-ancestors": faList.length ? faList : ["'self'"],
    }
  },
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// --- Body, logs, cors
app.use(cors({ origin: CORS_ORIGIN, credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

// --- BasicAuth korumaları (path bazlı)
const protectedPaths = [
  /^\/admin\.html$/,
  /^\/index\.html$/,
  /^\/results\.html$/,
  /^\/form\.html$/,
  /^\/$/,                 // root da seçim sayfası
  /^\/f\/[^/]+$/,         // SSR form
];

app.use((req, res, next) => {
  if (protectedPaths.some(rx => rx.test(req.path))) {
    const user = basicAuth(req);
    const ok =
      (user && user.name === ADMIN_USER && user.pass === ADMIN_PASS) ||
      (!!GUEST_USER && !!GUEST_PASS && user && user.name === GUEST_USER && user.pass === GUEST_PASS);

    if (!ok) {
      res.set('WWW-Authenticate', 'Basic realm="MikroAR"');
      return res.status(401).send('Yetkisiz');
    }
  }
  next();
});

// ---------------- API ----------------

// Aktif tüm formlar (slug, title)
app.get('/api/forms-list', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title
         FROM forms
        WHERE active IS DISTINCT FROM false
        ORDER BY created_at DESC NULLS LAST, slug ASC`
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Form şeması
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

// Yanıt kaydet (IP bazlı tek oy için DB tarafında unique index önerilir)
app.post('/api/forms/:slug/submit', async (req, res) => {
  const { slug } = req.params;
  const payload = req.body || {};

  const xff = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(xff) ? xff[0] : (typeof xff === 'string' ? xff.split(',')[0].trim() : null);
  const ip = forwardedIp || req.ip || req.connection?.remoteAddress || null;

  try {
    // form var & aktif?
    const form = await pool.query(
      'SELECT 1 FROM forms WHERE slug=$1 AND (active IS DISTINCT FROM false)',
      [slug]
    );
    if (form.rowCount === 0) return res.status(404).json({ ok: false, error: 'Form bulunamadı veya pasif' });

    await pool.query(
      `INSERT INTO responses (form_slug, payload, user_agent, ip)
       VALUES ($1, $2, $3, $4)`,
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

// Admin: yanıtlar (ham)
app.get('/admin/forms/:slug/responses.json', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT id, payload, user_agent, ip, created_at
         FROM responses
        WHERE form_slug=$1
        ORDER BY created_at DESC`,
      [slug]
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------------- SSR: /f/:slug (statikten ÖNCE!) ----------------
app.get('/f/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT slug, title, active, schema FROM forms WHERE slug=$1',
      [slug]
    );
    if (!rows.length || rows[0].active === false) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(404).send(`<!doctype html><meta charset="utf-8"><h1>Form bulunamadı</h1>`);
    }
    const form = rows[0];
    const inline = JSON.stringify({ ok: true, form });

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${form.title || slug}</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header class="container">
    <h1 id="pageTitle">${form.title || slug}</h1>
  </header>

  <main class="container">
    <div id="skeleton"></div>
    <section id="content" hidden>
      <form id="theForm">
        <div id="questions"></div>
        <div id="msg" class="mt-3"></div>
        <button id="sendBtn" type="submit" class="btn-primary">Gönder</button>
      </form>
    </section>
  </main>

  <script id="__FORM_DATA__" type="application/json">${inline}</script>
  <script src="/form.js" defer></script>
</body>
</html>`);
  } catch (e) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send(`<!doctype html><meta charset="utf-8"><h1>Sunucu hatası</h1>`);
  }
});

// ---------------- Statik + Root ----------------
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------- Start ----------------
app.listen(PORT, () => {
  console.log(`MikroAR Form API ${PORT} portunda çalışıyor`);
});
