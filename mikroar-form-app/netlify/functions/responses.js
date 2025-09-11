async function sendMetaLead({ event_id, fbp, fbc, ua, url }) {
  const PIXEL_ID = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;
  if (!PIXEL_ID || !ACCESS_TOKEN || !event_id) return;

  const payload = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now()/1000),
      event_id,
      action_source: "website",
      event_source_url: url,
      user_data: {
        client_user_agent: ua,
        fbp: fbp || undefined,
        fbc: fbc || undefined
      }
    }]
  };

  await fetch(`https://graph.facebook.com/v18.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
}
const json = (code, obj) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(obj)
});
const ipOf = (h) =>
  h['x-nf-client-connection-ip'] ||
  h['client-ip'] ||
  (h['x-forwarded-for'] || '').split(',')[0] || null;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !KEY) return json(500, { error: 'supabase-env-missing' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'invalid-json' }); }

  const form_slug = body.form_slug || body.slug || null;
  const answers = body.answers || null;
  if (!form_slug || !answers) return json(400, { error: 'Eksik parametre' });

  const row = { form_slug, answers, ip: ipOf(event.headers || {}) };
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'return=representation'
    },
    body: JSON.stringify(row)
  });

  const txt = await resp.text();
  let payload = null; try { payload = JSON.parse(txt); } catch {}

  // Duplicate/unique violation yakala
  if (resp.status === 409 || (payload && /duplicate key|unique/i.test(JSON.stringify(payload)))) {
    return json(409, { error: 'duplicate', message: 'Bu anketi daha önce doldurmuşsunuz.' });
  }

  if (!resp.ok) {
    return json(500, { error: 'Yanıt kaydedilemedi.', detail: payload || txt });
  }

  return json(200, { ok: true });
};
try {
  await sendMetaLead({
    event_id: body?.meta?.event_id,
    fbp: body?.meta?.fbp,
    fbc: body?.meta?.fbc,
    ua: body?.meta?.ua,
    url: body?.meta?.href
  });
} catch {}
