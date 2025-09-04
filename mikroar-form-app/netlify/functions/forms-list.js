export async function handler() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' }),
    };
  }

  // Tablo adını kendi şemanına göre değiştir:
  const table = 'forms'; // Örn: 'forms', 'anketler' vs.
  const endpoint = `${url}/rest/v1/${table}?select=*&order=created_at.desc`;

  try {
    const resp = await fetch(endpoint, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        Prefer: 'return=representation',
        'Content-Profile': 'public', // şeman farklıysa değiştir
      },
    });

    const data = await resp.json().catch(() => null);

    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // tarayıcıdan çağıracaksan rahat et
      },
      body: JSON.stringify({ ok: resp.ok, data }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
}
