import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import basicAuth from "express-basic-auth";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const AUTH_USER = process.env.ADMIN_USER || "admin";
const AUTH_PASS = process.env.ADMIN_PASS || "password";

app.use(
  "/admin",
  basicAuth({
    users: { [AUTH_USER]: AUTH_PASS },
    challenge: true,
  })
);

// Anasayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Teşekkür sayfası
app.get("/thanks", (req, res) => {
  res.sendFile(path.join(__dirname, "public/thanks.html"));
});

// Form kaydetme
app.post("/submit", async (req, res) => {
  const { form_slug, responses } = req.body;
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // IP bazlı kontrol
  const checkResp = await fetch(`${SUPABASE_URL}/rest/v1/responses?form_slug=eq.${form_slug}&ip=eq.${ip}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  const existing = await checkResp.json();
  if (existing.length > 0) {
    return res.status(409).json({ ok: false, message: "Bu formu zaten doldurdunuz." });
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      form_slug,
      responses,
      ip
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Supabase error:", errText);
    return res.status(500).json({ ok: false });
  }

  res.json({ ok: true });
});

// Form detayını çek (anket soruları)
app.get("/api/forms/:slug", async (req, res) => {
  const slug = req.params.slug;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/forms?slug=eq.${slug}&select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  const data = await response.json();
  if (data.length === 0) {
    return res.status(404).json({ ok: false, message: "Form bulunamadı" });
  }
  res.json({ ok: true, form: data[0] });
});

// Admin - form listeleme
app.get("/admin/api/forms", async (req, res) => {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/forms?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`
    }
  });
  const data = await response.json();
  res.json({ ok: true, forms: data });
});

// Admin - form oluşturma/güncelleme
app.post("/admin/api/forms", async (req, res) => {
  const { slug, title, schema, active } = req.body;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/forms`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      slug,
      title,
      schema,
      active
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Supabase error:", errText);
    return res.status(500).json({ ok: false });
  }

  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server çalışıyor: ${PORT}`);
});
