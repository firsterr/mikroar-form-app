/* Results page – robust binding + Turkish-safe column canonizer */

const $ = (sel) => document.querySelector(sel);
const elAny = (...ids) => {
  for (const id of ids) {
    const e = document.getElementById(id);
    if (e) return e;
  }
  return null;
};

// ---------- Canonicalization (çift sütunları engeller)

const canon = (v) => {
  if (v == null) return "";
  return v
    .toString()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining marks (İ'deki nokta dâhil)
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/â|ê|î|ô|û/g, (m) => m[0])
    .replace(/[^a-z0-9]+/g, "")
    .trim();
};

const txt = (v) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

// ---------- API

async function fetchSchema(slug) {
  const r = await fetch(`/api/forms/${encodeURIComponent(slug)}`, { credentials: "same-origin" });
  if (!r.ok) throw new Error(`Şema yüklenemedi HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Şema hatası");
  return j.form;
}

async function fetchResponses(slug) {
  const r = await fetch(`/admin/forms/${encodeURIComponent(slug)}/responses.json`, {
    credentials: "same-origin",
  });
  if (!r.ok) throw new Error(`Yanıtlar yüklenemedi HTTP ${r.status}`);
  return await r.json();
}

// ---------- Şema -> kolonlar

function buildColumns(form) {
  const cols = [
    { label: "Tarih", key: "__date" },
    { label: "IP", key: "__ip" },
  ];
  const seen = new Map();
  seen.set(canon("Tarih"), 0);
  seen.set(canon("IP"), 1);

  const questions = (form?.schema?.questions ?? []).filter(Boolean);
  questions.forEach((q, i) => {
    const label = q?.label || `Soru ${i + 1}`;
    const c = canon(label);
    if (!seen.has(c)) {
      seen.set(c, cols.length);
      cols.push({ label, key: c });
    }
  });

  return { cols, seen, questions };
}

// payload -> canonKey/value eşlemesi (answers / q_# / düz anahtar)
function extractAnswerMap(payload, questions) {
  const out = new Map();
  if (!payload || typeof payload !== "object") return out;

  // yeni
  if (payload.answers && typeof payload.answers === "object") {
    for (const [k, v] of Object.entries(payload.answers)) out.set(canon(k), txt(v));
    return out;
  }

  // q_#
  let usedIndex = false;
  for (const [k, v] of Object.entries(payload)) {
    const m = /^q_(\d+)$/i.exec(k);
    if (m) {
      usedIndex = true;
      const ix = Number(m[1]);
      const label = questions[ix]?.label || `Soru ${ix + 1}`;
      out.set(canon(label), txt(v));
    }
  }
  if (usedIndex) return out;

  // düz
  for (const [k, v] of Object.entries(payload)) out.set(canon(k), txt(v));
  return out;
}

function buildRows(responses, cols, questions) {
  const rows = [];
  for (const rec of responses) {
    const map = extractAnswerMap(rec.payload, questions);
    const row = new Array(cols.length).fill("");
    row[0] = rec.created_at ? new Date(rec.created_at).toLocaleString("tr-TR") : "";
    row[1] = rec.ip || rec.ip_address || "";

    for (let ci = 2; ci < cols.length; ci++) {
      const key = cols[ci].key;
      row[ci] = map.get(key) ?? "";
    }
    rows.push(row);
  }
  return rows;
}

// ---------- Render

function renderTable(cols, rows) {
  const thead = $("#tbl thead");
  const tbody = $("#tbl tbody");
  if (!thead || !tbody) return; // sayfa başka ise sessiz

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const trh = document.createElement("tr");
  cols.forEach((c) => {
    const th = document.createElement("th");
    th.textContent = c.label;
    trh.appendChild(th);
  });
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

  const stats = elAny("stats", "statsBadge", "istatistik");
  if (stats) stats.textContent = `kayıt: ${rows.length}, sütun: ${cols.length}`;
}

// ---------- Copy / CSV

function toTSV(cols, rows) {
  const esc = (s) => String(s ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
  const head = cols.map((c) => esc(c.label)).join("\t");
  const body = rows.map((r) => r.map(esc).join("\t")).join("\n");
  return head + "\n" + body;
}

function toCSV(cols, rows) {
  const esc = (s) => {
    const str = String(s ?? "").replace(/"/g, '""');
    return /[",\r\n]/.test(str) ? `"${str}"` : str;
  };
  const head = cols.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => r.map(esc).join(",")).join("\n");
  return head + "\n" + body;
}

// ---------- Load

async function load() {
  const slugInput = elAny("slug", "slugInput");
  const stats = elAny("stats", "statsBadge", "istatistik");
  if (!slugInput) return;
  const slug = (slugInput.value || "").trim();
  if (!slug) return;

  if (stats) stats.textContent = "yükleniyor…";

  try {
   const form = await fetchSchema(slug);
const { cols, seen, questions } = buildColumns(form);
const responsesRaw = await fetchResponses(slug);

// Çeşitli şekiller için normalize: [], {rows:[]}, {data:[]}, {items:[]}
const responses = Array.isArray(responsesRaw)
  ? responsesRaw
  : Array.isArray(responsesRaw?.rows)
  ? responsesRaw.rows
  : Array.isArray(responsesRaw?.data)
  ? responsesRaw.data
  : Array.isArray(responsesRaw?.items)
  ? responsesRaw.items
  : [];

// Şemada olmayan ama yanıtlarda görülen extra anahtarlar için kolon aç
for (const rec of responses) {
  const m = extractAnswerMap(rec.payload, questions);
  for (const k of m.keys()) {
    if (!seen.has(k)) {
      seen.set(k, cols.length);
      cols.push({ label: k, key: k });
    }
  }
}

const rows = buildRows(responses, cols, questions);
renderTable(cols, rows);

    // Kopyala/CSV tuşları
    const btnCopy = elAny("btnCopy", "copyBtn", "copyTSV");
    const btnCsv = elAny("btnCsv", "csvBtn", "downloadCsv");
    btnCopy && (btnCopy.onclick = async () => {
      const tsv = toTSV(cols, rows);
      await navigator.clipboard.writeText(tsv);
      btnCopy.textContent = "Kopyalandı!";
      setTimeout(() => (btnCopy.textContent = "Kopyala (TSV)"), 1200);
    });
    btnCsv && (btnCsv.onclick = () => {
      const csv = toCSV(cols, rows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  } catch (e) {
    console.error(e);
    if (stats) stats.textContent = `hata: ${e.message}`;
  }
}

// ---------- Binding (ID farklarına toleranslı)

(function bind() {
  const loadBtn = elAny("loadBtn", "btnLoad", "yukleBtn");
  const slugInput = elAny("slug", "slugInput");

  loadBtn && loadBtn.addEventListener("click", load);
  slugInput && slugInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") load();
  });

  // sayfa açılışında input dolu ise otomatik yükle
  window.addEventListener("DOMContentLoaded", () => {
    if (slugInput && slugInput.value.trim()) load();
  });
})();
