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

function makeCode(len = 7) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

// Basit HTML kaçışlayıcı (SSR'de description/title güvenli gömülsün)
const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[m]));

// ---- Env
const {
  PORT = 3000,
  DATABASE_URL,
  CORS_ORIGIN = "*",
  ADMIN_USER = "admin",
  ADMIN_PASS = "admin",
  FRAME_ANCESTORS = "",           // sadece burada TANIMLI
  DUPLICATE_POLICY = "BLOCK",      // BLOCK | UPDATE
} = process.env;

// ---- DB
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

// ---- App (ÖNCE app oluştur, sonra her şeyi buna ekle)
const app = express();
app.set("trust proxy", true); // Render arkasında doğru host/hostname için

// ---- yardımcılar
function getHost(req) {
  return (
    req.headers["x-forwarded-host"] || req.hostname || req.headers.host || ""
  ).toLowerCase();
}

// IPv4 ve IPv6 regex'leri
const IPv4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPv6_RE = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(::1)|(([0-9A-Fa-f]{1,4}:){1,7}:)|(:{2}([0-9A-Fa-f]{1,4}:){1,6}[0-9A-Fa-f]{1,4}))$/;

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();

  // IPv6-mapped IPv4: ::ffff:x.x.x.x -> x.x.x.x
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);

  // X-Forwarded-For gibi "ip, ip2, ip3" alınmışsa ilkini alalım
  if (ip.includes(",")) ip = ip.split(",")[0].trim();

  // Sonunda port varsa (IPv4: ":12345") ayıkla
  const withPort = ip.match(/^\[?([^\]]+)\]?:(\d+)$/);
  if (withPort) ip = withPort[1];

  if (IPv4_RE.test(ip) || IPv6_RE.test(ip)) return ip;
  return null;
}

// Proxy arkasında doğru IP'yi bul
function pickClientIp(req) {
  const chain = [
    req.headers["cf-connecting-ip"],
    req.headers["x-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-forwarded-for"], // 'a, b, c' olabilir -> ilkini alacağız
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);

  for (const raw of chain) {
    // 'a, b, c' durumunda ilkini al, IPv6 köşeli parantez ve portları temizle
    let first = String(raw).split(",")[0].trim();
    first = first.replace(/^\[|\]$/g, "");   // [2a01:...]:443 -> 2a01:...
    first = first.replace(/:\d+$/, "");      // 1.2.3.4:443 -> 1.2.3.4

    // IPv6-mapped IPv4 (::ffff:1.2.3.4) sadeleştir
    if (first.startsWith("::ffff:")) first = first.slice(7);

    if (net.isIP(first)) return first;       // 4 veya 6'yı kabul eder
  }
  return null;
}

// ---- Güvenlik (CSP açık)
const faList = FRAME_ANCESTORS
  ? FRAME_ANCESTORS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

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

// ---- Sağlık
app.get("/health", (_req, res) => {
  res.status(200).send("ok");
});

// __dirname eşdeğeri
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Subdomain bazlı Basic Auth + guard
app.use((req, res, next) => {
  const host = getHost(req);

  // Render health check her zaman açık
  if (req.path === "/health") return next();

  // anket.mikroar.com -> tüm sayfalar şifreli, ayrıca /form.html yasak
  if (host.startsWith("anket.")) {
    if (req.path.startsWith("/form.html")) {
      return res.status(404).send("Not found");
    }
    return adminOnly(req, res, next); // ADMIN_USER / ADMIN_PASS ile koru
  }

  // form.mikroar.com -> sadece portal sayfaları şifreli
  if (host.startsWith("form.")) {
    const isPortalPage =
      req.method === "GET" &&
      (req.path === "/" || req.path === "/index.html" || req.path === "/results.html");
    if (isPortalPage) return adminOnly(req, res, next);
  }

  next();
});

// ---- Middlewares
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

