// server.js  —  ESM

// ---- Imports
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import pkg from "pg";
const { Pool } = pkg;
import path from "path";
import { fileURLToPath } from "url";
import net from "node:net";
import crypto from "node:crypto";

// ---- Kısa kod üretici
function makeCode(len = 7) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

// ---- Env
const {
  PORT = 3000,
  DATABASE_URL,
  CORS_ORIGIN = "*",
  ADMIN_USER = "admin",
  ADMIN_PASS = "admin",
  FRAME_ANCESTORS = "",
  DUPLICATE_POLICY = "BLOCK", // BLOCK | UPDATE
} = process.env;

// ---- DB
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

// ---- App
const app = express();
app.set("trust proxy", true);

// ---- yardımcılar
function getHost(req) {
  return (req.headers["x-forwarded-host"] || req.hostname || req.headers.host || "").toLowerCase();
}

const IPv4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPv6_RE = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(::1)|(([0-9A-Fa-f]{1,4}:){1,7}:)|(:{2}([0-9A-Fa-f]{1,4}:){1,6}[0-9A-Fa-f]{1,4}))$/;

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.includes(",")) ip = ip.split(",")[0].trim();
  const withPort = ip.match(/^\[?([^\]]+)\]?:(\d+)$/);
  if (withPort) ip = withPort[1];
  if (IPv4_RE.test(ip) || IPv6_RE.test(ip)) return ip;
  return null;
}

function pickClientIp(req) {
  const chain = [
    req.headers["cf-connecting-ip"],
    req.headers["x-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-forwarded-for"],
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);

  for (let raw of chain) {
    let first = String(raw).split(",")[0].trim();
    first = first.replace(/^\[|\]$/g, "").replace(/:\d+$/, "");
    if (first.startsWith("::ffff:")) first = first.slice(7);
    if (net.isIP(first)) return first;
  }
  return null;
}

// ---- Preview bot tespiti (WA/FB/Twitter/LinkedIn/Slack/Discord)
function isPreviewBot(ua = "") {
  ua = String(ua || "").toLowerCase();
  return (
    ua.includes("facebookexternalhit") ||
    ua.includes("facebot") ||
    ua.includes("whatsapp") ||
    ua.includes("twitterbot") ||
    ua.includes("linkedinbot") ||
    ua.includes("slackbot") ||
    ua.includes("discordbot")
  );
}

// ---- OG HTML üretici
function renderOgHtml({ url, title, description, image }) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>

  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:locale" content="tr_TR">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
</head>
<body>
  <noscript><p><a href="${url}">${title}</a></p></noscript>
  <script>location.replace(${JSON.stringify(url)});</script>
</body>
</html>`;
}

// ---- Güvenlik (CSP)
const faList = FRAME_ANCESTORS ? FRAME_ANCESTORS.split(",").map(s => s.trim()).filter(Boolean) : [];
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "frame-ancestors": faList.length ? faList : ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"],
        "img-src": ["'self'", "data:"],
        "style-src": ["'self'", "'unsafe-inline'"],
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ---- Sağlık (Render için sade)
app.get("/health", (_req, res) => res.status(200).send("ok"));

// __dirname eşdeğeri
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Subdomain bazlı Basic Auth + guard
app.use((req, res, next) => {
  const host = getHost(req);
  if (req.path === "/health") return next();

  // anket.mikroar.com -> her şey şifreli + /form.html yasak
  if (host.startsWith("anket.")) {
    if (req.path.startsWith("/form.html")) return res.status(404).send("Not found");
    return adminOnly(req, res, next);
  }

  // form.mikroar.com -> portal sayfaları şifreli (index/results)
  if (host.startsWith("form.")) {
    const isPortal =
      req.method === "GET" &&
      (req.path === "/" || req.path === "/index.html" || req.path === "/results.html");
    if (isPortal) return adminOnly(req, res, next);
  }
  next();
});

// ---- Middlewares
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map(s => s.trim()),
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// --- SSR form: /form.html?slug=XYZ (aktif değilse 200 + mesaj)
app.get("/form.html", async (req, res, next) => {
  const slug = (req.query.slug || "").toString().trim().toLowerCase();
  if (!slug) return next();

  try {
    const { rows } = await pool.query(
      "SELECT slug, title, active, schema FROM forms WHERE slug = $1 LIMIT 1",
      [slug]
    );
    if (!rows.length) return res.status(404).send("Form bulunamadı.");

    const form = rows[0];
    try { if (typeof form.schema === "string") form.schema = JSON.parse(form.schema); } catch {}

    const isActive = form.active !== false;

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${(form.title || "Anket").replace(/</g,"&lt;")}</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}
  h1{margin:0 0 16px}
  .q{margin:14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px}
  .q label{font-weight:600;display:block;margin-bottom:8px}
  .opt{display:block;margin:6px 0}
  .muted{color:#6b7280}
  button{padding:10px 14px;font-size:16px;border-radius:10px;border:1px solid #d1d5db;background:#111827;color:#fff}
  button:disabled{opacity:.5}
</style>
</head>
<body>
  <h1 id="form-title"></h1>
  ${isActive ? `<form id="f"></form>` : `<p class="muted">Bu anketin süresi dolmuştur.</p>`}
  <script>window.__FORM__ = ${JSON.stringify(form)};</script>
  ${isActive ? `<script src="/form.js?v=ssr1"></script>` : ``}
</body>
</html>`;
    return res.status(200).send(html);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Sunucu hatası.");
  }
});

