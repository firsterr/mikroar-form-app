/* Results table builder with strong Turkish-safe normalization */

const $ = (sel) => document.querySelector(sel);

const canon = (v) => {
  if (v == null) return "";
  return v
    .toString()
    .toLowerCase()
    // Harfleri baz + combining biçimine ayır
    .normalize("NFKD")
    // Tüm combining işaretleri (U+0300–U+036F) — özellikle U+0307 'combining dot above'
    .replace(/[\u0300-\u036f]/g, "")
    // Türkçe özel harfleri güvenli ASCII'ye indir
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/â|ê|î|ô|û/g, (m) => m[0]) // şapkalı harfler
    // Harf/rakam dışını at
    .replace(/[^a-z0-9]+/g, "")
    .trim();
};

const text = (v) => {
  if (Array.isArray(v)) return v.join(", ");
  if (v == null) return "";
  return String(v);
};

// /api/forms/:slug -> { ok: true, form: { slug, title, active, schema: { questions: [...] } } }
async function fetchSchema(slug) {
  const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, {
    credentials: "same-origin",
  });
  if (!r.ok) throw new Error(`Schema HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Schema error");
  return j.form;
}

// /admin/forms/:slug/responses.json -> [{ created_at, ip, payload }]
async function fetchResponses(slug) {
  const r = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, {
    credentials: "same-origin",
  });
  if (!r.ok) throw new Error(`Responses HTTP ${r.status}`);
  return await r.json();
}

// Şemadan kolonları çıkar, sonra yanıtlarda hiç eşleşmeyen anahtarlar için ek kolon aç
function buildColumns(form) {
  const cols = [
    { label: "Tarih", key: "__date" },
    { label: "IP", key: "__ip" },
  ];
  const seen = new Map(); // canon -> index

  // sabitleri ekledik
  seen.set(canon("Tarih"), 0);
  seen.set(canon("IP"), 1);

  const questions = (form?.schema?.questions ?? []).filter(Boolean);
  questions.forEach((q, idx) => {
    const label = q?.label || `Soru ${idx + 1}`;
    const c = canon(label);
    if (!seen.has(c)) {
      seen.set(c, cols.length);
      cols.push({ label, key: c });
    }
  });

  return { cols, seen, questions };
}

// payload farklı yapıda olabilir: answers objesi / q_# / düz anahtarlar
function extractAnswerKVs(payload, questions) {
  const out = new Map(); // canonKey -> value

  if (payload == null || typeof payload !== "object") return out;

  // 1) Yeni şema: payload.answers = { "Soru": "Yanıt" }
  if (payload.answers && typeof payload.answers === "object") {
    for (const [k, v] of Object.entries(payload.answers)) {
      out.set(canon(k), text(v));
    }
    return out;
  }

  // 2) Eski: q_0, q_1 …
  let usedIndexKeys = false;
  for (const [k, v] of Object.entries(payload)) {
    const m = /^q_(\d+)$/i.exec(k);
    if (m) {
      usedIndexKeys = true;
      const ix = Number(m[1]);
      const label = questions[ix]?.label || `Soru ${ix + 1}`;
      out.set(canon(label), text(v));
    }
  }
  if (usedIndexKeys) return out;

  // 3) En eski/düz: payload = { "Hangi ilçe...": "Altıeylül", ... }
  for (const [k, v] of Object.entries(payload)) {
    out.set(canon(k), text(v));
  }
  return out;
}

// Responses'ı tablo satırlarına dönüştür
function buildRows(responses, cols, questions) {
  const rows = [];
  for (const rec of responses) {
    const answers = extractAnswerKVs(rec.payload, questions);

    const row = new Array(cols.length).fill("");
    // Tarih & IP
    row[0] = rec.created_at ? new Date(rec.created_at).toLocaleString("tr-TR") : "";
    row[1] = rec.ip || rec.ip_address || "";

    // Kolonlara yanıtları bas
    for (let ci = 2; ci < cols.length; ci++) {
      const cKey = cols[ci].key;
      // cKey zaten canon formatında (soru etiketinden üretilmiş)
      const val = answers.get(cKey) ?? "";
      row[ci] = val;
    }

    rows.push(row);
  }
  return rows;
}

function renderTable(cols, rows) {
  const thead = $("#tbl thead");
  const tbody = $("#tbl tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const trh = document.createElement("tr");
  for (const c of cols) {
    const th = document.createElement("th");
    th.textContent = c.label;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  rows.forEach((r) => {
    const tr = document.createElement("tr");
    r.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  $("#stats").textContent = `kayıt: ${rows.length}, sütun: ${cols.length}`;
}

async function load() {
  const slug = ($("#slug").value || "").trim();
  if (!slug) return;

  $("#stats").textContent = "yükleniyor…";

  try {
    const form = await fetchSchema(slug);
    $("#titleBadge").textContent = form.title || slug;
    $("#activeBadge").textContent = form.active ? "aktif" : "pasif";
    $("#qCountBadge").textContent = (form?.schema?.questions || []).length;

    const { cols, seen, questions } = buildColumns(form);
    const responses = await fetchResponses(slug);

    // Yanıtlarda şemada olmayan anahtar görürsek (ör. çok eski veri),
    // KANONİK eşleşmeye bakarak GEREKİRSE kolon ekle (ve tekilleştir).
    // (Bu kısım genelde çalışmayacak; ama güvenlik için duruyor.)
    for (const rec of responses) {
      const extra = extractAnswerKVs(rec.payload, questions);
      for (const k of extra.keys()) {
        if (!seen.has(k)) {
          seen.set(k, cols.length);
          cols.push({ label: k, key: k }); // label'ı da kalsın; pratikte nadir olur
        }
      }
    }

    const rows = buildRows(responses, cols, questions);
    renderTable(cols, rows);
  } catch (e) {
    console.error(e);
    $("#stats").textContent = `hata: ${e.message}`;
  }
}

$("#loadBtn").addEventListener("click", load);
$("#slug").addEventListener("keydown", (e) => {
  if (e.key === "Enter") load();
});

// otomatik doldurma için (sayfa ilk açıldığında input dolu ise)
window.addEventListener("DOMContentLoaded", () => {
  if ($("#slug").value.trim()) load();
});
