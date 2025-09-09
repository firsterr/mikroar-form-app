// Basit ve garantili listeleme: aktif tüm formlar (soru sayısına bakmadan)
const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE,
      { auth: { persistSession: false } }
    );

    // Yalnızca aktifleri çek; slug ve title bizim için yeterli
    const { data, error } = await supabase
      .from('forms')
      .select('slug,title,active,schema')
      .eq('active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Bozuk kayıtlara karşı koruma: başlık boşsa slug göster
    const items = (data || []).map(r => ({
      slug: r.slug,
      title: r.title || r.slug
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, items })
    };
  } catch (e) {
    return {
      statusCode: 200, // UI "boş" yerine hata gösterebilsin diye 200 + ok:false dönüyoruz
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: false, error: e.message })
    };
  }
};
