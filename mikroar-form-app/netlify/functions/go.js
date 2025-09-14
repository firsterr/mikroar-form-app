// /.netlify/functions/go?code=XXXX
const { createClient } = require("@supabase/supabase-js");

exports.handler = async (event) => {
  const code = (event.queryStringParameters?.code || "").trim();
  if (!code) return json(400, { ok:false, error:"missing-code" });

  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth:{ persistSession:false } });

  const { data, error } = await sb.from("shortlinks").select("slug").eq("code", code).maybeSingle();
  if (error) return json(500, { ok:false, error:"db", detail:error.message });
  if (!data?.slug) return json(404, { ok:false, error:"not-found" });

  return json(200, { ok:true, slug: data.slug });
};

function json(status, body) {
  return {
    statusCode: status,
    headers: { "content-type":"application/json; charset=utf-8", "cache-control":"no-store" },
    body: JSON.stringify(body)
  };
}
