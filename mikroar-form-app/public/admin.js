/* MikroAR – Admin Form Builder (açıklama + KVKK destekli) */
const $ = (s) => document.querySelector(s);
const qsWrap = $("#qs");
const toast = (m, type = "") => {
  const t = $("#toast");
  t.textContent = m;
  t.style.display = "block";
  t.style.borderColor = type === "err" ? "#ef4444" : "#2a3a55";
  setTimeout(() => (t.style.display = "none"), 2200);
};

const els = {
  slug: $("#slug"),
  title: $("#title"),
  active: $("#active"),
  desc: $("#desc"),
  kvkk: $("#kvkk"),
  btnLoad: $("#btnLoad"),
  btnNew: $("#btnNew"),
  btnAdd: $("#btnAdd"),
  btnSave: $("#btnSave"),
  meta: $("#meta"),
};

const blankQ = () => ({
  type: "radio", // 'radio' | 'checkbox' | 'text' | 'textarea'
  label: "",
  required: true,
  options: ["Evet", "Hayır"],
});

let questions = [];

function chip(k, v) {
  const s = document.createElement("span");
  s.className = "chip";
  s.textContent = `${k}: ${v}`;
  return s;
}
function renderMeta() {
  els.meta.innerHTML = "";
  els.meta.append(
    chip("Soru", questions.length),
    chip("Zorunlu", questions.filter((q) => q.required).length)
  );
}

function qRow(q, i) {
  const div = document.createElement("div");
  div.className = "q";
  div.dataset.idx = i;

  div.innerHTML = `
    <div class="qhead">
      <select class="qtype">
        <option value="radio">Tek seçenek (radyo)</option>
        <option value="checkbox">Çoklu seçenek (checkbox)</option>
        <option value="text">Kısa metin</option>
        <option value="textarea">Uzun metin</option>
      </select>
      <input class="qlabel" type="text" placeholder="Soru metni"/>
      <label style="display:flex;align-items:center;gap:6px;">
        <input class="qreq" type="checkbox"/> Zorunlu
      </label>
      <button class="up btn">↑</button>
      <button class="down btn">↓</button>
    </div>
    <div class="opts">
      <label class="small">Seçenekler (her satır bir seçenek):</label>
      <textarea class="qopts" placeholder="Evet&#10;Hayır"></textarea>
      <div class="muted" style="margin-top:6px">Metin sorularında seçenek gerekmez.</div>
      <div style="display:flex;gap:8px;margin-top:6px">
        <button class="dup btn">Kopyala</button>
        <button class="del btn">Sil</button>
      </div>
    </div>
  `;

  const tSel = div.querySelector(".qtype");
  const lInp = div.querySelector(".qlabel");
  const rChk = div.querySelector(".qreq");
  const oTxt = div.querySelector(".qopts");

  tSel.value = q.type;
  lInp.value = q.label || "";
  rChk.checked = !!q.required;
  if (Array.isArray(q.options)) oTxt.value = q.options.join("\n");

  const updateVisible = () => {
    div.querySelector(".opts").style.display =
      tSel.value === "radio" || tSel.value === "checkbox" ? "block" : "none";
  };
  updateVisible();

  tSel.onchange = () => {
    q.type = tSel.value;
    updateVisible();
    renderMeta();
  };
  lInp.oninput = () => (q.label = lInp.value);
  rChk.onchange = () => {
    q.required = rChk.checked;
    renderMeta();
  };
  oTxt.oninput = () =>
    (q.options = oTxt.value.split("\n").map((s) => s.trim()).filter(Boolean));

  div.querySelector(".up").onclick = () => {
    if (i > 0) {
      [questions[i - 1], questions[i]] = [questions[i], questions[i - 1]];
      render();
    }
  };
  div.querySelector(".down").onclick = () => {
    if (i < questions.length - 1) {
      [questions[i + 1], questions[i]] = [questions[i], questions[i + 1]];
      render();
    }
  };
  div.querySelector(".del").onclick = () => {
    questions.splice(i, 1);
    render();
  };
  div.querySelector(".dup").onclick = () => {
    questions.splice(i + 1, 0, JSON.parse(JSON.stringify(q)));
    render();
  };

  return div;
}

function render() {
  qsWrap.innerHTML = "";
  questions.forEach((q, i) => qsWrap.appendChild(qRow(q, i)));
  renderMeta();
}

function setForm(form) {
  els.title.value = form.title || "";
  els.active.value = form.active === false ? "false" : "true";
  els.desc.value = form.schema?.description || form.description || "";
  els.kvkk.value = form.schema?.kvkk || "";
  questions = Array.isArray(form.schema?.questions)
    ? JSON.parse(JSON.stringify(form.schema.questions))
    : [];
  render();
}

/* ---- server istemcileri -------------------------------------------------- */
async function apiGetForAdmin(slug) {
  // Önce admin endpoint (aktif/pasif bakmadan getirir)
  const adminUrl = `/admin/api/forms/${encodeURIComponent(slug)}`;
  const r1 = await fetch(adminUrl);
  if (r1.ok) return (await r1.json()).form;

  // Geriye düş: public endpoint (aktif değilse 403 olabilir)
  const r2 = await fetch(`/api/forms/${encodeURIComponent(slug)}`);
  if (r2.ok) return (await r2.json()).form;

  // 403 ise admin endpoint zorunlu
  const txt = (await r2.text()) || "";
  throw new Error(txt || "Yüklenemedi");
}

async function apiSave(body) {
  const r = await fetch("/admin/api/forms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || "Kaydedilemedi");
  return j;
}

/* ---- UI ------------------------------------------------------------------ */
async function load() {
  const slug = els.slug.value.trim();
  if (!slug) return toast("Slug gerekli", "err");

  try {
    const form = await apiGetForAdmin(slug);
    setForm(form);
    toast("Yüklendi");
  } catch (e) {
    toast("Yüklenemedi: " + e.message, "err");
  }
}

async function save() {
  const slug = els.slug.value.trim();
  if (!slug) return toast("Slug gerekli", "err");

  const schema = {
    description: els.desc.value.trim(),
    kvkk: els.kvkk.value.trim(),
    questions,
  };

  const body = {
    slug,
    title: els.title.value.trim(),
    active: els.active.value === "true",
    schema,
  };

  try {
    await apiSave(body);
    toast("Kaydedildi ✓");
  } catch (e) {
    toast("Hata: " + e.message, "err");
  }
}

/* ---- events -------------------------------------------------------------- */
els.btnAdd.onclick = () => {
  questions.push(blankQ());
  render();
};
els.btnNew.onclick = () => {
  els.title.value = "";
  els.active.value = "true";
  els.desc.value = "";
  els.kvkk.value = "";
  questions = [];
  render();
};
els.btnLoad.onclick = load;
els.btnSave.onclick = save;

// URL ?slug=… ile otomatik yükleme
const uSlug = new URLSearchParams(location.search).get("slug");
if (uSlug) {
  els.slug.value = uSlug;
  load();
}
