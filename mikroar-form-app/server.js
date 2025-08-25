// server.js  —  ESM (import) ile yazıldı
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
  FRAME_ANCESTORS = "",
  DUPLICATE_POLICY = "BLOCK", // BLOCK | UPDATE
} = process.env;

// ---- DB
const pool = new Pool({
  connectionString: DATABASE_URL,
  // Supabase / Render vb. için sertifika gevşetme gerekebiliyor:
  ssl: DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

// ---- App
const app = express();
app.set("trust proxy", true); // IP’yi doğru alabilmek için

// IP seçim (Cloudflare/Proxy zincirinden güvenli al)
function pickClientIp(req) {
  const chain = [
    req.headers["cf-connecting-ip"],
    req.headers["x-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-forwarded-for"], // a, b, c olabilir
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);

  // IPv4 + sık görülen IPv6 formu
  const ipRE =
    /(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:(?!$)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d))|(?:[A-F0-9]{1,4}:){1,7}[A-F0-9]{1,4}/i;

  for (const v of chain) {
    const first = String(v).split(",")[0].trim().replace(/:\d+$/, "");
    const m = first.match(ipRE);
    if (m) return m[0];
  }
  return null;
}

// ---- Güvenlik (iframe izinleri + X-Frame kapatmasın diye frameguard false)
const faList = FRAME_ANCESTORS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "frame-ancestors": faList.length ? faList : ["'self'"],
      },
    },
    frameguard: false,
    crossOriginEmbedderPolicy: false,
  })
);

// ---- Middlewares
app.use(
  cors({
    origin:
      CORS_ORIGIN === "*"
        ? true
        : CORS_ORIGIN.split(",").map((s) => s.trim()),
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
  const [u, p] = Buffer.from(hdr.split(" ")[1], "base64")
    .toString()
    .split(":");
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

// ---- LIST: aktif formlar (index / form seçimi için)
app.get("/api/forms", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT slug, title FROM forms WHERE active = TRUE ORDER BY created_at DESC"
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
      "SELECT slug, title, active, schema FROM forms WHERE slug = $1",
      [slug]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "Form bulunamadı" });
    }
    if (rows[0].active === false) {
      return res.status(403).json({ ok: false, error: "Form pasif" });
    }
    res.json({ ok: true, form: rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---- SUBMIT: yanıt kaydı (duplikeleri politika ile yönet)
app.post("/api/forms/:slug/submit", async (req, res) => {
  const { slug } = req.params;
  const answers = req.body?.answers || req.body; // ön yüzde iki farklı gönderim olabilir
  const ip = pickClientIp(req) || "0.0.0.0";

  try {
    // form aktif mi
    const f = await pool.query(
      "SELECT slug, active FROM forms WHERE slug = $1",
      [slug]
    );
    if (!f.rows.length) {
      return res.status(404).json({ ok: false, error: "Form bulunamadı" });
    }
    if (!f.rows[0].active) {
      return res.status(403).json({ ok: false, error: "Form pasif" });
    }

    if (String(DUPLICATE_POLICY).toUpperCase() === "UPDATE") {
      // idempotent upsert: ikinci gelişte güncelle
      const q =
        "INSERT INTO responses(form_slug, ip, answers, created_at) VALUES ($1,$2,$3,now()) " +
        "ON CONFLICT (form_slug, ip) DO UPDATE SET answers = EXCLUDED.answers, created_at = now() " +
        "RETURNING id, created_at";
      const { rows } = await pool.query(q, [slug, ip, answers]);
      return res.json({ ok: true, updated: true, at: rows[0]?.created_at });
    }

    // BLOCK (varsayılan): ikinci gelişte 200 + alreadySubmitted:true
    try {
      const q =
        "INSERT INTO responses(form_slug, ip, answers, created_at) VALUES ($1,$2,$3, now()) RETURNING id, created_at";
      const { rows } = await pool.query(q, [slug, ip, answers]);
      return res.json({ ok: true, created: true, at: rows[0]?.created_at });
    } catch (err) {
      // unique violation (23505) => zaten var
      if (err?.code === "23505") {
        const old = await pool.query(
          "SELECT created_at FROM responses WHERE form_slug = $1 AND ip = $2",
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

// ---- RESULTS (admin) — results.html bunu çağırıyor
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

// ---- Start
app.listen(PORT, () => {
  console.log(`MikroAR form server listening on :${PORT}`);
});
