// server.js  —  ESM
import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import pkg from "pg";
const { Pool } = pkg;
import path from "path";
import { fileURLToPath } from "url";

// __dirname eşdeğeri
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Env
const {
  PORT = 3000,
  DATABASE_URL,
  CORS_ORIGIN = "*",
  ADMIN_USER = "admin",
  ADMIN_PASS = "admin",
  FRAME_ANCESTORS = "",           // <— sadece burada TANIMLI
  DUPLICATE_POLICY = "BLOCK",      // BLOCK | UPDATE
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
app.set("trust proxy", 2);

// IPv4 ve IPv6 regex'leri
const IPv4_RE = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPv6_RE = /^(([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}|(::1)|(([0-9A-Fa-f]{1,4}:){1,7}:)|(:{2}([0-9A-Fa-f]{1,4}:){1,6}[0-9A-Fa-f]{1,4}))$/;

function normalizeIp(raw) {
  if (!raw) return null;
  let ip = String(raw).trim();

  // IPv6-mapped IPv4: ::ffff:x.x.x.x -> x.x.x.x
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);

  // X-Forwarded-For gibi "ip, ip2, ip3" alınmışsa ilkini alalım
  if (ip.includes(',')) ip = ip.split(',')[0].trim();

  // Sonunda port varsa (IPv4: ":12345") ayıkla
  const withPort = ip.match(/^\[?([^\]]+)\]?:(\d+)$/);
  if (withPort) ip = withPort[1];

  if (IPv4_RE.test(ip) || IPv6_RE.test(ip)) return ip;
  return null;
}

function pickClientIp(req) {
  const h = (k) => req.headers[k] ? String(req.headers[k]) : '';
  const chain = [
    h('cf-connecting-ip'),
    h('x-client-ip'),
    h('x-real-ip'),
    h('x-forwarded-for'),
    req.ip,
    req.socket?.remoteAddress
  ].filter(Boolean);

  for (const v of chain) {
    const ip = normalizeIp(v);
    if (ip) return ip;
  }
  return null; // 0.0.0.0 yazmak yerine null döndür
}

// İstemci IP'si
function pickClientIp(req) {
  const chain = [
    req.headers["cf-connecting-ip"],
    req.headers["x-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-forwarded-for"],
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);

  const ipRE =
    /(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:(?!$)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d))|(?:[A-F0-9]{1,4}:){1,7}[A-F0-9]{1,4}/i;

  for (const v of chain) {
    const first = String(v).split(",")[0].trim().replace(/:\d+$/, "");
    const m = first.match(ipRE);
    if (m) return m[0];
  }
  return null;
}

// ---- Güvenlik (CSP açık)
const faList = FRAME_ANCESTORS
  ? FRAME_ANCESTORS.split(",").map(s => s.trim()).filter(Boolean)
  : [];

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        // form sayfasını başka domain içine gömmek istiyorsanız env'den verin (örn: https://site.com)
        "frame-ancestors": faList.length ? faList : ["'self'"],
        // inline script ve aynı origin XHR/fetch için:
        "script-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'"], // API çağrıları aynı origin
        "img-src": ["'self'", "data:"],
        "style-src": ["'self'", "'unsafe-inline'"],
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);

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

// ---- Statik
app.use(express.static(path.join(__dirname, "public")));

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

// ---- Sağlık
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
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

// ---- GET: tek form
app.get("/api/forms/:slug", async (req, res) => {
  const { slug } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT slug, title, active, schema
         FROM forms
        WHERE slug = $1
        LIMIT 1`,
      [slug]
    );
    if (!rows.length)
      return res.status(404).json({ ok: false, error: "not_found" });
    if (rows[0].active === false)
      return res.status(403).json({ ok: false, error: "inactive" });

    // <-- ÖNEMLİ: schema text olarak gelirse parse et
    const form = rows[0];
    try {
      if (typeof form.schema === "string") form.schema = JSON.parse(form.schema);
    } catch (_) {
      /* yut, zaten obje ise devam */
    }

    res.json({ ok: true, form });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- SUBMIT (güncel)
app.post("/api/forms/:slug/submit", async (req, res) => {
  const { slug } = req.params;

  // answers body’de plain objeyse JSONB'ye dönüşecek
  const answersRaw = req.body?.answers ?? req.body;
  if (!answersRaw || typeof answersRaw !== "object") {
    return res.status(400).json({ ok: false, error: "invalid_payload" });
  }
  const answersJson = JSON.stringify(answersRaw);

  // IP: bulunamazsa 0.0.0.0 yerine NULL gönderiyoruz
  const clientIp = pickClientIp(req) || null;

  try {
    const f = await pool.query(
      "SELECT slug, active FROM forms WHERE slug = $1",
      [slug]
    );
    if (!f.rows.length) return res.status(404).json({ ok: false, error: "Form bulunamadı" });
    if (!f.rows[0].active) return res.status(403).json({ ok: false, error: "Form pasif" });

    // UPDATE politikası (upsert)
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

    // INSERT + unique ihlali yakalama
    try {
      const insertSql = `
        INSERT INTO responses (form_slug, ip, answers, created_at)
        VALUES ($1, $2::inet, $3::jsonb, NOW())
        RETURNING id, created_at
      `;
      const { rows } = await pool.query(insertSql, [slug, clientIp, answersJson]);
      return res.json({ ok: true, created: true, at: rows[0]?.created_at });
    } catch (err) {
      // unique ihlal: uniq_response_per_ip_per_form
      if (err?.code === "23505") {
        const old = await pool.query(
          "SELECT created_at FROM responses WHERE form_slug = $1 AND ip = $2::inet",
          [slug, clientIp]
        );
        return res.json({
          ok: true,
          alreadySubmitted: true,
          at: old.rows[0]?.created_at || null
        });
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
    const { rows } = await pool.query(
      `SELECT created_at, ip::text AS ip, answers
         FROM responses
        WHERE form_slug = $1
        ORDER BY created_at DESC`,
      [slug]
    );
    res.json({ ok: true, meta: formRows[0], rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- Kök: index.html
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`MikroAR form server listening on :${PORT}`);
});
