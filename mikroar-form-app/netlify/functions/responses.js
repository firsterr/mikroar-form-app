// netlify/functions/responses.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE; // yazma/insert için
const ANON_KEY      = process.env.SUPABASE_ANON_KEY;      // okuma için (ops.)

const dbWrite = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const dbRead  = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, { auth: { persistSession: false } });

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "POST") return await handlePost(event);
    if (event.httpMethod === "GET")  return await handleGet(event); // opsiyonel export
    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    console.error("responses fn fatal:", err);
    return json(500, { ok: false, error: "Sunucu hatası", details: String(err?.message || err) });
  }
};

/* ---------------- POST: kayıt ---------------- */
async function handlePost(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const form_slug = body.form_slug || body.slug || null;
  const answers   = body.answers || null;
  const metaIn    = body.meta || {};
  if (!form_slug || !answers) {
    return json(400, { ok: false, error: "Eksik parametre" });
  }

  // IP güvenli şekilde çıkar + doğrula; yoksa null bırak
  const ip = pickClientIp(event.headers);
  const payload = {
    form_slug,
    answers, // jsonb
    created_at: new Date().toISOString(),
    meta: {
      ua: metaIn.ua || event.headers["user-agent"] || "",
      href: metaIn.href || "",
      ts: metaIn.ts || new Date().toISOString()
    }
  };
  if (ip) payload.ip = ip; // inet kolonu boş string alamaz; sadece geçerliyse koy

  // Duplicate kontrolünü sadece IP varsa yap (IP yoksa engellemeyelim)
  if (ip) {
    const { data: existed, error: selErr } = await dbRead
      .from("responses")
      .select("id")
      .eq("form_slug", form_slug)
      .eq("ip", ip)
      .limit(1);

    if (selErr) console.error("dup check error:", selErr);
    else if (existed && existed.length) {
      return json(409, { ok: false, code: "duplicate", error: "Bu anketi daha önce doldurmuşsunuz." });
    }
  }

  const { error: insErr } = await dbWrite.from("responses").insert([payload]);
  if (insErr) {
    console.error("responses insert error:", insErr);
    const msg = (insErr.message || insErr.details || "").toLowerCase();
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return json(409, { ok: false, code: "duplicate", error: "Bu anketi daha önce doldurmuşsunuz." });
    }
    // Geçici: tanı koyabilelim diye detay döndürüyoruz
    return json(500, { ok: false, error: "Yanıt kaydedilemedi.", details: insErr.message || insErr });
  }

  return json(200, { ok: true });
}

/* ---------------- (opsiyonel) GET: export ---------------- */
async function handleGet(event) {
  const qp = event.queryStringParameters || {};
  const slug = (qp.slug || "").trim();
  const limit = Math.min(parseInt(qp.limit || "100", 10) || 100, 500);
  if (!slug) return json(400, { ok: false, error: "slug gerekli" });

  const { data, error } = await dbRead
    .from("responses")
    .select("created_at, ip, answers")
    .eq("form_slug", slug)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("responses get error:", error);
    return json(500, { ok: false, error: "Liste alınamadı", details: error.message || error });
  }
  return json(200, { ok: true, items: data || [] });
}

/* ---------------- helpers ---------------- */
function json(code, obj) {
  return {
    statusCode: code,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj)
  };
}

function pickClientIp(headers = {}) {
  // header anahtarlarını küçük harfe indir
  const h = {};
  for (const k in headers) h[k.toLowerCase()] = headers[k];

  let candidate =
    h["x-nf-client-connection-ip"] ||
    (h["x-forwarded-for"] || "").split(",")[0].trim() ||
    h["client-ip"] ||
    h["x-real-ip"] ||
    "";

  candidate = String(candidate || "").trim();
  if (!candidate) return null;

  // basit IPv4/IPv6 doğrulaması
  const ipv4 = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  if (ipv4.test(candidate) || ipv6.test(candidate)) return candidate;

  return null; // geçersizse null dön
}
