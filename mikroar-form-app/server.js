// server.js  —  FULL REPLACE

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

// -------------------- infra --------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// -------------------- supabase --------------------
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const supabaseKey = SUPABASE_SERVICE_ROLE || SUPABASE_ANON_KEY || "";
const supabase =
  SUPABASE_URL && supabaseKey
    ? createClient(SUPABASE_URL, supabaseKey, { auth: { persistSession: false } })
    : null;

// Tek noktadan form çekme
async function getFormBySlug(slug) {
  if (!slug) return null;

  // Öncelik: Supabase doğrudan okuma
  if (supabase) {
    const { data, error } = await supabase
      .from("forms")
      .select("id, slug, title, description, schema")
      .eq("slug", slug)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("Supabase error:", error.message);
    }
    if (data) return normalizeForm(data);
  }

  // Alternatif: varsa mevcut backend’in JSON endpoint’i
  try {
    const base = process.env.PUBLIC_BASE_URL || ""; // örn: https://form.mikroar.com
    if (base) {
      const r = await fetch(`${base}/api/forms?slug=${encodeURIComponent(slug)}`, {
        headers: { "accept": "application/json" },
      });
      if (r.ok) {
        const j = await r.json();
        if (j && j.form) return normalizeForm(j.form);
      }
    }
  } catch (e) {
    console.error("Fallback fetch error:", e.message);
  }

  return null;
}

function normalizeForm(raw) {
  // schema string ya da json olabilir
  let schema = raw.schema;
  if (typeof schema === "string") {
    try { schema = JSON.parse(schema); } catch { schema = {}; }
  }
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title || "Anket",
    description: raw.description || "",
    schema: schema || {},
  };
}

// -------------------- SSR renderer --------------------
function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderOption(name, opt, type = "radio") {
  const val = escapeHtml(String(opt));
  const id = `f_${name}_${val.replace(/\W+/g, "_")}`;
  return `
    <label class="opt" for="${id}">
      <input type="${type}" id="${id}" name="${escapeHtml(name)}" value="${val}">
      <span>${val}</span>
    </label>
  `;
}

function renderQuestion(q) {
  const type = (q.type || "text").toLowerCase();
  const name = q.name || q.label || "q";
  const label = escapeHtml(q.label || "");
  const required = q.required ? " required" : "";
  const desc = q.description ? `<div class="muted">${escapeHtml(q.description)}</div>` : "";
  const ph = q.placeholder ? ` placeholder="${escapeHtml(q.placeholder)}"` : "";
  const opt = Array.isArray(q.options) ? q.options : [];

  let inner = "";

  if (type === "radio" || type === "checkbox") {
    const group = opt.map(o => renderOption(name, o, type)).join("");
    inner = `<div class="options">${group}</div>`;
  } else if (type === "select") {
    const options = opt.length
      ? opt.map(v => `<option value="${escapeHtml(String(v))}">${escapeHtml(String(v))}</option>`).join("")
      : "";
    inner = `
      <div class="options">
        <div class="opt">
          <select id="f_${escapeHtml(name)}" name="${escapeHtml(name)}"${required}>
            <option value="" disabled selected>Seçiniz</option>
            ${options}
          </select>
        </div>
      </div>`;
  } else if (type === "textarea") {
    inner = `<textarea id="f_${escapeHtml(name)}" name="${escapeHtml(name)}"${required}${ph}></textarea>`;
  } else {
    const itype = type === "email" ? "email" : type === "number" ? "number" : "text";
    inner = `<input type="${itype}" id="f_${escapeHtml(name)}" name="${escapeHtml(name)}"${required}${ph}/>`;
  }

  return `
    <div class="row">
      <div class="q-title">
        <label for="f_${escapeHtml(name)}">${label}</label>
        ${q.required ? `<span class="req">*</span>` : ""}
      </div>
      ${desc}
      ${inner}
    </div>
  `;
}

function renderFormBody(form) {
  const schema = form.schema || {};
  const questions = Array.isArray(schema?.questions) ? schema.questions : [];
  const rows = questions.map(renderQuestion).join("");

  return `
    <h1 id="title">${escapeHtml(form.title || "Anket")}</h1>
    ${form.description ? `<p id="desc" class="form-desc">${escapeHtml(form.description)}</p>` : `<p id="desc" class="form-desc" style="display:none"></p>`}
    <form id="form" data-ssr="1" novalidate>
      ${rows}
      <div class="actions">
        <button type="submit" id="btnSend">Gönder</button>
      </div>
      <p id="alertBottom" class="note center" style="display:none"></p>
      <p class="after center">Bu form <strong>mikroar.com</strong> alanında oluşturuldu.</p>
      <p class="brand">mikroAR</p>
    </form>
  `;
}

function ssrHtml(form) {
  const safeTitle = (form.title || "Anket").replace(/</g, "&lt;");
  // app.js (veya form.js) tarafında SSR olduğunu anlaması için window.__FORM basıyoruz
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${safeTitle}</title>
<link rel="preload" href="/form.css" as="style" fetchpriority="high">
<link rel="stylesheet" href="/form.css?v=3" />
</head>
<body>
  <div id="app">
    ${renderFormBody(form)}
  </div>
  <script>window.__FORM = ${JSON.stringify(form)};</script>
  <script>
    // SSR BYPASS: Frontend skeleton/fetch akışını tamamen kapat
    window.SSR_READY = true;
  </script>
  <script src="/app.js" defer></script>
</body>
</html>`;
}

// -------------------- routes --------------------

// Health
app.get("/health", (_req, res) => {
  res.type("text/plain").send("ok");
});

// SSR: /form.html?slug=...
app.get("/form.html", async (req, res, next) => {
  try {
    const slug = String(req.query.slug || "").trim();
    if (!slug) return res.status(400).send("slug gerekli");

    const form = await getFormBySlug(slug);
    if (!form) return res.status(404).send("Form bulunamadı");

    res.status(200).type("html").send(ssrHtml(form));
  } catch (e) {
    next(e);
  }
});

// İsteğe bağlı: JSON API (mevcut entegrasyonları bozmaz)
app.get("/api/forms", async (req, res) => {
  const slug = String(req.query.slug || "").trim();
  if (!slug) return res.status(400).json({ error: "slug gerekli" });

  const form = await getFormBySlug(slug);
  if (!form) return res.status(404).json({ error: "Form bulunamadı" });

  res.json({ form });
});

// -------------------- static (ROUTES'TAN SONRA!) --------------------
app.use(express.static(path.join(__dirname, "public"), { index: false, immutable: true, maxAge: "1y" }));

// -------------------- start --------------------
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).type("text/plain").send("Internal Server Error");
});

app.listen(PORT, () => {
  console.log(`Server started on :${PORT}`);
});