// ---- OG HTML (genişletilmiş)
function renderOgHtmlFull({ url, title, description, image, siteName = "MikroAR", imgW = 480, imgH = 270, bodyHtml = "" }) {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>

  <link rel="canonical" href="${url}">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="${imgW}">
  <meta property="og:image:height" content="${imgH}">
  <meta property="og:locale" content="tr_TR">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
</head>
<body>
  ${bodyHtml || `<noscript><p><a href="${url}">${title}</a></p></noscript><script>location.replace(${JSON.stringify(url)});</script>`}
</body>
</html>`;
}

// --- /s/:code -> kısa link (botlara OG, kullanıcılara redirect)
app.get("/s/:code", async (req, res) => {
  const code = (req.params.code || "").trim();
  if (!code) return res.status(404).send("Not found");

  try {
    // kısa linki al
    const { rows } = await pool.query(
      `SELECT slug, expires_at, max_visits, COALESCE(visits,0) AS visits
         FROM shortlinks
        WHERE code = $1`,
      [code]
    );
    if (!rows.length) return res.status(404).send("Link bulunamadı");

    const sl = rows[0];
    const now = new Date();
    if (sl.expires_at && new Date(sl.expires_at) < now) {
      return res.status(410).send("Bu linkin süresi dolmuş.");
    }
    if (sl.max_visits != null && sl.visits >= sl.max_visits) {
      return res.status(410).send("Bu linkin ziyaret limiti dolmuş.");
    }

    // forma bak
    const fr = await pool.query(
      "SELECT slug, title, active, schema FROM forms WHERE slug=$1 LIMIT 1",
      [sl.slug]
    );
    if (!fr.rows.length || fr.rows[0].active === false) {
      return res.status(404).send("Form bulunamadı veya pasif.");
    }
    const form = fr.rows[0];

    // Bot tespiti (WhatsApp/Facebook/Twitter/LinkedIn/Slack vb.)
    const ua = (req.headers["user-agent"] || "").toLowerCase();
    const isBot = /(facebookexternalhit|facebot|twitterbot|linkedinbot|pinterest|slackbot|whatsapp|discordbot|telegrambot|vkshare|embedly|quora|googlebot|bingbot|duckduckbot|yandex)/i.test(
      ua
    );
    const forcePreview = "preview" in req.query;

    const target = `/form.html?slug=${encodeURIComponent(form.slug)}`;

    // İnsanlar -> direkt ankete
    if (!isBot && !forcePreview) {
      return res.redirect(302, target);
    }

    // Botlar (veya ?preview=1) -> OG meta ver
    const site = `https://${req.headers.host}`;
    const ogUrl = `${site}/s/${code}`;

    // (isterseniz burada slug’a özel bir görsel/başlık/özet kurgulayabilirsiniz)
    const ogTitle = String(form.title || "MikroAR Anketi");
    const ogDesc =
      "CHP'li Belediye Başkanlarının Ak Parti'ye geçişlerini nasıl değerlendiriyorsunuz?";
    const ogImage =
      req.query.img ||
      "https://img.gazetemerhaba.com/rcman/Cw480h270q95gc/storage/files/images/2025/08/16/ahmet-akin-ak-parti-chp-w7pn.jpg";

    res.set("Cache-Control", "public, s-maxage=600, max-age=600");
    res.type("html").send(`<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(ogTitle)}</title>
  <link rel="canonical" href="${ogUrl}" />
  <meta property="og:url" content="${ogUrl}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(ogTitle)}">
  <meta property="og:description" content="${escapeHtml(ogDesc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(ogTitle)}">
  <meta name="twitter:description" content="${escapeHtml(ogDesc)}">
  <meta name="twitter:image" content="${ogImage}">
  <meta property="og:locale" content="tr_TR">
  <meta name="robots" content="noindex,follow">
</head>
<body><!-- intentionally empty for bots --></body>
</html>`);
    // ziyaret sayısını arttır (arka planda)
    pool.query("UPDATE shortlinks SET visits = COALESCE(visits,0)+1 WHERE code=$1", [code]).catch(()=>{});
  } catch (e) {
    console.error(e);
    res.status(500).send("Server error");
  }
});

