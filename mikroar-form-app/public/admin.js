// MikroAR Admin — clean login gate + builder (FINAL)
(function () {
  const app = document.getElementById("app");

  // ----------------- helpers -----------------
  const el = (t, a = {}, ...kids) => {
    const d = document.createElement(t);
    for (const [k, v] of Object.entries(a)) {
      if (k === "class") d.className = v;
      else if (k === "style") d.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") d.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined) d.setAttribute(k, v);
    }
    for (const k of kids.flat()) d.append(k);
    return d;
  };
  const qs  = (s, r=document) => r.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const needsOptions = (t) => t==="radio" || t==="checkbox" || t==="select";
  const splitLines = s => String(s||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const joinLines  = a => (a||[]).join("\n");

  const store = {
    get token(){ return localStorage.getItem("ADMIN_TOKEN") || ""; },
    set token(v){ localStorage.setItem("ADMIN_TOKEN", v || ""); }
  };

  // ----------------- state -----------------
  let state = {
    authed: false,
    token: "",
    list: [],
    slug: "",
    title: "",
    description: "",
    active: true,
    questions: []
  };

  // ----------------- boot -----------------
  document.addEventListener("DOMContentLoaded", init);

  async function init(){
    renderLogin(); // her zaman önce login ekranı
    const cached = store.token;
    if (cached) {
      qs("#tokenInput").value = cached;
    }
  }

  // ----------------- views -----------------
  function renderLogin(msg){
    app.innerHTML = "";
    app.append(
      el("style", {}, `
        :root{ --fg:#111; --muted:#6b7280; --bd:#e5e7eb; }
        body{ font:14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#fff; color:var(--fg) }
        .shell{ max-width:860px; margin:48px auto; padding:0 16px }
        .title{ font-weight:800; font-size:32px; text-align:center; margin:24px 0 32px }
        .card{ border:1px solid var(--bd); border-radius:16px; padding:16px; }
        .row{ display:flex; gap:12px; align-items:center; }
        .col{ display:flex; flex-direction:column; gap:6px; }
        .input{ padding:10px 12px; border:1px solid var(--bd); border-radius:10px; width:100%; }
        .btn{ padding:10px 14px; border:1px solid #111; background:#111; color:#fff; border-radius:10px; cursor:pointer }
        .muted{ color:var(--muted) }
        .error{ color:#b00020; margin-top:8px }
      `),
      el("div", { class:"shell" },
        el("div", { class:"title" }, "Anket Oluştur / Düzenle"),
        el("div", { class:"card", style:"max-width:680px; margin:0 auto;" },
          el("div", { class:"col" },
            el("label", {}, "ADMIN_TOKEN"),
            el("input", { id:"tokenInput", class:"input", type:"password", placeholder:"ADMIN_TOKEN", value:store.token||"" }),
            el("div", { class:"row", style:"justify-content:flex-end" },
              el("button", { class:"btn", onclick: onLogin }, "Giriş")
            ),
            el("div", { id:"loginMsg", class: msg ? "error" : "muted" },
              msg || "Yalnızca ADMIN_TOKEN ile giriş yapılır."
            )
          )
        )
      )
    );
  }

  function renderApp(){
    app.innerHTML = "";
    app.append(
      el("style", {}, `
        :root{ --fg:#111; --muted:#6b7280; --bd:#e5e7eb; }
        body{ font:14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color:var(--fg) }
        .shell{ max-width:1100px; margin:24px auto; padding:0 16px }
        .topbar{ display:flex; justify-content:space-between; align-items:center; margin:8px 0 16px }
        .title{ font-weight:800; font-size:24px }
        .btn{ padding:8px 12px; border:1px solid #111; background:#111; color:#fff; border-radius:10px; cursor:pointer }
        .btn.ghost{ background:#fff; color:#111 }
        .btn.small{ padding:6px 8px; font-size:12px }
        .card{ border:1px solid var(--bd); border-radius:14px; padding:12px; margin:12px 0 }
        .row{ display:flex; gap:8px; align-items:center; }
        .col{ display:flex; flex-direction:column; gap:6px; }
        .input, textarea, select{ padding:8px 10px; border:1px solid var(--bd); border-radius:10px; width:100%; }
        .muted{ color:var(--muted) }
        .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
        .qrow{ display:grid; grid-template-columns: 1fr 120px 120px 120px auto; gap:10px; align-items:start }
        .qrow .full{ grid-column:1/-1 }
        @media (max-width:980px){ .qrow{ grid-template-columns:1fr } }
        .badge{ border:1px solid var(--bd); border-radius:999px; padding:2px 8px; font-size:12px }
        .ok{ color:#065f46 } .err{ color:#b00020 }
      `),
      el("div", { class:"shell" },

        // topbar
        el("div", { class:"topbar" },
          el("div", { class:"title" }, "MikroAR Admin"),
          el("div", { class:"row" },
            el("span", { id:"stat", class:"badge muted" }, "Hazır"),
            el("button", { class:"btn ghost", onclick: onLogout }, "Çıkış")
          )
        ),

        // giriş + liste + oluştur
        el("div", { class:"card" },
          el("div", { class:"grid2" },
            el("div", { class:"col" },
              el("label", {}, "Var olan formlar"),
              el("div", { class:"row" },
                el("select", { id:"formList", class:"input", style:"flex:1" }, el("option", { value:"" }, "— seç —")),
                el("button", { class:"btn ghost", onclick: onLoadSelected }, "Yükle")
              )
            ),
            el("div", { class:"col" },
              el("label", {}, "Yeni form"),
              el("div", { class:"row" },
                el("input", { id:"newSlug", class:"input", placeholder:"slug (örn: blkhizmet)" }),
                el("button", { class:"btn", onclick: onCreateNew }, "Oluştur")
              )
            )
          )
        ),

        // meta
        el("div", { id:"meta", class:"card", style:"display:none" },
          el("div", { class:"grid2" },
            el("div", { class:"col" },
              el("label", {}, "Başlık"),
              el("input", { id:"title", class:"input", placeholder:"Form başlığı", oninput: e=>state.title = e.target.value })
            ),
            el("div", { class:"col" },
              el("label", {}, "Aktif mi?"),
              el("select", { id:"active", class:"input", onchange: e=>state.active = (e.target.value==="true") },
                el("option", { value:"true" }, "Evet"),
                el("option", { value:"false" }, "Hayır")
              )
            )
          ),
          el("div", { class:"col", style:"margin-top:6px" },
            el("label", {}, "Açıklama"),
            el("textarea", { id:"desc", rows:"2", oninput: e=>state.description = e.target.value })
          )
        ),

        // builder
        el("div", { id:"builder", class:"card", style:"display:none" },
          el("div", { class:"row", style:"justify-content:space-between" },
            el("b", {}, "Sorular"),
            el("div", { class:"row" },
              el("button", { class:"btn small ghost", onclick: onImport }, "JSON içe al"),
              el("button", { class:"btn small ghost", onclick: onExport }, "JSON dışa ver"),
              el("button", { class:"btn small", onclick: addQuestion }, "+ Soru ekle")
            )
          ),
          el("div", { id:"qList" }),
          el("div", { class:"row", style:"justify-content:flex-end; margin-top:8px" },
            el("button", { class:"btn", onclick: onSave }, "Kaydet / Yayınla")
          )
        )
      )
    );

    // listeyi yükle
    loadList().catch(()=> setStatus("Liste alınamadı", true));
  }

  // ----------------- login flow -----------------
  async function onLogin(){
    const token = qs("#tokenInput").value.trim();
    if (!token) return setLoginMsg("Token gerekli");
    setLoginMsg("Doğrulanıyor…");
    const ok = await testToken(token);
    if (!ok) return setLoginMsg("Yetki doğrulanamadı (401).");
    // success
    store.token = token;
    state.token = token;
    state.authed = true;
    renderApp();
  }
  function onLogout(){
    store.token = "";
    state = { authed:false, token:"", list:[], slug:"", title:"", description:"", active:true, questions:[] };
    renderLogin("Çıkış yapıldı.");
  }
  function setLoginMsg(m){ qs("#loginMsg").textContent = m; qs("#loginMsg").className = /doğrulanıyor/i.test(m) ? "muted" : ( /hata|yetki|gerekli/i.test(m) ? "error" : "muted" ); }

  async function testToken(token){
    try {
      const r = await fetch(`/api/forms-list?token=${encodeURIComponent(token)}`, { method:"GET" });
      return r.ok;
    } catch { return false; }
  }

  // ----------------- list & load -----------------
  async function loadList(){
    setStatus("Formlar yükleniyor…");
    const r = await fetch(`/api/forms-list?token=${encodeURIComponent(store.token)}`).catch(()=>null);
    if (!r || !r.ok) { setStatus("Form listesi alınamadı", true); return; }
    const d = await r.json();
    state.list = d.items || [];
    const sel = qs("#formList");
    sel.innerHTML = `<option value="">— seç —</option>`;
    state.list.forEach(it => sel.append(el("option", { value: it.slug }, `${it.slug} — ${it.title || ""}`)));
    setStatus("Hazır");
  }

  async function onLoadSelected(){
    const s = qs("#formList").value;
    if (!s) return;
    await loadForm(s);
  }
  async function loadForm(slug){
    setStatus(`Yükleniyor: ${slug}…`);
    const r = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`).catch(()=>null);
    if (!r || !r.ok) { setStatus("Form okunamadı", true); return; }
    const d = await r.json();
    if (!d?.ok || !d.form) { setStatus("Form bulunamadı", true); return; }

    const f = d.form;
    state.slug        = f.slug;
    state.title       = f.title || "";
    state.description = f.description || "";
    state.active      = !!f.active;
    state.questions   = Array.isArray(f.schema?.questions) ? clone(f.schema.questions) : [];

    // meta + builder doldur
    qs("#title").value = state.title;
    qs("#desc").value = state.description;
    qs("#active").value = state.active ? "true" : "false";
    qs("#meta").style.display = "";
    qs("#builder").style.display = "";
    renderQuestions();
    setStatus(`Yüklendi: ${slug}`);
  }

  function onCreateNew(){
    const slug = prompt("Yeni form için slug (örn: blkhizmet)");
    if (!slug) return;
    state.slug = slug.trim();
    state.title = "";
    state.description = "";
    state.active = true;
    state.questions = [];
    qs("#title").value = "";
    qs("#desc").value  = "";
    qs("#active").value = "true";
    qs("#meta").style.display = "";
    qs("#builder").style.display = "";
    renderQuestions();
    setStatus(`Yeni form: ${state.slug}`);
  }

  // ----------------- builder -----------------
  function renderQuestions(){
    const host = qs("#qList"); host.innerHTML = "";
    if (!state.questions.length) {
      host.append(el("div", { class:"muted" }, "Henüz soru yok. “+ Soru ekle” ile başlayın."));
      return;
    }
    state.questions.forEach((q, i) => host.append(renderRow(q, i)));
  }

  function renderRow(q, i){
    const row = el("div", { class:"card" },
      el("div", { class:"qrow" },
        // etiket
        el("div", { class:"col" },
          el("label", {}, `Soru ${i+1} — Etiket`),
          el("input", { class:"input", value:q.label||"", oninput:e=>{ q.label = e.target.value; } })
        ),
        // tip
        el("div", { class:"col" },
          el("label", {}, "Tip"),
          el("select", { class:"input", onchange:e=>{ q.type=e.target.value; if(!needsOptions(q.type)){ delete q.options; delete q.other; } renderQuestions(); } },
            opt("text", q.type), opt("textarea", q.type), opt("radio", q.type),
            opt("checkbox", q.type), opt("select", q.type)
          )
        ),
        // required
        el("div", { class:"col" },
          el("label", {}, "Zorunlu mu?"),
          el("select", { class:"input", onchange:e=>{ q.required = (e.target.value==="true"); } },
            el("option", { value:"true", selected:q.required?"selected":null }, "Evet"),
            el("option", { value:"false", selected:!q.required?"selected":null }, "Hayır")
          )
        ),
        // Diğer şıkkı (yalnız radio/checkbox)
        el("div", { class:"col" },
          el("label", {}, "Diğer şıkkı"),
          (q.type==="radio" || q.type==="checkbox")
            ? el("select", { class:"input", onchange:e=>{ q.other = (e.target.value==="true"); } },
                el("option", { value:"false", selected: q.other? null : "selected" }, "Yok"),
                el("option", { value:"true",  selected: q.other? "selected" : null }, "Var")
              )
            : el("div", { class:"muted" }, "—")
        ),
        // araçlar
        el("div", { class:"row", style:"justify-content:flex-end" },
          el("button", { class:"btn small ghost", onclick: ()=>move(i,-1) }, "↑"),
          el("button", { class:"btn small ghost", onclick: ()=>move(i, 1) }, "↓"),
          el("button", { class:"btn small ghost", onclick: ()=>dup(i) }, "Kopyala"),
          el("button", { class:"btn small",       onclick: ()=>del(i) }, "Sil")
        ),

        // seçenekler alanı
        needsOptions(q.type)
          ? el("div", { class:"col full" },
              el("label", {}, "Seçenekler (her satır bir seçenek)"),
              el("textarea", { class:"input", rows:"4", oninput:e=>{ q.options = splitLines(e.target.value); } }, joinLines(q.options||[])),
              (q.type==="select" ? el("div", { class:"muted" }, "Not: Uygulamada SELECT için otomatik 'Seçiniz…' placeholder eklenir.") : null)
            )
          : null
      )
    );
    return row;
  }
  function opt(v, cur){ return el("option", { value:v, selected: cur===v ? "selected" : null }, v); }
  function move(i,d){ const j=i+d; if(j<0||j>=state.questions.length) return; const t=state.questions[i]; state.questions[i]=state.questions[j]; state.questions[j]=t; renderQuestions(); }
  function dup(i){ state.questions.splice(i+1,0,clone(state.questions[i])); renderQuestions(); }
  function del(i){ state.questions.splice(i,1); renderQuestions(); }
  function addQuestion(){ state.questions.push({ type:"radio", label:"Yeni Soru", required:true, options:["Evet","Hayır"], other:false }); renderQuestions(); }

  // ----------------- save / import / export -----------------
  async function onSave(){
    if (!state.slug) { alert("Önce mevcut formu yükleyin veya yeni oluşturun."); return; }
    setStatus("Kaydediliyor…");
    const payload = {
      slug: state.slug,
      title: state.title,
      description: state.description,
      active: !!state.active,
      schema: {
        title: state.title,
        description: state.description,
        questions: state.questions.map(q => normalizeQuestion(q))
      }
    };
    const r = await fetch(`/api/forms-admin?token=${encodeURIComponent(store.token)}`, {
      method:"POST",
      headers:{ "content-type":"application/json" },
      body: JSON.stringify(payload)
    }).catch(()=>null);
    if (!r || !r.ok) { setStatus("Kaydetme HATASI", true); return; }
    setStatus("Kaydedildi");
    // listeyi tazele
    loadList().catch(()=>{});
  }

  function normalizeQuestion(q){
    const out = { type: q.type || "text", label: q.label || "", required: !!q.required };
    if (needsOptions(q.type)) {
      out.options = Array.isArray(q.options) ? q.options : [];
      if ((q.type==="radio" || q.type==="checkbox") && q.other === true) out.other = true; // sadece işaretlenmişse
    }
    return out;
  }

  function onExport(){
    if (!state.slug) { alert("Önce bir form yükleyin/oluşturun."); return; }
    const data = {
      slug: state.slug,
      title: state.title,
      description: state.description,
      active: !!state.active,
      schema: { title: state.title, description: state.description, questions: state.questions }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href:url, download: (state.slug||"form") + ".json" });
    document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  function onImport(){
    const inp = el("input", { type:"file", accept:"application/json" });
    inp.addEventListener("change", async ()=>{
      const f = inp.files[0]; if (!f) return;
      const txt = await f.text().catch(()=>null); if (!txt) return;
      try{
        const j = JSON.parse(txt);
        state.slug        = j.slug || state.slug || "";
        state.title       = j.title || j.schema?.title || "";
        state.description = j.description || j.schema?.description || "";
        state.active      = !!(j.active ?? true);
        state.questions   = Array.isArray(j.schema?.questions) ? j.schema.questions :
                            (Array.isArray(j.questions) ? j.questions : []);
        qs("#title").value = state.title;
        qs("#desc").value  = state.description;
        qs("#active").value = state.active ? "true" : "false";
        qs("#meta").style.display = "";
        qs("#builder").style.display = "";
        renderQuestions();
        setStatus("JSON içe alındı");
      }catch{ setStatus("JSON okunamadı", true); }
    }, { once:true });
    inp.click();
  }

  // ----------------- status -----------------
  function setStatus(msg, err){
    const s = qs("#stat"); if (!s) return;
    s.textContent = msg;
    s.className = "badge " + (err ? "err" : "ok");
    setTimeout(()=>{ s.className="badge muted"; s.textContent="Hazır"; }, 2500);
  }
})();
