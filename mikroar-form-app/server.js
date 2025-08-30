// server.js — ESM

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

// ---- Utils
function makeCode(len = 7) {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const buf = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// ---- Helpers
function getHost(req) {
  return (
    req.headers["x-forwarded-host"] || req.hostname || req.headers.host || ""
  ).toLowerCase();
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

// ---- Admin basic auth
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

// ---- Security
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
        "style-src": ["'self'", "'unsafe-inline'"], // harici + inline css
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ---- Health (Render kontrolü için çok hızlı!)
app.get("/health", (_req, res) => res.status(200).send("ok"));

// ---- Subdomain guard
app.use((req, res, next) => {
  const host = getHost(req);
  if (req.path === "/health") return next();

  // anket.* → tüm sayfalar şifreli, ayrıca /form.html engelli
  if (host.startsWith("anket.")) {
    if (req.path.startsWith("/form.html")) {
      return res.status(404).send("Not found");
    }
    return adminOnly(req, res, next);
  }

  // form.* → sadece portal sayfaları şifreli
  if (host.startsWith("form.")) {
    const isPortal =
      req.method === "GET" &&
      (req.path === "/" || req.path === "/index.html" || req.path === "/results.html");
    if (isPortal) return adminOnly(req, res, next);
  }
  next();
});

// ---- Common middlewares
app.use(
  cors({
    origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN.split(",").map((s) => s.trim()),
    credentials: false,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan("combined"));

// ----------------------------------------------------------------------------
//                                  API’LER
// ----------------------------------------------------------------------------

// Admin ping
app.get("/api/admin/ping", adminOnly, (_req, res) => res.json({ ok: true }));

// Form listesi (aktif)
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

// Tek form
app.get("/api/forms/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows } = await pool.query(
      `SELECT slug, title, description, active, schema
         FROM forms
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "not_found" });
    if (rows[0].active === false)
      return res.status(403).json({ ok: false, error: "inactive" });

    const form = rows[0];
    try {
      if (typeof form.schema === "string") form.schema = JSON.parse(form.schema);
    } catch {}
    res.json({ ok: true, form });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Admin: form create/update (TEK rota)
app.post("/admin/api/forms", adminOnly, async (req, res) => {
  try {
    let { slug, title, description = null, active = true, schema, questions } =
      req.body || {};

    if (!slug || !title) {
      return res.status(400).json({ ok: false, error: "slug ve title gerekli" });
    }
    if (!schema && Array.isArray(questions)) schema = { questions };
    if (!schema || !Array.isArray(schema.questions)) schema = { questions: [] };

    // upsert
    await pool.query(
      `INSERT INTO forms (slug, title, description, active, schema, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (slug) DO UPDATE
         SET title = EXCLUDED.title,
             description = EXCLUDED.description,
             active = EXCLUDED.active,
             schema = EXCLUDED.schema`,
      [slug.trim().toLowerCase(), title, description, !!active, schema]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Cevap gönderimi
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
        RETURNING id, created_at`;
      const { rows } = await pool.query(upsertSql, [slug, clientIp, answersJson]);
      return res.json({ ok: true, updated: true, at: rows[0]?.created_at });
    }

    try {
      const insertSql = `
        INSERT INTO responses (form_slug, ip, answers, created_at)
        VALUES ($1, $2::inet, $3::jsonb, NOW())
        RETURNING id, created_at`;
      const { rows } = await pool.query(insertSql, [slug, clientIp, answersJson]);
      return res.json({ ok: true, created: true, at: rows[0]?.created_at });
    } catch (err) {
      if (err?.code === "23505") {
        const old = await pool.query(
          "SELECT created_at FROM responses WHERE form_slug = $1 AND ip = $2::inet",
          [slug, clientIp]
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

// Sonuçlar
app.get("/api/admin/forms/:slug/responses", adminOnly, async (req, res) => {
  try {
    const { slug } = req.params;
    const { rows: formRows } = await pool.query(
      "SELECT title, schema, active FROM forms WHERE slug = $1",
      [slug]
    );
    if (!formRows.length)
      return res.status(404).json({ ok: false, error: "Form bulunamadı" });

    const meta = formRows[0];
    try {
      if (typeof meta.schema === "string") meta.schema = JSON.parse(meta.schema);
    } catch {}

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

// ----------------------------------------------------------------------------
//                                  SSR
// ----------------------------------------------------------------------------

function ssrHtml(form) {
  const safeTitle = (form.title || "Anket").replace(/</g, "&lt;");
  const cssLink = `<link rel="stylesheet" href="/form.css?v=2">`;
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
${cssLink}
</head>
<body>
  <h1 id="form-title"></h1>
  <p id="form-desc" class="form-desc" style="display:none"></p>
  <form id="f"></form>
  <script>window.__FORM__ = ${JSON.stringify(form)};</script>
  <script src="/form.js?v=ssr2"></script>
</body>
</html>`;
}

// /form.html?slug=...
app.get("/form.html", async (req, res, next) => {
  const slug = (req.query.slug || "").toString().trim().toLowerCase();
  if (!slug) return next();
  try {
    const { rows } = await pool.query(
      "SELECT slug, title, description, active, schema FROM forms WHERE slug=$1 LIMIT 1",
      [slug]
    );
    if (!rows.length || rows[0].active === false) {
      return res.status(404).send("Form bulunamadı veya pasif.");
    }
    const form = rows[0];
    try {
      if (typeof form.schema === "string") form.schema = JSON.parse(form.schema);
    } catch {}
    return res.status(200).send(ssrHtml(form));
  } catch (e) {
    return res.status(500).send("Sunucu hatası.");
  }
});

// /s/:code kısa link
app.get("/s/:code", async (req, res) => {
  const code = (req.params.code || "").trim();
  if (!code) return res.status(404).send("Not found");
  try {
    const { rows } = await pool.query(
      "SELECT slug, expires_at, max_visits, coalesce(visits,0) AS visits FROM shortlinks WHERE code=$1",
      [code]
    );
    if (!rows.length) return res.status(404).send("Link bulunamadı");

    const sl = rows[0];
    const now = new Date();
    if (sl.expires_at && new Date(sl.expires_at) < now)
      return res.status(410).send("Bu linkin süresi dolmuş.");
    if (sl.max_visits != null && sl.visits >= sl.max_visits)
      return res.status(410).send("Bu linkin ziyaret limiti dolmuş.");

    const fr = await pool.query(
      "SELECT slug, title, description, active, schema FROM forms WHERE slug=$1 LIMIT 1",
      [sl.slug]
    );
    if (!fr.rows.length || fr.rows[0].active === false)
      return res.status(404).send("Form bulunamadı veya pasif.");

    const form = fr.rows[0];
    try {
      if (typeof form.schema === "string") form.schema = JSON.parse(form.schema);
    } catch {}

    // ziyaret sayısını artır (arkaplan)
    pool.query("UPDATE shortlinks SET visits = coalesce(visits,0)+1 WHERE code=$1", [code]).catch(() => {});

    return res.status(200).send(ssrHtml(form));
  } catch (e) {
    return res.status(500).send("Sunucu hatası.");
  }
});

// ----------------------------------------------------------------------------
//                     STATİK SERVİS — EN SONA KOYDUK
// ----------------------------------------------------------------------------
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// Kök: host'a göre admin/index
app.get("/", (req, res) => {
  const host = getHost(req);
  const file = host.startsWith("anket.")
    ? path.join(__dirname, "public", "admin.html")
    : path.join(__dirname, "public", "index.html");
  res.sendFile(file);
});

// ---- Start
app.listen(PORT, () => {
  console.log(`MikroAR form server listening on :${PORT}`);
});
