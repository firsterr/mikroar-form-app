// Public: aktif formları listele (slug + title)
// NOT: admin anahtarı gerektirmez.
const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );

    // En hafif select: slug, title, active ve schema (sorusu var mı bakacağız)
    const { data, error } = await supabase
      .from('forms')
      .select('slug,title,active,schema')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const items = (data || [])
      // aktif: active null ise aktif sayıyoruz, false ise dışarıda
      .filter(r => r && r.slug && r.active !== false)
      // sorusu var mı? (questions ya da fields)
      .filter(r => {
        const s = r.schema || {};
        const qs = Array.isArray(s.questions) ? s.questions : Array.isArray(s.fields) ? s.fields : [];
        return qs.length > 0;
      })
      .map(r => ({ slug: r.slug, title: r.title || r.slug }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30, s-maxage=60'
      },
      body: JSON.stringify({ ok: true, items })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};
