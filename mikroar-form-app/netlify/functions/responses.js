exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

  const slug = (event.queryStringParameters?.slug || '').trim();
  const format = (event.queryStringParameters?.format || 'json').toLowerCase();
  if (!slug) {
    return { statusCode: 400, body: JSON.stringify({ ok:false, error:'slug gerekli' }) };
  }

  const url = `${SUPABASE_URL}/rest/v1/responses`
            + `?select=created_at,ip,answers&form_slug=eq.${encodeURIComponent(slug)}`
            + `&order=created_at.desc`;

  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json'
    }
  });

  const rows = await resp.json().catch(() => []);
  if (!resp.ok) {
    return { statusCode: resp.status, body: JSON.stringify({ ok:false, error:'DB error', data:rows }) };
  }

  if (format === 'csv') {
    // answers {ad,email,mesaj...} -> düz kolonlar
    const allKeys = new Set();
    rows.forEach(r => Object.keys(r.answers || {}).forEach(k => allKeys.add(k)));
    const cols = ['created_at','ip', ...Array.from(allKeys)];

    const esc = v => {
      if (v == null) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
    };

    const lines = [
      cols.join(','),
      ...rows.map(r => {
        const base = [r.created_at, r.ip];
        const ans  = Array.from(allKeys).map(k => esc((r.answers||{})[k]));
        return [...base, ...ans].map(esc).join(',');
      })
    ];

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv; charset=UTF-8',
        'Content-Disposition': `attachment; filename="${slug}-responses.csv"`
      },
      body: lines.join('\n')
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ ok:true, rows })
  };
};
