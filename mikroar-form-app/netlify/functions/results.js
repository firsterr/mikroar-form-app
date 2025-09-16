// netlify/functions/results.js
import { createClient } from "@supabase/supabase-js";

const ok = (b, extra = {}) => ({
  statusCode: 200,
  headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  body: JSON.stringify(b),
});
const err = (code, msg, detail) => ({
  statusCode: code,
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ok: false, error: msg, detail }),
});

export const handler = async (event) => {
  try {
    const qs = event.queryStringParameters || {};
    const token = (qs.token || "").trim();
    const slug = (qs.slug || "").trim();
    const from = Number.parseInt(qs.from || "0", 10) || 0;
    const limit = Math.min(Number.parseInt(qs.limit || "1000", 10) || 1000, 5000);

    if (!token || token !== process.env.ADMIN_TOKEN) {
      return err(401, "unauthorized");
    }
    if (!slug) return err(400, "missing slug");

    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY,
      { auth: { persistSession: false } }
    );

    // 1) Form şemasını al (sütun başlıkları için)
    const { data: formRow, error: formErr } = await supa
      .from("forms")
      .select("schema, title")
      .eq("slug", slug)
      .maybeSingle();

    if (formErr) return err(500, "forms query failed", formErr.message);
    if (!formRow) return err(404, "form not found");

    const questions = Array.isArray(formRow?.schema?.questions)
      ? formRow.schema.questions
      : [];

    const cols = [];
    const keyToLabel = {};
    questions.forEach((q, idx) => {
      const key = q.id || q.name || q.key || `q${idx + 1}`;
      const label = q.label || key;
      keyToLabel[key] = label;
      cols.push({ key, label });
    });

    // 2) Yanıtları çek
    const { data: rows, error: respErr } = await supa
      .from("responses")
      .select("id, created_at, ip, answers, meta")
      .eq("form_slug", slug)
      .order("created_at", { ascending: false })
      .range(from, from + limit - 1);

    if (respErr) return err(500, "responses query failed", respErr.message);

    // answers içinde şemada olmayan anahtar varsa sütun olarak ekle
    for (const r of rows || []) {
      const a = r.answers || {};
      for (const k of Object.keys(a)) {
        if (!keyToLabel[k]) {
          keyToLabel[k] = k;
          cols.push({ key: k, label: k });
        }
      }
    }

    // Başlıklar: metadata + soru etiketleri
    const headers = ["created_at", "ip", ...cols.map((c) => c.label)];

    // Satırlar: excel dostu düz metin
    const items = (rows || []).map((r) => {
      const out = { created_at: r.created_at, ip: r.ip || "" };
      const a = r.answers || {};
      for (const c of cols) {
        let v = a[c.key];
        if (Array.isArray(v)) v = v.join("; ");
        else if (typeof v === "object" && v !== null) v = JSON.stringify(v);
        out[c.label] = v ?? "";
      }
      return out;
    });

    return ok({ ok: true, slug, title: formRow.title, headers, items, count: items.length });
  } catch (e) {
    return err(500, "unexpected", String(e?.message || e));
  }
};
