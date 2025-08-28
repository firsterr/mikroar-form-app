// server.js  —  MikroAR (ESM)

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import pkg from "pg";
const { Pool } = pkg;
import path from "path";
import { fileURLToPath } from "url";
import net from "node:net";

// ====== ENV
const {
  PORT = 3000,
  DATABASE_URL,
  CORS_ORIGIN = "*",
  ADMIN_USER = "admin",
  ADMIN_PASS = "admin",
  FRAME_ANCESTORS = "",        // iFrame’e izin verilecek origin’ler (virgüllü)
  DUPLICATE_POLICY = "BLOCK",  // BLOCK | UPDATE
} = process.env;

// ====== DB
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : undefined,
});

// ====== APP
const app = express();
app.set("trust proxy", true);

// küçük yardımcılar
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function getHost(req){
  return (req.headers["x-forwarded-host"] || req.hostname || req.headers.host || "")
    .toLowerCase();
}
function pickClientIp(req){
  const c = [
    req.headers["cf-connecting-ip"],
    req.headers["x-client-ip"],
    req.headers["x-real-ip"],
    req.headers["x-forwarded-for"],
    req.ip,
    req.socket?.remoteAddress,
  ].filter(Boolean);
  for (let raw of c){
    let ip = String(raw).split(",")[0].trim();
    ip = ip.replace(/^\[|\]$/g,"").replace(/:\d+$/,"");
    if (ip.startsWith("::ffff:")) ip = ip.slice(7);
    if (net.isIP(ip)) return ip;
  }
  return null;
}

// ====== SECURITY
const faList = FRAME_ANCESTORS
  ? FRAME_ANCESTORS.split(",").map(s=>s.trim()).filter(Boolean)
  : [];
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "frame-ancestors": faList.length ? faList : ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'"],
      "connect-src": ["'self'"],
      "img-src": ["'self'", "data:"],
    },
  },
  frameguard: false,
  crossOriginEmbedderPolicy: false,
}));

// ====== HEALTH (önce)
app.get("/health", (_req,res)=> res.status(200).send("ok"));

// ====== SUBDOMAIN GUARD (anket.* form sayfasını kapat, tamamı şifreli)
// form.* kökü ve results şifreli; /form.html ve /s/* herkese açık
function adminOnly(req,res,next){
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Basic ")){
    res.set("WWW-Authenticate",'Basic realm="MikroAR Admin"');
    return res.status(401).send("Yetkisiz");
  }
  const [u,p] = Buffer.from(hdr.split(" ")[1],"base64").toString().split(":");
  if (u !== ADMIN_USER || p !== ADMIN_PASS){
    res.set("WWW-Authenticate",'Basic realm="MikroAR Admin"');
    return res.status(401).send("Yetkisiz");
  }
  next();
}
app.use((req,res,next)=>{
  if (req.path === "/health") return next();
  const host = getHost(req);

  if (host.startsWith("anket.")){
    if (req.path.startsWith("/form.html")) return res.status(404).send("Not found");
    return adminOnly(req,res,next);
  }
  if (host.startsWith("form.")){
    const protectedPortal = req.method==="GET" && (req.path==="/" || req.path==="/index.html" || req.path==="/results.html");
    if (protectedPortal) return adminOnly(req,res,next);
  }
  next();
});

// ====== MIDDLEWARES
app.use(cors({
  origin: CORS_ORIGIN==="*" ? true : CORS_ORIGIN.split(",").map(s=>s.trim()),
  credentials: false,
}));
app.use(express.json({ limit:"1mb" }));
app.use(express.urlencoded({ extended:true }));
app.use(morgan("combined"));

