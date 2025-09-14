// /.netlify/functions/responses
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };
    if (event.httpMethod !== "POST")     return { statusCode: 405, headers:{...CORS, Allow:"POST, OPTIONS"}, body:"Method Not Allowed" };

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;
    if (!SUPABASE_URL || !KEY) return resp(500, { ok:false, error:"supabase-env-missing" });

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { return resp(400, { ok:false, error:"invalid-json" }); }

    const form_slug = (body.form_slug || body.slug || "").trim();
    const answers   = (body.answers && typeof body.answers === "object") ? body.answers : null;
    const metaIn    = body.meta || {};
    if (!form_slug || !answers) return resp(400, { ok:false, error:"missing-fields" });

    const h  = lower(event.headers || {});
    const ip = pickIp(h);
    const ua = metaIn.ua || h["user-agent"] || "";
    const href = metaIn.href || h["referer"] || "";

    let row = {
      form_slug, answers,
      ...(ip ? { ip } : {}),
      meta: { ...metaIn, ua, href, ts: new Date().toISOString(), ...(ip ? { ip } : {}) }
    };

    let ins = await insertRow(SUPABASE_URL, KEY, row);
    if (ins.status === 409) return resp(409, { ok:false, error:"duplicate", message:"Bu anketi daha önce doldurmuşsunuz." });
    if (ins.ok) return resp(200, { ok:true });

    const msg = (ins.detail || ins.text || "").toLowerCase();
    if (msg.includes("meta") && msg.includes("column")) {
      delete row.meta; ins = await insertRow(SUPABASE_URL, KEY, row);
      if (ins.status === 409) return resp(409, { ok:false, error:"duplicate", message:"Bu anketi daha önce doldurmuşsunuz." });
      if (ins.ok) return resp(200, { ok:true });
    }
    if (msg.includes("\"ip\"") && msg.includes("column")) {
      delete row.ip; ins = await insertRow(SUPABASE_URL, KEY, row);
      if (ins.status === 409) return resp(409, { ok:false, error:"duplicate", message:"Bu anketi daha önce doldurmuşsunuz." });
      if (ins.ok) return resp(200, { ok:true });
    }

    const minimal = { form_slug, answers };
    ins = await insertRow(SUPABASE_URL, KEY, minimal);
    if (ins.status === 409) return resp(409, { ok:false, error:"duplicate", message:"Bu anketi daha önce doldurmuşsunuz." });
    if (ins.ok) return resp(200, { ok:true });

    return resp(500, { ok:false, error:"save-failed", detail: ins.detail || ins.text || ins.statusText || "unknown" });
  } catch (err) {
    return resp(500, { ok:false, error:String(err && err.message || err) });
  }
};

async function insertRow(URL, KEY, row) {
  const r = await fetch(`${URL}/rest/v1/responses`, {
    method: "POST",
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      Prefer: "return=minimal"  // unique ihlalinde 409
    },
    body: JSON.stringify(row)
  });
  if (r.ok) return { ok:true, status:r.status };
  let text=""; try { text = await r.text(); } catch {}
  let detail=""; try { detail = JSON.parse(text).message || text; } catch { detail = text; }
  return { ok:false, status:r.status, detail, text };
}

function resp(code, json) { return { statusCode: code, headers: CORS, body: JSON.stringify(json) }; }
function lower(h){ const o={}; for(const k in h) o[k.toLowerCase()]=h[k]; return o; }
function pickIp(h){
  let c = (h["x-nf-client-connection-ip"] || (h["x-forwarded-for"]||"").split(",")[0].trim() || h["client-ip"] || h["x-real-ip"] || "").trim();
  if(!c) return null; const v4=/^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/; const v6=/^[0-9a-f:]+$/i;
  return (v4.test(c)||v6.test(c)) ? c : null;
}
