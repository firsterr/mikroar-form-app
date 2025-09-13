// mikrorar-form-app/netlify/functions/go.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const code = (event.queryStringParameters?.code || '').trim();
  if (!code) return json(400, { ok: false, error: 'missing-code' });

  const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

  // RLS kapalıysa anon key yeterli. RLS açıksa READ policy gerekli.
  const { data, error } = await supa
    .from('shortlinks')
    .select('slug')
    .eq('code', code)
    .maybeSingle();

  if (error)   return json(500, { ok: false, error: 'db', detail: error.message });
  if (!data?.slug) return json(404, { ok: false, error: 'not-found' });

  // İsteğe bağlı: sayaç artırma (RLS kapalıysa)
  // await supa.rpc('inc_visits', { p_code: code }).catch(() => {});

  return json(200, { ok: true, slug: data.slug });
};

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}
