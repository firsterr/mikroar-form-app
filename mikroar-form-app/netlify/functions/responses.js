// Netlify Function: /.netlify/functions/responses  (redirect: /api/responses)
// Tablonun gerçek kolonlarına göre INSERT: form_slug, answers, (ip), meta

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SUPABASE_URL = process.env.SUPABASE_URL;
// Yazma için Service Role tercih; yoksa ANON (RLS'a takılabilir)
const KEY =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers: { ...CORS, Allow: "POST, OPTIONS" }, body: "Method Not Allowed" };
    }
    if (!SUPABASE_URL || !KEY) {
      return resp(500, { ok: false, error: "supabase-env-missing" });
    }

    // ---- Body
    let body = {};
    try { body = JSON.parse(event.body || "{}"); }
    catch { return resp(400, { ok:false, error:"invalid-json" }); }

    // UI şu alanları gönderiyor: { form_id?, slug?, answers, meta? }
    // DB'de kolon: form_slug, answers, ip, meta
    const form_slug = (body.form_slug || body.slug || "").trim();
    const answers   = (body.answers && typeof body.answers === "object") ? body.answers : null;
    const metaIn    = body.meta || {};
    if (!form_slug || !answers) {
      return resp(400, { ok:false, error:"missing-fields" });
    }

    // ---- IP/UA/HREF
    const h = lower(event.headers || {});
    const ip = pickIp(h);                 // inet kolonu boş string almaz → sadece geçerliyse yaz
    const ua = metaIn.ua || h["user-agent"] || "";
    const href = metaIn.href || h["referer"] || "";

    // ---- INSERT gövdesi (Tablo kolonlarına birebir)
    const row = {
      form_slug,
      answers,
      meta: { ...metaIn, ua, href, ts: new Date().toISOString(), ip: ip || undefined },
      // ip kolonu varsa ve null kabul ediyorsa eklemeyebiliriz; varsa ve doluysa yaz:
      ...(ip ? { ip } : {})
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "content-type": "application/json",
        Prefer: "return=minimal" // minimal body; unique ihlalinde 409
      },
      body: JSON.stringify(row)
    });

    if (r.status === 409) {
      return resp(409, { ok:false, error:"duplicate", message:"Bu anketi daha önce doldurmuşsunuz." });
    }
    if (!r.ok) {
      const txt = await r.text().catch(()=> "");
      return resp(500, { ok:false, error:"save-failed", detail: txt.slice(0,300) });
    }

    return resp(200, { ok:true });
  } catch (err) {
    return resp(500, { ok:false, error:String(err && err.message || err) });
  }
};

// ---------- helpers ----------
function resp(code, json) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(json) };
}

function lower(h) {
  const o = {}; for (const k in h) o[k.toLowerCase()] = h[k]; return o;
}
function pickIp(h) {
  // Sadece geçerliyse döndür (inet uyumlu)
  let cand = (h["x-nf-client-connection-ip"] ||
              (h["x-forwarded-for"]||"").split(",")[0].trim() ||
              h["client-ip"] || h["x-real-ip"] || "").trim();
  if (!cand) return null;
  const ipv4 = /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
  const ipv6 = /^[0-9a-f:]+$/i;
  return (ipv4.test(cand) || ipv6.test(cand)) ? cand : null;
}
