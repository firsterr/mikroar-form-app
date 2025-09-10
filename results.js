/* MikroAR – Sonuç Görüntüleme */
const $ = s => document.querySelector(s);
const els = {
  slug:    $("#slug"),
  load:    $("#btnLoad"),
  copyTsv: $("#btnCopy"),
  csv:     $("#btnCsv"),
  meta:    $("#meta"),
  table:   $("#table"),
  toast:   $("#toast")
};

function toast(msg, kind="") {
  els.toast.textContent = msg;
  els.toast.style.display = "block";
  els.toast.style.borderColor =
    kind === "err" ? "#ef4444" : kind === "ok" ? "#22c55e" : "var(--line)";
  setTimeout(() => els.toast.style.display = "none", 2000);
}

function toTsv(rows) {
  const header = Object.keys(rows[0] || {});
  const lines = [header.join("\t")];
  for (const r of rows) lines.push(header.map(k => String(r[k] ?? "")).join("\t"));
  return lines.join("\n");
}

function downloadCsv(filename, rows) {
  const header = Object.keys(rows[0] || {});
  const csv = [header.join(",")].concat(
    rows.map(r => header.map(k => `"${String(r[k] ?? "").replace(/"/g,'""')}"`).join(","))
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderTable(rows) {
  els.table.innerHTML = "";
  if (!rows.length) { els.table.textContent = "Kayıt yok."; return; }
  const header = Object.keys(rows[0] || {});
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${header.map(h => `<th>${h}</th>`).join("")}</tr>`;
  const tbody = document.createElement("tbody");
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = header.map(h => `<td>${r[h] ?? ""}</td>`).join("");
    tbody.appendChild(tr);
  }
  els.table.appendChild(thead);
  els.table.appendChild(tbody);
}

async function ensureAdminAuth() {
  try {
    const ping = await fetch("/api/admin/ping", { cache: "no-store" });
    if (ping.status === 401) {
      location.href = "/admin/gate?next=" + encodeURIComponent(location.href);
      return false;
    }
    if (!ping.ok) throw new Error("Auth ping başarısız");
    return true;
  } catch {
    // ağ hatası vs: yine de gate’e gönder
    location.href = "/admin/gate?next=" + encodeURIComponent(location.href);
    return false;
  }
}

async function load() {
  const slug = els.slug.value.trim();
  if (!slug) return toast("Slug gerekli", "err");

  if (!(await ensureAdminAuth())) return;

  els.meta.textContent = "yükleniyor…";
  els.table.innerHTML = "";

  try {
    const r = await fetch(`/api/admin/forms/${encodeURIComponent(slug)}/responses`, { cache: "no-store" });
    if (r.status === 401) {
      location.href = "/admin/gate?next=" + encodeURIComponent(location.href);
      return;
    }
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "yüklenemedi");

    // rows: [{created_at, ip, answers}]
    const flat = j.rows.map(x => {
      const base = { "Tarih": x.created_at, "IP": x.ip || "" };
      const a = x.answers || {};
      for (const k of Object.keys(a)) {
        let v = a[k];
        if (Array.isArray(v)) v = v.join("; ");
        else if (v && typeof v === "object") v = JSON.stringify(v);
        base[k] = v ?? "";
      }
      return base;
    });

    els.meta.textContent = `kayıt: ${flat.length}, sütun: ${Object.keys(flat[0]||{}).length}`;
    renderTable(flat);

    els.copyTsv.onclick = () => {
      if (!flat.length) return toast("Kopyalanacak veri yok");
      navigator.clipboard.writeText(toTsv(flat));
      toast("Kopyalandı", "ok");
    };
    els.csv.onclick = () => {
      if (!flat.length) return toast("İndirilecek veri yok");
      downloadCsv(`${slug}.csv`, flat);
    };

  } catch (e) {
    console.error(e);
    els.meta.textContent = "";
    toast("Hata: " + e.message, "err");
  }
}

els.load.onclick = load;

// URL parametresi ile otomatik slug set
const uSlug = new URLSearchParams(location.search).get("slug");
if (uSlug) els.slug.value = uSlug;
