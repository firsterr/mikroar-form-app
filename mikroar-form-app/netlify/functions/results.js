// netlify/functions/results.js
const { createClient } = require("@supabase/supabase-js");

const json = (code, body, extraHeaders = {}) => ({
  statusCode: code,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});
const ok  = (b)                 => json(200, { ok: true,  ...b });
const err = (code, msg, detail) => json(code, { ok: false, error: msg, detail });

exports.handler = async (event) => {
  try {
    // --- Token (query veya Authorization: Bearer) ---
    const qs = event.queryStringParameters || {};
    const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const token = (qs.token || bearer || "").trim();

    const ADMIN = (process.env.ADMIN_TOKEN || "").trim();
    if (!ADMIN) return err(500, "ADMIN_TOKEN not configured");
    if (!token || token !== ADMIN) return err(401, "unauthorized");

    // --- Parametreler ---
    const slug  = (qs.slug || "").trim();
    const from  = Number.parseInt(qs.from || "0", 10) || 0;
    const limit = Math.min(Number.parseInt(qs.limit || "1000", 10) || 1000, 5000);
    if (!slug) return err(400, "missing slug");

    // --- Supabase client (Service Role > Anon fallback) ---
    const url = (process.env.SUPABASE_URL || "").trim();
    const svc = (process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();
    const anon= (process.env.SUPABASE_ANON_KEY || "").trim();
    const key = svc || anon;
    if (!url || !key) return err(500, "supabase env missing", { hasUrl: !!url, hasKey: !!key, hasService: !!svc });

    const supa = createClient(url, key, { auth: { persistSession: false } });

    // --- Form şeması ---
    const { data: formRow, error: formErr } = await supa
      .from("forms")
      .select("schema, title")
      .eq("slug", slug)
      .maybeSingle();

    if (formErr) return err(500, "forms query failed", formErr.message);
    if (!formRow)   return err(404, "form not found");

    const questions = Array.isArray(formRow?.schema?.questions) ? formRow.schema.questions : [];

    const cols = [];
    const keyToLabel = {};
    questions.forEach((q, idx) => {
      const key = q.id || q.name || q.key || `q${idx + 1}`;
      const label = q.label || key;
      keyToLabel[key] = label;
      cols.push({ key, label });
    });

    // --- Yanıtlar ---
    const to = from + limit - 1;
    const { data: rows, error: respErr } = await supa
      .from("responses")
      .select("id, created_at, ip, answers")
      .eq("form_slug", slug)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (respErr) return err(500, "responses query failed", respErr.message);

    // Şemada olmayan anahtarları da kolon olarak ekle
    for (const r of rows || []) {
      const a = r.answers || {};
      for (const k of Object.keys(a)) {
        if (!keyToLabel[k]) {
          keyToLabel[k] = k;
          cols.push({ key: k, label: k });
        }
      }
    }

    const headers = ["created_at", "ip", ...cols.map((c) => c.label)];
    const items = (rows || []).map((r) => {
      const out = { created_at: r.created_at, ip: r.ip || "" };
      const a = r.answers || {};
      for (const c of cols) {
        let v = a[c.key];
        if (Array.isArray(v)) v = v.join("; ");
        else if (v && typeof v === "object") v = JSON.stringify(v);
        out[c.label] = v ?? "";
      }
      return out;
    });

    return ok({ slug, title: formRow.title, headers, items, count: items.length });
  } catch (e) {
    console.error("[results.js] unexpected", e);
    return err(500, "unexpected", String(e?.message || e));
  }
};
