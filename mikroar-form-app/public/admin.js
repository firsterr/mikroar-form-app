// public/admin.js — FINAL (Diğer şıkkı admin’den yönetilir)

(function () {
  // ---- Infra
  const qs = (sel, el = document) => el.querySelector(sel);
  const qsa = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) el.setAttribute(k, v);
    }
    kids.flat().forEach(k => {
      if (k == null) return;
      if (typeof k === "string") el.insertAdjacentHTML("beforeend", k);
      else el.appendChild(k);
    });
    return el;
  };

  const store = {
    get token() { return localStorage.getItem("ADMIN_TOKEN") || ""; },
    set token(v) { localStorage.setItem("ADMIN_TOKEN", v || ""); },
  };

  // ---- Layout
  const root = h("div", { id: "adminRoot", style: "font:14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width:1024px; margin:0 auto; padding:16px;" },
    h("style", {}, `
      .row{display:flex;gap:8px;align-items:center;margin:6px 0}
      .col{display:flex;flex-direction:column;gap:4px}
      .input, textarea, select{padding:8px;border:1px solid #e5e7eb;border-radius:8px}
      .btn{padding:8px 12px;border:1px solid #111;background:#111;color:#fff;border-radius:10px;cursor:pointer}
      .btn.ghost{background:#fff;color:#111}
      .btn.small{padding:6px 8px;font-size:12px}
      .card{border:1px solid #e5e7eb;border-radius:12px;padding:12px;margin:10px 0}
      .muted{color:#6b7280}
      .qrow{display:grid;grid-template-columns: 1fr 120px 100px 100px auto; gap:8px; align-items:start}
      .qrow .full{grid-column: 1/-1}
      .options{min-height:40px}
      .toolbar{display:flex;gap:6px;justify-content:flex-end}
      .badge{font-size:12px;border:1px solid #e5e7eb;border-radius:999px;padding:2px 8px}
      .danger{color:#b00020}
      .success{color:#065f46}
      .divider{height:1px;background:#f0f2f5;margin:12px 0}
      .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .sticky-top{position:sticky;top:0;background:#fff;padding:8px 0;z-index:10}
      .hr{height:1px;background:#eee;margin:8px 0}
      @media (max-width:920px){ .qrow{grid-template-columns:1fr} }
    `),
    // TOKEN
    h("div", { class: "card sticky-top" },
      h("div", { class: "row" },
        h("div", { class: "col", style:"flex:1" },
          h("label", {}, "ADMIN_TOKEN"),
          h("input", { id: "token", class: "input", type: "password", placeholder: "ADMIN_TOKEN", value: esc(store.token) })
        ),
        h("div", {},
          h("button", { class: "btn", onclick: onSetToken }, "Giriş")
        ),
        h("div", {}, h("span", { id:"tokenState", class:"badge muted" }, store.token ? "Token yüklü" : "Token bekleniyor"))
      ),
      h("div", { class:"row" },
        h("div", { class:"col", style:"flex:1" },
          h("label", {}, "Var olan formlar"),
          h("div", { class:"row" },
            h("select", { id:"formList", class:"input", style:"flex:1" }, h("option", { value:"" }, "— seç —")),
            h("button", { class:"btn ghost", onclick: onLoadSelected }, "Yükle")
          )
        ),
        h("div", { class:"col", style:"width:320px" },
          h("label", {}, "Yeni form"),
          h("div", { class:"row" },
            h("input", { id:"newSlug", class:"input", placeholder:"slug (örn: blkhizmet)" }),
            h("button", { class:"btn", onclick: onCreateNew }, "Oluştur")
          )
        )
      )
    ),

    // FORM META
    h("div", { id:"formMeta", class:"card", style:"display:none" },
      h("div", { class:"grid2" },
        h("div", { class:"col" },
          h("label", {}, "Başlık"),
          h("input", { id:"title", class:"input", placeholder:"Form başlığı" })
        ),
        h("div", { class:"col" },
          h("label", {}, "Aktif mi?"),
          h("select", { id:"active", class:"input" },
            h("option", { value:"true" }, "Evet"),
            h("option", { value:"false" }, "Hayır")
          )
        )
      ),
      h("div", { class:"col", style:"margin-top:8px" },
        h("label", {}, "Açıklama"),
        h("textarea", { id:"desc", rows:"2" })
      )
    ),

    // BUILDER
    h("div", { id:"builder", class:"card", style:"display:none" },
      h("div", { class:"row", style:"justify-content:space-between" },
        h("div", {}, h("b", {}, "Sorular")),
        h("div", { class:"toolbar" },
          h("button", { class:"btn small ghost", onclick: onImport }, "JSON içe al"),
          h("button", { class:"btn small ghost", onclick: onExport }, "JSON dışa ver"),
          h("button", { class:"btn small", onclick: addQuestion }, "+ Soru ekle")
        )
      ),
      h("div", { id:"qList" }),
      h("div", { class:"divider" }),
      h("div", { class:"toolbar" },
        h("button", { class:"btn", onclick: onSave }, "Kaydet / Yayınla"),
        h("span", { id:"saveState", class:"badge muted" }, "Beklemede")
      )
    ),

    // LOG
    h("div", { id:"log", class:"muted", style:"margin:8px 0" })
  );

  document.body.appendChild(root);

  // ---- State
  let currentSlug = "";
  let questions = []; // [{type,label,required,options?,other?}]
  let loading = false;

  // ---- Boot
  init();

  async function init(){
    if (store.token) await loadFormList();
    const url = new URL(location.href);
    const urlSlug = url.searchParams.get("slug");
    if (store.token && urlSlug) {
      qs("#formList").value = urlSlug;
      onLoadSelected();
    }
  }

  // ---- Token & List
  async function onSetToken(){
    store.token = qs("#token").value.trim();
    qs("#tokenState").textContent = store.token ? "Token yüklü" : "Token bekleniyor";
    if (store.token) await loadFormList();
  }

  async function loadFormList(){
    setLog("Formlar yükleniyor…");
    const r = await fetch(`/api/forms-list?token=${encodeURIComponent(store.token)}`).catch(()=>null);
    if (!r || !r.ok) return setLog("Form listesi alınamadı", true);
    const d = await r.json();
    const sel = qs("#formList");
    sel.innerHTML = `<option value="">— seç —</option>`;
    (d.items || []).forEach(it=>{
      const opt = h("option", { value: it.slug }, `${it.slug} — ${it.title || ""}`);
      sel.appendChild(opt);
    });
    setLog("Hazır");
  }

  async function onLoadSelected(){
    const slug = qs("#formList").value;
    if (!slug) return;
    await loadForm(slug);
  }

  function onCreateNew(){
    const slug = (qs("#newSlug").value || "").trim();
    if (!slug) { alert("Slug zorunlu"); return; }
    currentSlug = slug;
    questions = [];
    qs("#title").value = "";
    qs("#desc").value = "";
    qs("#active").value = "true";
    qs("#formMeta").style.display = "";
    qs("#builder").style.display = "";
    renderQuestions();
    setLog(`Yeni form: ${slug}`);
  }

  async function loadForm(slug){
    setLog(`Yükleniyor: ${slug}…`);
    const r = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`).catch(()=>null);
    if (!r || !r.ok) { setLog("Form okunamadı", true); return; }
    const d = await r.json();
    if (!d?.ok || !d.form) { setLog("Form bulunamadı", true); return; }

    const f = d.form;
    currentSlug = f.slug;
    qs("#title").value = f.title || "";
    qs("#desc").value = f.description || "";
    qs("#active").value = f.active ? "true" : "false";
    questions = Array.isArray(f.schema?.questions) ? deepClone(f.schema.questions) : [];
    qs("#formMeta").style.display = "";
    qs("#builder").style.display = "";
    renderQuestions();
    setLog(`Yüklendi: ${slug}`);
  }

  // ---- Builder
  function renderQuestions(){
    const host = qs("#qList");
    host.innerHTML = "";
    if (!questions.length) {
      host.appendChild(h("div", { class:"muted" }, "Henüz soru yok. “+ Soru ekle” ile başlayın."));
      return;
    }
    questions.forEach((q, i)=>{
      host.appendChild(renderRow(q, i));
    });
  }

  function renderRow(q, i){
    const row = h("div", { class:"card" },
      h("div", { class:"qrow" },
        // Label
        h("div", { class:"col" },
          h("label", {}, `Soru ${i+1} — Etiket`),
          h("input", { class:"input", value: q.label || "", oninput: e => { q.label = e.target.value; markDirty(); } })
        ),
        // Type
        h("div", { class:"col" },
          h("label", {}, "Tip"),
          h("select", { class:"input", onchange: e => { q.type = e.target.value; if (!needsOptions(q.type)) { delete q.options; delete q.other; } markDirty(); renderQuestions(); } },
            opt("text", q.type), opt("textarea", q.type), opt("radio", q.type),
            opt("checkbox", q.type), opt("select", q.type)
          )
        ),
        // Required
        h("div", { class:"col" },
          h("label", {}, "Zorunlu mu?"),
          h("select", { class:"input", onchange: e => { q.required = e.target.value === "true"; markDirty(); } },
            h("option", { value:"true", selected: q.required ? "selected" : null }, "Evet"),
            h("option", { value:"false", selected: !q.required ? "selected" : null }, "Hayır")
          )
        ),
        // Other (only radio/checkbox)
        h("div", { class:"col" },
          h("label", {}, "Diğer şıkkı"),
          (q.type === "radio" || q.type === "checkbox")
            ? h("select", { class:"input", onchange: e => { q.other = e.target.value === "true"; markDirty(); } },
                h("option", { value:"false", selected: q.other ? null : "selected" }, "Yok"),
                h("option", { value:"true",  selected: q.other ? "selected" : null }, "Var")
              )
            : h("div", { class:"muted" }, "—")
        ),
        // Toolbar
        h("div", { class:"toolbar" },
          h("button", { class:"btn small ghost", onclick: ()=>move(i,-1) }, "↑"),
          h("button", { class:"btn small ghost", onclick: ()=>move(i, 1) }, "↓"),
          h("button", { class:"btn small ghost", onclick: ()=>dup(i) }, "Kopyala"),
          h("button", { class:"btn small danger", onclick: ()=>del(i) }, "Sil")
        ),

        // Options (full-row)
        needsOptions(q.type)
          ? h("div", { class:"col full" },
              h("label", {}, "Seçenekler (her satır bir seçenek)"),
              h("textarea", { class:"input options", rows:"4", oninput: e => { q.options = splitLines(e.target.value); markDirty(); } },
                esc(joinLines(q.options || []))
              ),
              (q.type === "select"
                ? h("div", { class:"muted" }, "Not: Uygulama tarafında SELECT için otomatik 'Seçiniz…' placeholder eklenir.")
                : null)
            )
          : null
      )
    );
    return row;
  }

  function opt(v, cur){ return h("option", { value:v, selected: cur===v ? "selected": null }, v); }
  function needsOptions(t){ return t==="radio" || t==="checkbox" || t==="select"; }
  function splitLines(s){ return String(s||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean); }
  function joinLines(arr){ return (arr||[]).join("\n"); }
  function move(i, d){ const j=i+d; if (j<0||j>=questions.length) return; const t=questions[i]; questions[i]=questions[j]; questions[j]=t; renderQuestions(); markDirty(); }
  function dup(i){ questions.splice(i+1,0,deepClone(questions[i])); renderQuestions(); markDirty(); }
  function del(i){ questions.splice(i,1); renderQuestions(); markDirty(); }

  function addQuestion(){
    questions.push({ type:"radio", label:"Yeni Soru", required:true, options:["Evet","Hayır"], other:false });
    renderQuestions(); markDirty();
  }

  // ---- Save
  async function onSave(){
    if (loading) return;
    const slug = currentSlug || (qs("#newSlug").value||"").trim();
    if (!slug) { alert("Slug zorunlu"); return; }
    if (!store.token) { alert("ADMIN_TOKEN girin"); return; }

    loading = true; setSaveState("Gönderiliyor…");
    const payload = {
      slug,
      title: qs("#title").value || "",
      description: qs("#desc").value || "",
      active: qs("#active").value === "true",
      schema: {
        title: qs("#title").value || "",
        description: qs("#desc").value || "",
        questions: questions.map(q => normalizeQuestion(q))
      }
    };

    const r = await fetch(`/api/forms-admin?token=${encodeURIComponent(store.token)}`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(payload)
    }).catch(()=>null);

    loading = false;
    if (!r || !r.ok) {
      setSaveState("Hata", true);
      setLog("Kaydetme başarısız: " + (r && await safeText(r)), true);
      return;
    }
    setSaveState("Kaydedildi", false);
    setLog(`Form kaydedildi: ${slug}`);
    // Listeyi yenile
    loadFormList().catch(()=>{});
  }

  function normalizeQuestion(q){
    const out = {
      type: q.type || "text",
      label: q.label || "",
      required: !!q.required
    };
    if (needsOptions(q.type)) {
      out.options = Array.isArray(q.options) ? q.options : [];
      if (q.type === "radio" || q.type === "checkbox") {
        if (q.other === true) out.other = true; // yalnız admin işaretlediyse yaz
      }
    }
    return out;
  }

  // ---- Import / Export
  function onExport(){
    const data = {
      slug: currentSlug,
      title: qs("#title").value || "",
      description: qs("#desc").value || "",
      active: qs("#active").value === "true",
      schema: { title: qs("#title").value || "", description: qs("#desc").value || "", questions }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href:url, download: (currentSlug||"form") + ".json" });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function onImport(){
    const inp = h("input", { type:"file", accept:"application/json" });
    inp.addEventListener("change", async ()=>{
      const f = inp.files[0]; if (!f) return;
      const text = await f.text().catch(()=>null);
      if (!text) return;
      try {
        const j = JSON.parse(text);
        currentSlug = j.slug || currentSlug || "";
        qs("#title").value = j.title || j.schema?.title || "";
        qs("#desc").value  = j.description || j.schema?.description || "";
        qs("#active").value = (j.active ?? true) ? "true" : "false";
        questions = Array.isArray(j.schema?.questions) ? j.schema.questions : (Array.isArray(j.questions)? j.questions: []);
        qs("#formMeta").style.display = "";
        qs("#builder").style.display = "";
        renderQuestions(); markDirty();
      } catch (e) { alert("JSON okunamadı"); }
    }, { once:true });
    inp.click();
  }

  // ---- UI helpers
  function setLog(msg, isErr){
    const el = qs("#log");
    el.innerHTML = esc(msg || "");
    el.className = isErr ? "danger" : "muted";
  }
  function setSaveState(msg, err){
    const el = qs("#saveState");
    el.textContent = msg;
    el.className = "badge " + (err ? "danger" : "success");
    setTimeout(()=>{ el.className = "badge muted"; el.textContent = "Beklemede"; }, 2500);
  }
  function markDirty(){ qs("#saveState").textContent = "Değişiklik var"; qs("#saveState").className = "badge"; }

  async function safeText(r){ try { return await r.text(); } catch { return ""; } }
  function deepClone(o){ return JSON.parse(JSON.stringify(o)); }
})();