// küçük kaçış yardımcıları
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---- Statik
app.use(
  express.static(path.join(__dirname, "public"), {
    index: false,
  })
);

// ---- Basic Auth (admin)
function adminOnly(req, res, next) {
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Basic ")) {
    res.set("WWW-Authenticate", 'Basic realm="MikroAR Admin"');
    return res.status(401).send("Yetkisiz");
  }
  const [u, p] = Buffer.from(hdr.split(" ")[1], "base64").toString().split(":");
  if (u !== ADMIN_USER || p !== ADMIN_PASS) {
    res.set("WWW-Authenticate", 'Basic realm="MikroAR Admin"');
    return res.status(401).send("Yetkisiz");
  }
  next();
}

// Basit ping – admin giriş kontrolü
app.get("/api/admin/ping", adminOnly, (_req, res) => res.json({ ok: true }));

// --- Kısa link oluştur (admin)
// Örnek: https://form.mikroar.com/admin/api/shortlink/new?slug=chpakgecis
app.get("/admin/api/shortlink/new", adminOnly, async (req, res) => {
  try {
    const slug = (req.query.slug || "").toString().trim().toLowerCase();
    let code   = (req.query.code || "").toString().trim();
    const days = req.query.days ? parseInt(req.query.days, 10) : null;
    const max  = req.query.max  ? parseInt(req.query.max, 10)  : null;

    if (!slug) return res.status(400).json({ ok: false, error: "slug gerekli" });
    const f = await pool.query("SELECT 1 FROM forms WHERE slug=$1", [slug]);
    if (!f.rows.length) return res.status(404).json({ ok: false, error: "form yok" });

    if (!code) {
      for (let i = 0; i < 5; i++) {
        const tryCode = makeCode(7);
        const dup = await pool.query("SELECT 1 FROM shortlinks WHERE code=$1", [tryCode]);
        if (!dup.rows.length) { code = tryCode; break; }
      }
      if (!code) return res.status(500).json({ ok: false, error: "kod üretilemedi" });
    } else {
      const dup = await pool.query("SELECT 1 FROM shortlinks WHERE code=$1", [code]);
      if (dup.rows.length) return res.status(409).json({ ok: false, error: "code kullanımda" });
    }

    let expires = null;
    if (days && days > 0) {
      const d = new Date(); d.setDate(d.getDate() + days);
      expires = d.toISOString();
    }

    await pool.query(
      "INSERT INTO shortlinks(code, slug, expires_at, max_visits) VALUES ($1,$2,$3,$4)",
      [code, slug, expires, (Number.isFinite(max) ? max : null)]
    );

    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const url  = `https://${host}/s/${code}`;
    res.json({ ok: true, code, url, expires_at: expires, max_visits: max });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- FORMS LIST (aktifler)
app.get("/api/forms-list", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title FROM forms WHERE active = TRUE ORDER BY created_at DESC`
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- GET: tek form (aktif kontrolü)
app.get("/api/forms/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, active, schema FROM forms WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "not_found" });
    if (rows[0].active === false) return res.status(403).json({ ok: false, error: "inactive" });

    const form = rows[0];
    try { if (typeof form.schema === "string") form.schema = JSON.parse(form.schema); } catch {}
    res.json({ ok: true, form });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- ADMIN: formu aktif/pasif bakmadan getir
app.get("/admin/api/forms/:slug", adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, active, schema FROM forms WHERE slug = $1 LIMIT 1`,
      [slug]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "not_found" });

    const form = rows[0];
    try { if (typeof form.schema === "string") form.schema = JSON.parse(form.schema); } catch {}
    res.json({ ok: true, form });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- IP debug (opsiyonel)
app.get("/api/__ip", (req, res) => {
  res.json({
    ok: true,
    ip: pickClientIp(req),
    trustProxy: app.get("trust proxy"),
    chain: {
      cfConnectingIp: req.headers["cf-connecting-ip"] || null,
      xClientIp: req.headers["x-client-ip"] || null,
      xRealIp: req.headers["x-real-ip"] || null,
      xForwardedFor: req.headers["x-forwarded-for"] || null,
      reqIp: req.ip || null,
      remoteAddress: req.socket?.remoteAddress || null,
    },
  });
});

// ---- SUBMIT
app.post("/api/forms/:slug/submit", async (req, res) => {
  const { slug } = req.params;

  const answersRaw = req.body?.answers ?? req.body;
  if (!answersRaw || typeof answersRaw !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }
  const answersJson = JSON.stringify(answersRaw);

  const clientIp = pickClientIp(req) || null;

  try {
    const f = await pool.query("SELECT slug, active FROM forms WHERE slug = $1", [slug]);
    if (!f.rows.length) return res.status(404).json({ ok: false, error: "Form bulunamadı" });
    if (!f.rows[0].active) return res.status(403).json({ ok: false, error: "Form pasif" });

    if (String(DUPLICATE_POLICY).toUpperCase() === "UPDATE") {
      const upsertSql = `
        INSERT INTO responses (form_slug, ip, answers, created_at)
        VALUES ($1, $2::inet, $3::jsonb, NOW())
        ON CONFLICT (form_slug, ip)
        DO UPDATE SET answers = EXCLUDED.answers, created_at = NOW()
        RETURNING id, created_at
      `;
      const { rows } = await pool.query(upsertSql, [slug, clientIp, answersJson]);
      return res.json({ ok: true, updated: true, at: rows[0]?.created_at });
    }

    try {
      const insertSql = `
        INSERT INTO responses (form_slug, ip, answers, created_at)
        VALUES ($1, $2::inet, $3::jsonb, NOW())
        RETURNING id, created_at
      `;
      const { rows } = await pool.query(insertSql, [slug, clientIp, answersJson]);
      return res.json({ ok: true, created: true, at: rows[0]?.created_at });
    } catch (err) {
      if (err?.code === "23505") {
        const old = await pool.query(
          "SELECT created_at FROM responses WHERE form_slug = $1 AND ip = $2::inet",
          [slug, clientIp]
        );
        return res.json({ ok: true, alreadySubmitted: true, at: old.rows[0]?.created_at || null });
      }
      throw err;
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- RESULTS (admin)
app.get("/api/admin/forms/:slug/responses", adminOnly, async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows: formRows } = await pool.query(
      "SELECT title, schema, active FROM forms WHERE slug = $1",
      [slug]
    );
    if (!formRows.length) return res.status(404).json({ ok: false, error: "Form bulunamadı" });

    const meta = formRows[0];
    try { if (typeof meta.schema === "string") meta.schema = JSON.parse(meta.schema); } catch {}

    const { rows } = await pool.query(
      `SELECT created_at, ip::text AS ip, answers
         FROM responses
        WHERE form_slug = $1
        ORDER BY created_at DESC`,
      [slug]
    );

    res.json({ ok: true, meta, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- ADMIN: form CREATE/UPDATE
app.post("/api/admin/forms/save", adminOnly, async (req, res) => {
  try {
    let { slug, title, schema, active, prevSlug } = req.body || {};

    if (typeof slug !== "string" || !slug.trim()) {
      return res.status(400).json({ ok: false, error: "invalid_slug" });
    }
    slug = slug.trim().toLowerCase();
    if (typeof title !== "string") title = "";

    if (typeof schema === "string") {
      try { schema = JSON.parse(schema); }
      catch { return res.status(400).json({ ok: false, error: "bad_schema_json" }); }
    }
    if (!schema || typeof schema !== "object") {
      return res.status(400).json({ ok: false, error: "invalid_schema" });
    }
    const schemaJson = JSON.stringify(schema);

    const truthy = new Set([true, "true", "on", "1", 1, "aktif", "Aktif"]);
    active = truthy.has(active);

    if (prevSlug && prevSlug !== slug) {
      const q = `UPDATE forms
                   SET slug = $2, title = $3, schema = $4::jsonb, active = $5
                 WHERE slug = $1`;
      await pool.query(q, [prevSlug, slug, title, schemaJson, active]);
      return res.json({ ok: true, updated: true, slug });
    }

    const upsert = `
      INSERT INTO forms (slug, title, schema, active, created_at)
      VALUES ($1, $2, $3::jsonb, $4, NOW())
      ON CONFLICT (slug)
      DO UPDATE SET title  = EXCLUDED.title,
                    schema = EXCLUDED.schema,
                    active = EXCLUDED.active
      RETURNING slug
    `;
    const { rows } = await pool.query(upsert, [slug, title, schemaJson, active]);
    return res.json({ ok: true, saved: true, slug: rows[0]?.slug || slug });

  } catch (e) {
    console.error("admin/save error:", e);
    return res.status(500).json({ ok: false, error: e.message, detail: e.detail, code: e.code, hint: e.hint });
  }
});

// ---- Kök ("/"): host'a göre ana sayfa
app.get("/", (req, res) => {
  const host = getHost(req);
  const file = host.startsWith("anket.")
    ? path.join(__dirname, "public", "admin.html")
    : path.join(__dirname, "public", "index.html");
  res.sendFile(file);
});

// ---- Sunucu
app.listen(PORT, () => {
  console.log(`MikroAR form server listening on :${PORT}`);
});
