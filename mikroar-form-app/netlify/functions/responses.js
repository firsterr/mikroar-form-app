// /.netlify/functions/responses

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// --- Facebook CAPI config ---
const FB_PIXEL_ID = process.env.FB_PIXEL_ID;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const FB_API_VERSION = "v18.0";

// Ana handler
exports.handler = async (event) => {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: CORS, body: "" };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { ...CORS, Allow: "POST, OPTIONS" },
        body: "Method Not Allowed",
      };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const KEY =
      process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !KEY) {
      return resp(500, { ok: false, error: "supabase-env-missing" });
    }

    // Gövdedeki JSON'u al
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (e) {
      console.error("RESPONSES_INVALID_JSON:", e);
      return resp(400, { ok: false, error: "invalid_json" });
    }

    const form_slug = (payload.form_slug || "").trim();
    const answers = payload.answers;
    const meta = payload.meta || {};

    if (!form_slug || !Array.isArray(answers)) {
      return resp(400, { ok: false, error: "missing_fields" });
    }

    // Header'ları normalize et, IP ve UA çek
    const headersLower = lower(event.headers || {});
    const ip = pickIp(headersLower);
    const ua =
      meta.ua ||
      headersLower["user-agent"] ||
      headersLower["user_agent"] ||
      "";

    const href = meta.href || "";

    // Supabase'e yazılacak satır
    const row = {
      form_slug,
      answers,
      ip,
      meta: {
        ...meta,
        ua,
        href,
      },
    };

    // Supabase insert
    let ins = await insertRow(SUPABASE_URL, KEY, row);

    if (ins.ok) {
      // CAPI'yi fire-and-forget tetikle (kullanıcıyı bekletme)
      sendToFacebookCAPI({
        eventName: "FormSubmit",
        ip,
        ua,
        href,
        form_slug,
      }).catch((err) => console.error("FB_CAPI_async_error:", err));

      return resp(200, { ok: true });
    }

    // Meta kolonu yoksa meta'yı çıkarıp tekrar dene (şema uyumsuzluğu için)
    const msg = (ins.detail || ins.text || "").toLowerCase();
    if (msg.includes("meta") && msg.includes("column")) {
      console.warn("META column mismatch, retrying without meta");
      const rowNoMeta = { form_slug, answers, ip };
      ins = await insertRow(SUPABASE_URL, KEY, rowNoMeta);
      if (ins.ok) {
        sendToFacebookCAPI({
          eventName: "FormSubmit",
          ip,
          ua,
          href,
          form_slug,
        }).catch((err) => console.error("FB_CAPI_async_error:", err));
        return resp(200, { ok: true });
      }
    }

    // Çift kayıt durumunda (unique constraint)
    if (ins.status === 409) {
      return resp(409, {
        ok: false,
        error: "duplicate",
        message: "Bu anketi daha önce doldurmuşsun.",
      });
    }

    // Diğer Supabase hataları
    console.error("SUPABASE_INSERT_ERROR:", ins);
    return resp(500, {
      ok: false,
      error: "supabase-insert-failed",
      detail: ins.detail,
      text: ins.text,
    });
  } catch (e) {
    console.error("responses.js crash:", e);
    return resp(500, { ok: false, error: "server_crash" });
  }
};

// --- Helper: Supabase insert ---
async function insertRow(SUPABASE_URL, KEY, row) {
  const url = `${SUPABASE_URL}/rest/v1/responses`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (r.ok) {
    let data = null;
    try {
      data = await r.json();
    } catch {}
    return { ok: true, status: r.status, data };
  }

  let text = "";
  try {
    text = await r.text();
  } catch {}

  let detail = text;
  try {
    const parsed = JSON.parse(text);
    detail = parsed.message || text;
  } catch {
    // parsed edilemezse olduğu gibi bırak
  }

  return { ok: false, status: r.status, detail, text };
}

// --- Helper: Facebook CAPI gönderimi ---
async function sendToFacebookCAPI({ eventName, ip, ua, href, form_slug }) {
  try {
    if (!FB_PIXEL_ID || !FB_ACCESS_TOKEN) {
      console.warn("FB CAPI env vars missing, event not sent");
      return;
    }

    const eventTime = Math.floor(Date.now() / 1000);

    const body = {
      data: [
        {
          event_name: eventName,
          event_time: eventTime,
          action_source: "website",
          event_source_url: href || "https://form.mikroar.com",
          user_data: {
            client_ip_address: ip || undefined,
            client_user_agent: ua || undefined,
          },
          custom_data: {
            form_slug,
          },
        },
      ],
    };

    if (process.env.FB_TEST_CODE) {
      body.test_event_code = process.env.FB_TEST_CODE;
    }

    const url = `https://graph.facebook.com/${FB_API_VERSION}/${FB_PIXEL_ID}/events?access_token=${FB_ACCESS_TOKEN}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const out = await res.json();
    if (!res.ok) {
      console.error("FB CAPI error:", res.status, out);
    } else {
      console.log("FB CAPI success:", out);
    }
  } catch (err) {
    console.error("FB CAPI exception:", err);
  }
}

// --- Diğer küçük helper'lar ---
function resp(code, json) {
  return {
    statusCode: code,
    headers: CORS,
    body: JSON.stringify(json),
  };
}

function lower(h) {
  const o = {};
  for (const k in h || {}) o[k.toLowerCase()] = h[k];
  return o;
}

function pickIp(h) {
  const raw =
    h["x-nf-client-connection-ip"] ||
    (h["x-forwarded-for"] || "").split(",")[0] ||
    h["client-ip"] ||
    h["x-real-ip"] ||
    "";

  const c = raw.trim();
  if (!c) return null;

  const v4 =
    /^(25[0-5]|2[0-4]\d|[01]?\d?\d)(\.(25[0-5]|2[0-4]\d|[01]?\d?\d)){3}$/;
  const v6 = /^[0-9a-f:]+$/i;

  return v4.test(c) || v6.test(c) ? c : null;
}