/* ------------------------------------------------------------------ */
/* SSR form: /form.html?slug=XYZ  —  description dahil                */
/* ------------------------------------------------------------------ */
app.get("/form.html", async (req, res, next) => {
  const slug = (req.query.slug || "").toString().trim().toLowerCase();
  if (!slug) return next(); // slug yoksa normal statik dosyaya düş

  try {
    const { rows } = await pool.query(
      "SELECT slug, title, description, active, schema FROM forms WHERE slug = $1 LIMIT 1",
      [slug]
    );
    if (!rows.length || rows[0].active === false) {
      return res.status(404).send("Form bulunamadı veya pasif.");
    }

    const form = rows[0];
    try {
      if (typeof form.schema === "string") form.schema = JSON.parse(form.schema);
    } catch (_) {}

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(form.title || "Anket")}</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;background:#f1f3f5}
  h1{margin:0 0 6px}
  .form-desc{margin:0 0 16px;color:#4b5563;font-size:15px}
  .q{margin:14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
  .q label{font-weight:600;display:block;margin-bottom:8px}
  .opt{display:block;margin:6px 0}
  button{padding:10px 14px;font-size:16px;border-radius:10px;border:1px solid #d1d5db;background:#111827;color:#fff}
  button:disabled{opacity:.5}
</style>
</head>
<body>
  <h1 id="form-title">${esc(form.title || "Anket")}</h1>
  <p id="form-desc" class="form-desc">${esc(form.description || "")}</p>

  <form id="f"></form>

  <script>window.__FORM__ = ${JSON.stringify(form)};</script>
  <script src="/form.js?v=desc-ssr2"></script>
</body>
</html>`;
    return res.status(200).send(html);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Sunucu hatası.");
  }
});

/* ------------------------------------------------------------------ */
/* /s/:code -> kısa linkten direkt anket SSR  —  description dahil     */
/* ------------------------------------------------------------------ */
app.get("/s/:code", async (req, res) => {
  const code = (req.params.code || "").trim();
  if (!code) return res.status(404).send("Not found");

  try {
    // kısa link bilgisi
    const { rows } = await pool.query(
      "SELECT slug, expires_at, max_visits, coalesce(visits,0) as visits FROM shortlinks WHERE code=$1",
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

    // formu getir
    const fr = await pool.query(
      "SELECT slug, title, description, active, schema FROM forms WHERE slug=$1 LIMIT 1",
      [sl.slug]
    );
    if (!fr.rows.length || fr.rows[0].active === false) {
      return res.status(404).send("Form bulunamadı veya pasif.");
    }

    const form = fr.rows[0];
    try { if (typeof form.schema === "string") form.schema = JSON.parse(form.schema); } catch {}

    // ziyaret sayısını arttır (arkaplanda)
    pool.query("UPDATE shortlinks SET visits = coalesce(visits,0) + 1 WHERE code=$1", [code])
        .catch(()=>{});

    // SSR HTML
    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(form.title || "Anket")}</title>
<style>
  body{font-family:system-ui,Arial,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;background:#f1f3f5}
  h1{margin:0 0 6px}
  .form-desc{margin:0 0 16px;color:#4b5563;font-size:15px}
  .q{margin:14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff}
  .q label{font-weight:600;display:block;margin-bottom:8px}
  .opt{display:block;margin:6px 0}
  button{padding:10px 14px;font-size:16px;border-radius:10px;border:1px solid #d1d5db;background:#111827;color:#fff}
  button:disabled{opacity:.5}
</style>
</head>
<body>
  <h1 id="form-title">${esc(form.title || "Anket")}</h1>
  <p id="form-desc" class="form-desc">${esc(form.description || "")}</p>

  <form id="f"></form>

  <script>window.__FORM__ = ${JSON.stringify(form)};</script>
  <script src="/form.js?v=short-desc2"></script>
</body>
</html>`;
    return res.status(200).send(html);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Sunucu hatası.");
  }
});

// ---- Statik
app.use(
  express.static(path.join(__dirname, "public"), {
    index: false, // otomatik index.html SERVİS ETME
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

// Basit ping – admin giriş kontrolü (XHR ile yoklama)
app.get("/api/admin/ping", adminOnly, (_req, res) => {
  res.json({ ok: true });
});

// --- Kısa link oluştur (admin)
// Örnek: https://form.mikroar.com/admin/api/shortlink/new?slug=chpakgecis
app.get("/admin/api/shortlink/new", adminOnly, async (req, res) => {
  try {
    const slug = (req.query.slug || "").toString().trim().toLowerCase();
    let code   = (req.query.code || "").toString().trim();
    const days = req.query.days ? parseInt(req.query.days, 10) : null;
    const max  = req.query.max  ? parseInt(req.query.max, 10)  : null;

    if (!slug) return res.status(400).json({ ok: false, error: "slug gerekli" });

    // form var mı?
    const f = await pool.query("SELECT 1 FROM forms WHERE slug=$1", [slug]);
    if (!f.rows.length) return res.status(404).json({ ok: false, error: "form yok" });

    // code üret / doğrula
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

// Basic Auth penceresini göstermek için sayfa gezintisi
// Giriş başarılı olunca 'next' URL'ine geri gönderir
app.get("/admin/gate", adminOnly, (req, res) => {
  const next = req.query.next || "/results.html";
  res.set("Cache-Control", "no-store");
  res.send(`<!doctype html><meta charset="utf-8">
<script>location.replace(${JSON.stringify(next)});</script>`);
});

// ---- LIST: aktif formlar
app.get("/api/forms-list", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT slug, title
         FROM forms
        WHERE active = TRUE
        ORDER BY created_at DESC`
    );
    res.json({ ok: true, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- GET: tek form (JSON API)
app.get("/api/forms/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, description, active, schema
         FROM forms
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, error: "not_found" });
    if (rows[0].active === false)
      return res.status(403).json({ ok: false, error: "inactive" });

    const form = rows[0];
    try {
      if (typeof form.schema === "string") form.schema = JSON.parse(form.schema);
    } catch (_) {}

    res.json({ ok: true, form });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Admin: form oluştur/güncelle (eski endpointi koruyoruz)
app.post("/admin/api/forms", adminOnly, async (req, res) => {
  try {
    let { slug, title, description = null, active = true, schema, questions } = req.body || {};
    if (!slug || !title) {
      return res.status(400).json({ ok: false, error: "slug ve title gerekli" });
    }
    if (!schema && Array.isArray(questions)) schema = { questions };
    if (!schema || !Array.isArray(schema.questions)) schema = { questions: [] };

    await pool.query(
      `INSERT INTO forms (slug, title, description, active, schema)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (slug) DO UPDATE
       SET title = EXCLUDED.title,
           description = EXCLUDED.description,
           active = EXCLUDED.active,
           schema = EXCLUDED.schema`,
      [slug, title, description, active, schema]
    );

    res.json({ ok: true });
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

  const clientIp = pickClientIp(req) || null; // inet sütunu NULL kabul ediyor

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
    if (!formRows.length) {
      return res.status(404).json({ ok: false, error: "Form bulunamadı" });
    }

    // şema her durumda obje olsun
    const meta = formRows[0];
    try {
      if (typeof meta.schema === "string") meta.schema = JSON.parse(meta.schema);
    } catch (_) {}

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

// ---- ADMIN: form CREATE/UPDATE (yeni endpoint)
app.post("/api/admin/forms/save", adminOnly, async (req, res) => {
  try {
    // body: { slug, title, schema, active, prevSlug? }
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
    const schemaJson = JSON.stringify(schema); // ::jsonb için

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
    return res.status(500).json({
      ok: false,
      error: e.message,
      detail: e.detail,
      code: e.code,
      hint: e.hint
    });
  }
});

// ---- Kök ("/"): host'a göre ana sayfa
app.get("/", (req, res) => {
  const host = getHost(req);
  const file = host.startsWith("anket.")
    ? path.join(__dirname, "public", "admin.html")   // anket.mikroar.com
    : path.join(__dirname, "public", "index.html");  // form.mikroar.com
  res.sendFile(file);
});

// ---- Sunucu
app.listen(PORT, () => {
  console.log(`MikroAR form server listening on :${PORT}`);
});