// ========== API’ler
// Liste: sadece aktif formlar
app.get("/api/forms-list", async (_req,res)=>{
  try{
    const { rows } = await pool.query(
      `SELECT slug, title FROM forms WHERE active = TRUE ORDER BY created_at DESC`
    );
    res.json({ ok:true, rows });
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Tek form
app.get("/api/forms/:slug", async (req,res)=>{
  const { slug } = req.params;
  try{
    const { rows } = await pool.query(
      `SELECT slug, title, description, active, schema FROM forms WHERE slug=$1 LIMIT 1`,
      [slug]
    );
    if (!rows.length)  return res.status(404).json({ ok:false, error:"not_found" });
    if (rows[0].active === false) return res.status(403).json({ ok:false, error:"inactive" });

    const form = rows[0];
    try{ if (typeof form.schema === "string") form.schema = JSON.parse(form.schema); }catch{}
    res.json({ ok:true, form });
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Submit
app.post("/api/forms/:slug/submit", async (req,res)=>{
  const { slug } = req.params;
  const answersRaw = req.body?.answers ?? req.body;
  if (!answersRaw || typeof answersRaw!=="object"){
    return res.status(400).json({ ok:false, error:"invalid_payload" });
  }
  const clientIp = pickClientIp(req) || null;
  const answersJson = JSON.stringify(answersRaw);
  try{
    const f = await pool.query("SELECT slug, active FROM forms WHERE slug=$1",[slug]);
    if (!f.rows.length) return res.status(404).json({ ok:false, error:"Form bulunamadı" });
    if (!f.rows[0].active) return res.status(403).json({ ok:false, error:"Form pasif" });

    if (String(DUPLICATE_POLICY).toUpperCase()==="UPDATE"){
      const q = `
        INSERT INTO responses(form_slug, ip, answers, created_at)
        VALUES ($1,$2::inet,$3::jsonb,NOW())
        ON CONFLICT (form_slug, ip)
        DO UPDATE SET answers=EXCLUDED.answers, created_at=NOW()
        RETURNING created_at
      `;
      const { rows } = await pool.query(q,[slug, clientIp, answersJson]);
      return res.json({ ok:true, updated:true, at: rows[0]?.created_at });
    }

    try{
      const ins = `
        INSERT INTO responses(form_slug, ip, answers, created_at)
        VALUES ($1,$2::inet,$3::jsonb,NOW())
        RETURNING created_at
      `;
      const { rows } = await pool.query(ins,[slug, clientIp, answersJson]);
      return res.json({ ok:true, created:true, at: rows[0]?.created_at });
    }catch(err){
      if (err?.code==="23505"){
        const old = await pool.query(
          "SELECT created_at FROM responses WHERE form_slug=$1 AND ip=$2::inet",
          [slug, clientIp]
        );
        return res.json({ ok:true, alreadySubmitted:true, at: old.rows[0]?.created_at || null });
      }
      throw err;
    }
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Yanıtları (results) getir — admin
app.get("/api/admin/forms/:slug/responses", adminOnly, async (req,res)=>{
  const { slug } = req.params;
  try{
    const metaQ = await pool.query("SELECT title, description, schema, active FROM forms WHERE slug=$1",[slug]);
    if (!metaQ.rows.length) return res.status(404).json({ ok:false, error:"Form bulunamadı" });
    const meta = metaQ.rows[0];
    try{ if (typeof meta.schema==="string") meta.schema = JSON.parse(meta.schema); }catch{}

    const { rows } = await pool.query(
      `SELECT created_at, ip::text AS ip, answers
         FROM responses
        WHERE form_slug=$1
        ORDER BY created_at DESC`,
      [slug]
    );
    res.json({ ok:true, meta, rows });
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// Kısa link oluştur — admin
app.get("/admin/api/shortlink/new", adminOnly, async (req,res)=>{
  function makeCode(n=7){
    const s = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x=>s[x%s.length]).join("");
  }
  try{
    const slug = (req.query.slug||"").toString().trim().toLowerCase();
    if (!slug) return res.status(400).json({ ok:false, error:"slug gerekli" });
    const chk = await pool.query("SELECT 1 FROM forms WHERE slug=$1",[slug]);
    if (!chk.rows.length) return res.status(404).json({ ok:false, error:"form yok" });

    let code = (req.query.code||"").toString().trim() || makeCode(7);
    const dup = await pool.query("SELECT 1 FROM shortlinks WHERE code=$1",[code]);
    if (dup.rows.length) return res.status(409).json({ ok:false, error:"code kullanımda" });

    const days = req.query.days ? parseInt(req.query.days,10) : null;
    const max  = req.query.max  ? parseInt(req.query.max,10)  : null;
    let expires = null;
    if (days && days>0){ const d=new Date(); d.setDate(d.getDate()+days); expires=d.toISOString(); }

    await pool.query(
      "INSERT INTO shortlinks(code, slug, expires_at, max_visits) VALUES ($1,$2,$3,$4)",
      [code, slug, expires, (Number.isFinite(max)?max:null)]
    );
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    res.json({ ok:true, code, url:`https://${host}/s/${code}`, expires_at:expires, max_visits:max });
  }catch(e){ res.status(500).json({ ok:false, error:e.message }); }
});

// ====== SSR ROUTES (static’tan ÖNCE!)

// /form.html?slug=XYZ  — doğrudan formu render et
app.get("/form.html", async (req,res,next)=>{
  const slug = (req.query.slug||"").toString().trim().toLowerCase();
  if (!slug) return next(); // statik dosyaya düşsün

  try{
    const q = await pool.query(
      "SELECT slug, title, description, active, schema FROM forms WHERE slug=$1 LIMIT 1",
      [slug]
    );
    if (!q.rows.length || q.rows[0].active===false){
      return res.status(404).send("Form bulunamadı veya pasif.");
    }
    const form = q.rows[0];
    try{ if (typeof form.schema==="string") form.schema = JSON.parse(form.schema); }catch{}

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${(form.title||"Anket").replace(/</g,"&lt;")}</title>
<link rel="stylesheet" href="/form.css?v=gforms"/>
</head>
<body>
  <h1 id="title"></h1>
  <p id="form-desc" class="form-desc" style="display:none"></p>
  <form id="f"></form>
  <script>window.__FORM__ = ${JSON.stringify(form)};</script>
  <script src="/form.js?v=gforms2"></script>
</body>
</html>`;
    return res.status(200).send(html);
  }catch(e){
    console.error(e);
    return res.status(500).send("Sunucu hatası.");
  }
});

// /s/:code  — kısa linkten form (SSR)
import crypto from "node:crypto"; // kısa link generator için
app.get("/s/:code", async (req,res)=>{
  const code = (req.params.code||"").trim();
  if (!code) return res.status(404).send("Not found");
  try{
    const slr = await pool.query(
      "SELECT slug, expires_at, max_visits, COALESCE(visits,0) AS visits FROM shortlinks WHERE code=$1",
      [code]
    );
    if (!slr.rows.length) return res.status(404).send("Link bulunamadı");
    const sl = slr.rows[0];
    const now = new Date();
    if (sl.expires_at && new Date(sl.expires_at) < now) return res.status(410).send("Bu linkin süresi dolmuş.");
    if (sl.max_visits!=null && sl.visits>=sl.max_visits) return res.status(410).send("Bu linkin ziyaret limiti dolmuş.");

    const fr = await pool.query(
      "SELECT slug, title, description, active, schema FROM forms WHERE slug=$1 LIMIT 1",
      [sl.slug]
    );
    if (!fr.rows.length || fr.rows[0].active===false){
      return res.status(404).send("Form bulunamadı veya pasif.");
    }
    const form = fr.rows[0];
    try{ if (typeof form.schema==="string") form.schema = JSON.parse(form.schema); }catch{}

    // sayaç +1 (arkaplan)
    pool.query("UPDATE shortlinks SET visits = COALESCE(visits,0)+1 WHERE code=$1",[code]).catch(()=>{});

    const html = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${(form.title||"Anket").replace(/</g,"&lt;")}</title>
<link rel="stylesheet" href="/form.css?v=gforms"/>
</head>
<body>
  <h1 id="title"></h1>
  <p id="form-desc" class="form-desc" style="display:none"></p>
  <form id="f"></form>
  <script>window.__FORM__ = ${JSON.stringify(form)};</script>
  <script src="/form.js?v=gforms2"></script>
</body>
</html>`;
    return res.status(200).send(html);
  }catch(e){
    console.error(e);
    return res.status(500).send("Sunucu hatası.");
  }
});

// ====== STATIC (SSR’den SONRA!)
app.use(express.static(path.join(__dirname,"public"), { index:false }));

// ====== ROOT: host’a göre hangi sayfa?
app.get("/", (req,res)=>{
  const host = getHost(req);
  const file = host.startsWith("anket.")
    ? path.join(__dirname,"public","admin.html")
    : path.join(__dirname,"public","index.html"); // form.mikroar.com
  res.sendFile(file);
});

// ====== START
app.listen(PORT, ()=> {
  console.log("MikroAR server on :"+PORT);
});
