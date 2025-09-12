const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) return json(400, { ok:false, error:'missing-code' });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await sb
    .from('shortlinks')
    .select('slug, expires_at, max_visits, visits')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) return json(404, { ok:false, error:'not-found' });
  const now = new Date();
  if (data.expires_at && new Date(data.expires_at) < now)
    return json(410, { ok:false, error:'expired' });
  if (data.max_visits && (data.visits || 0) >= data.max_visits)
    return json(429, { ok:false, error:'visit-limit' });

  await sb.from('shortlinks')
    .update({ visits: (data.visits || 0) + 1 })
    .eq('code', code);

  return json(200, { ok:true, slug: data.slug });
};

const json = (status, body) => ({
  statusCode: status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});
