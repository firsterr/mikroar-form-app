exports.handler = async (event) => {
  const code = (event.queryStringParameters?.code || '').trim();
  if (!code) return { statusCode: 400, body: 'code?' };

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const url = `${SUPABASE_URL}/rest/v1/shortlinks?select=target&code=eq.${encodeURIComponent(code)}&limit=1`;

  const resp = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  const data = await resp.json().catch(()=>[]);
  const target = data?.[0]?.target || null;

  if (!target) return { statusCode: 404, body: 'not found' };
  return {
    statusCode: 302,
    headers: { Location: target }
  };
};
