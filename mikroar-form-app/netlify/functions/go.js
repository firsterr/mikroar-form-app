// GET /.netlify/functions/go?code=XXXX  ->  { ok:true, slug:"..." }
import { createClient } from '@supabase/supabase-js';

const URL  = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;

export async function handler(event) {
  try {
    const code = event.queryStringParameters?.code || "";
    if (!code) {
      return resp(400, { ok:false, error:"missing-code" });
    }

    const supa = createClient(URL, ANON);
    const { data, error } = await supa
      .from('shortlinks')
      .select('slug')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;
    if (!data?.slug) return resp(404, { ok:false, error:"not-found" });

    return resp(200, { ok:true, slug: data.slug });
  } catch (e) {
    return resp(500, { ok:false, error:"server", detail: String(e?.message || e) });
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}
