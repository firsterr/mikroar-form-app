// netlify/functions/responses.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
// Insert/duplicate kontrolü garanti olsun diye SERVICE ROLE kullanıyoruz
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE;

// Opsiyonel: admin export kullanıyorsan istersen ANON ile GET de yaparız
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

const dbWrite = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});
const dbRead = createClient(SUPABASE_URL, ANON_KEY || SERVICE_KEY, {
  auth: { persistSession: false }
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "POST") {
      return await handlePost(event);
    }
    if (event.httpMethod === "GET") {
      // (İsteğe bağlı) Admin export: ?slug=ASD&limit=100
      return await handleGet(event);
    }
    return { statusCode: 405, body: "Method Not Allowed" };
  } catch (err) {
    console.error("responses fn fatal:", err);
    return json(500, { ok: false, error: "Sunucu hatası" });
  }
};

// -------- POST: yeni cevap kaydı --------
async function handlePost(event) {
  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch {}

  const form_slug = body.form_slug || body.slug || null;
  const answers   = body.answers || null;
  const metaIn    = body.meta || {};
  if (!form_slug || !answers) {
    return json(400, { ok: false, error: "Eksik parametre" });
  }

  // IP yakala (Netlify)
  const ip =
    (event.headers["x-nf-client-connection-ip"] ||
      (event.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      event.headers["client-ip"] ||
      event.headers["x-real-ip"] ||
      "").toString();

  // Duplicate kontrol (aynı ip + slug)
  const { data: existed, error: selErr } = await dbRead
    .from("responses")
    .select("id")
    .eq("form_slug", form_slug)
    .eq("ip", ip)
    .limit(1);

  if (selErr) {
    console.error("dup check error:", selErr);
    // devam edelim; engellemeyi başaramazsak da insert deneriz
  } else if (existed && existed.length) {
    return json(409, { ok: false, code: "duplicate", error: "Bu anketi daha önce doldurmuşsunuz." });
  }

  // Kayıt
  const payload = {
    form_slug,
    ip,
    answers,                 // jsonb
    created_at: new Date().toISOString(),
    meta: {
      ua: metaIn.ua || event.headers["user-agent"] || "",
      href: metaIn.href || "",
      ts: metaIn.ts || new Date().toISOString()
    }
  };

  const { error: insErr } = await dbWrite.from("responses").insert([payload]);

  if (insErr) {
    console.error("responses insert error:", insErr);
    // Tekrar duplicate olabilir; PGRST116 değil, unique violation ise user-friendly mesaj döndür.
    if (String(insErr.message || "").toLowerCase().includes("duplicate") ||
        String(insErr.details || "").toLowerCase().includes("duplicate")) {
      return json(409, { ok: false, code: "duplicate", error: "Bu anketi daha önce doldurmuşsunuz." });
    }
    return json(500, { ok: false, error: "Yanıt kaydedilemedi." });
  }

  return json(200, { ok: true });
}

// -------- (opsiyonel) GET: export/list --------
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
    return json(500, { ok: false, error: "Liste alınamadı" });
  }

  return json(200, { ok: true, items: data || [] });
}

// -------- helpers --------
function json(code, obj) {
  return {
    statusCode: code,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(obj)
  };
}
