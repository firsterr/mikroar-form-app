// MikroAR Admin — SAFE FINAL: login gate + builder + sticky bar + toast + inline addQuestion
(function () {
  const app = document.getElementById("app");

  // ---------- helpers (compatible & safe) ----------
  function el(tag, attrs /*, ...children */) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (k === "class") node.className = v;
        else if (k === "style") node.style.cssText = v;
        else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
        else if (v !== null && v !== undefined) node.setAttribute(k, v);
      }
    }
    const isStyleOrScript = node.tagName === "STYLE" || node.tagName === "SCRIPT";
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null) continue;
      if (typeof c === "string") {
        if (isStyleOrScript) node.appendChild(document.createTextNode(c));
        else node.insertAdjacentHTML("beforeend", c);
      } else if (Array.isArray(c)) {
        for (let j = 0; j < c.length; j++) if (c[j]) node.appendChild(c[j]);
      } else {
        node.appendChild(c);
      }
    }
    return node;
  }
  const qs  = (s, r=document) => r.querySelector(s);
  const clone = o => JSON.parse(JSON.stringify(o));
  const needsOptions = (t) => t==="radio" || t==="checkbox" || t==="select";
  const splitLines = s => String(s||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const joinLines  = a => (a||[]).join("\n");

  const store = {
    get token(){ return localStorage.getItem("ADMIN_TOKEN") || ""; },
    set token(v){ localStorage.setItem("ADMIN_TOKEN", v || ""); }
  };

  // ---------- state ----------
  let state = {
    authed: false,
    token: "",
    list: [],
    slug: "",
    title: "",
    description: "",
    active: true,
    questions: [],
    saving: false
  };

  // ---------- boot with error boundary ----------
  document.addEventListener("DOMContentLoaded", init);

  function safeMount(builder) {
    try {
      app.innerHTML = "";
      app.appendChild(builder());
    } catch (e) {
      console.error("Admin UI crash:", e);
      app.innerHTML = "";
      app.appendChild(el("div", {},
        el("style", {}, `
          .shell{max-width:860px;margin:64px auto;padding:0 16px;font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
          .card{border:1px solid #e5e7eb;border-radius:16px;padding:16px}
          .btn{padding:10px 14px;border:1px solid #111;background:#111;color:#fff;border-radius:12px;cursor:pointer}
          .err{color:#b00020;margin-top:8px}
        `),
        el("div", { class:"shell" },
          el("div", { class:"card" },
            el("h3", {}, "Beklenmeyen bir hata oluştu"),
            el("div", { class:"err" }, "Arayüz render edilirken istisna yakalandı. Konsolu kontrol edin."),
            el("div", { style:"margin-top:10px;display:flex;gap:8px" },
              el("button", { class:"btn", onclick: ()=>renderLogin("Lütfen tekrar giriş yapın.") }, "Geri dön"),
              el("button", { class:"btn", onclick: ()=>location.reload() }, "Sayfayı yenile")
            )
          )
        )
      ));
    }
  }

  async function init(){
    renderLogin();
    const cached = store.token;
    if (cached && qs("#tokenInput")) qs("#tokenInput").value = cached;
  }

  // ---------- LOGIN VIEW ----------
  function buildLogin(){
    return el("div", {},
      el("style", {}, `
        :root{ --fg:#111; --muted:#6b7280; --bd:#e5e7eb; --accent:#111; }
        body{ font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:#fff; color:var(--fg) }
        .shell{ max-width:860px; margin:64px auto; padding:0 16px }
        .title{ font-weight:800; font-size:32px; text-align:center; margin:24px 0 32px }
        .card{ border:1px solid var(--bd); border-radius:16px; padding:16px; }
        .col{ display:flex; flex-direction:column; gap:8px; }
        .input{ padding:12px; border:1px solid var(--bd); border-radius:12px; width:100%; }
        .btn{ padding:12px 16px; border:1px solid var(--accent); background:var(--accent); color:#fff; border-radius:12px; cursor:pointer }
        .muted{ color:var(--muted) }
        .error{ color:#b00020; margin-top:8px }
      `),
      el("div", { class:"shell" },
        el("div", { class:"title" }, "Anket Oluştur / Düzenle"),
        el("div", { class:"card", style:"max-width:680px; margin:0 auto;" },
          el("div", { class:"col" },
            el("label", {}, "ADMIN_TOKEN"),
            el("input", { id:"tokenInput", class:"input", type:"password", placeholder:"ADMIN_TOKEN", value:store.token||"" }),
            el("div", { style:"display:flex; justify-content:flex-end" },
              el("button", { class:"btn", onclick: onLogin }, "Giriş")
            ),
            el("div", { id:"loginMsg", class:"muted" }, "Yalnızca ADMIN_TOKEN ile giriş yapılır.")
          )
        )
      )
    );
  }
  function renderLogin(msg){
    safeMount(buildLogin);
    if (msg) {
      const m = qs("#loginMsg");
      if (m) { m.textContent = msg; m.className = /hata|doğrulanamadı/i.test(msg) ? "error" : "muted"; }
    }
    const cached = store.token; if (cached && qs("#tokenInput")) qs("#tokenInput").value = cached;
  }

  // ---------- APP VIEW ----------
  function buildApp(){
    return el("div", {},
      el("style", {}, `
        :root{ --fg:#111; --muted:#6b7280; --bd:#e5e7eb; --accent:#111; }
        body{ font:14px system-ui,-apple-system,Segoe UI,Roboto,sans-serif; color:var(--fg) }
        .shell{ max-width:1100px; margin:24px auto; padding:0 16px }
        .topbar{ display:flex; justify-content:space-between; align-items:center; margin:8px 0 16px }
        .title{ font-weight:800; font-size:24px }
        .btn{ padding:10px 14px; border:1px solid var(--accent); background:var(--accent); color:#fff; border-radius:12px; cursor:pointer }
        .btn.ghost{ background:#fff; color:var(--accent) }
        .btn.small{ padding:8px 10px; font-size:12px }
        .btn.loading{ opacity:.7; pointer-events:none; position:relative }
        .btn.loading::after{ content:""; position:absolute; right:10px; top:50%; width:14px; height:14px; margin-top:-7px; border:2px solid rgba(255,255,255,.7); border-top-color:#fff; border-radius:50%; animation:spin .9s linear infinite }
        @keyframes spin{ to { transform:rotate(360deg) } }
        .badge{ border:1px solid var(--bd); border-radius:999px; padding:2px 10px; font-size:12px }
        .ok{ color:#065f46 } .err{ color:#b00020 } .muted{ color:var(--muted) }
        .card{ border:1px solid var(--bd); border-radius:14px; padding:12px; margin:12px 0 }
        .row{ display:flex; gap:10px; align-items:center; }
        .col{ display:flex; flex-direction:column; gap:6px; }
        .input, textarea, select{ padding:10px 12px; border:1px solid var(--bd); border-radius:12px; width:100%; }
        .grid2{ display:grid; grid-template-columns:1fr 1fr; gap:12px }
        .qrow{ display:grid; grid-template-columns: 1fr 120px 120px 120px auto; gap:10px; align-items:start }
        .qrow .full{ grid-column:1/-1 }
        @media (max-width:980px){ .qrow{ grid-template-columns:1fr } }
        .actionbar{ position:fixed; left:0; right:0; bottom:0; padding:10px 16px calc(10px + env(safe-area-inset-bottom)); background:linear-gradient(to top, rgba(250,250,250,.98), rgba(250,250,250,.88)); border-top:1px solid var(--bd); display:flex; gap:10px; justify-content:center; z-index:50; backdrop-filter:saturate(1.1) blur(6px) }
        .spacer{ height:80px }
        .toast{ position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#111; color:#fff; padding:10px 14px; border-radius:12px; z-index:60; box-shadow:0 6px 20px rgba(0,0,0,.16); opacity:0; pointer-events:none; transition:.25s opacity,.25s transform }
        .toast.show{ opacity:1; transform:translateX(-50%) translateY(-4px) }
      `),
      el("div", { class:"shell" },

        // Topbar
        el("div", { class:"topbar" },
          el("div", { class:"title" }, "MikroAR Admin"),
          el("div", { class:"row" },
            el("span", { id:"stat", class:"badge muted" }, "Hazır"),
            el("button", { class:"btn ghost", onclick: onClearEditor }, "Ekranı Boşalt"),
            el("button", { class:"btn ghost", onclick: onLogout }, "Çıkış")
          )
        ),

        // Liste + oluştur
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

        // Meta
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

        // Builder
        el("div", { id:"builder", class:"card", style:"display:none" },
          el("div", { style:"display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;" },
            el("b", {}, "Sorular"),
            el("div", { class:"row" },
              el("button", { class:"btn small ghost", onclick: onImport }, "JSON içe al"),
              el("button", { class:"btn small ghost", onclick: onExport }, "JSON dışa ver"),
              // 🔧 addQuestion referansı yerine inline handler (scope sorunu biter)
              el("button", { class:"btn small", onclick: ()=>{ 
                state.questions.push({ type:"radio", label:"Yeni Soru", required:true, options:["Evet","Hayır"], other:false });
                renderQuestions();
              } }, "+ Soru ekle")
            )
          ),
          el("div", { id:"qList" })
        ),

        el("div", { class:"spacer" })
      ),

      // Sticky action bar
      el("div", { id:"actionbar", class:"actionbar", style:"display:none" },
        el("button", { id:"saveBtn", class:"btn", onclick: onSave }, "Kaydet / Yayınla"),
        el("button", { class:"btn ghost", onclick: onClearEditor }, "Ekranı Boşalt")
      ),

      // Toast
      el("div", { id:"toast", class:"toast" }, "Kaydedildi ✓")
    );
  }
  function renderApp(){ safeMount(buildApp); loadList().catch(()=> setStatus("Liste alınamadı", true)); }

  // ---------- login flow ----------
  async function onLogin(){
    const token = (qs("#tokenInput")?.value || "").trim();
    if (!token) return setLoginMsg("Token gerekli");
    setLoginMsg("Doğrulanıyor…");
    const ok = await testToken(token);
    if (!ok) return setLoginMsg("Yetki doğrulanamadı (401).");
    store.token = token; state.token = token; state.authed = true;
    renderApp();
  }
  function onLogout(){
    store.token = "";
    state = { authed:false, token:"", list:[], slug:"", title:"", description:"", active:true, questions:[], saving:false };
    renderLogin("Çıkış yapıldı.");
  }
  function setLoginMsg(m){ const n=qs("#loginMsg"); if(n){ n.textContent=m; n.className = /doğrulanıyor/i.test(m) ? "muted" : (/hata|yetki|gerekli/i.test(m) ? "error" : "muted"); } }
  async function testToken(token){
    try { const r = await fetch(`/api/forms-list?token=${encodeURIComponent(token)}`); return r.ok; } catch { return false; }
  }

  // ---------- list & load ----------
  async function loadList(){
    setStatus("Formlar yükleniyor…");
    const r = await fetch(`/api/forms-list?token=${encodeURIComponent(store.token)}`).catch(()=>null);
    if (!r || !r.ok) { setStatus("Form listesi alınamadı", true); return; }
    const d = await r.json();
    state.list = d.items || [];
    const sel = qs("#formList");
    sel.innerHTML = `<option value="">— seç —</option>`;
    for (let i=0;i<state.list.length;i++){
      const it = state.list[i];
      sel.appendChild(el("option", { value: it.slug }, `${it.slug} — ${it.title || ""}`));
    }
    setStatus("Hazır");
  }
  async function onLoadSelected(){ const s = qs("#formList")?.value; if (!s) return; await loadForm(s); }
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

    qs("#title").value = state.title;
    qs("#desc").value = state.description;
    qs("#active").value = state.active ? "true" : "false";
    qs("#meta").style.display = "";
    qs("#builder").style.display = "";
    qs("#actionbar").style.display = "";
    renderQuestions();
    setStatus(`Yüklendi: ${slug}`);
  }

  function onCreateNew(){
    const slugInp = qs("#newSlug");
    const slug = (slugInp && slugInp.value ? slugInp.value.trim() : "") || prompt("Yeni form için slug (örn: blkhizmet)");
    if (!slug) return;
    state.slug = slug; state.title = ""; state.description = ""; state.active = true; state.questions = [];
    qs("#title").value = ""; qs("#desc").value  = ""; qs("#active").value = "true";
    qs("#meta").style.display = ""; qs("#builder").style.display = ""; qs("#actionbar").style.display = "";
    renderQuestions();
    setStatus(`Yeni form: ${state.slug}`);
  }

  // ---------- builder ----------
  function renderQuestions(){
    const host = qs("#qList"); host.innerHTML = "";
    if (!state.questions.length) {
      host.appendChild(el("div", { class:"muted" }, "Henüz soru yok. “+ Soru ekle” ile başlayın."));
      return;
    }
    for (let i=0;i<state.questions.length;i++) host.appendChild(renderRow(state.questions[i], i));
  }

  function renderRow(q, i){
    return el("div", { class:"card" },
      el("div", { class:"qrow" },
        el("div", { class:"col" },
          el("label", {}, `Soru ${i+1} — Etiket`),
          el("input", { class:"input", value:q.label||"", oninput:e=>{ q.label = e.target.value; } })
        ),
        el("div", { class:"col" },
          el("label", {}, "Tip"),
          el("select", { class:"input", onchange:e=>{ q.type=e.target.value; if(!needsOptions(q.type)){ delete q.options; delete q.other; } renderQuestions(); } },
            opt("text", q.type), opt("textarea", q.type), opt("radio", q.type),
            opt("checkbox", q.type), opt("select", q.type)
          )
        ),
        el("div", { class:"col" },
          el("label", {}, "Zorunlu mu?"),
          el("select", { class:"input", onchange:e=>{ q.required = (e.target.value==="true"); } },
            el("option", { value:"true", selected:q.required?"selected":null }, "Evet"),
            el("option", { value:"false", selected:!q.required?"selected":null }, "Hayır")
          )
        ),
        el("div", { class:"col" },
          el("label", {}, "Diğer şıkkı"),
          (q.type==="radio" || q.type==="checkbox")
            ? el("select", { class:"input", onchange:e=>{ q.other = (e.target.value==="true"); } },
                el("option", { value:"false", selected: q.other? null : "selected" }, "Yok"),
                el("option", { value:"true",  selected: q.other? "selected" : null }, "Var")
              )
            : el("div", { class:"muted" }, "—")
        ),
        el("div", { class:"row", style:"justify-content:flex-end" },
          el("button", { class:"btn small ghost", onclick: ()=>move(i,-1) }, "↑"),
          el("button", { class:"btn small ghost", onclick: ()=>move(i, 1) }, "↓"),
          el("button", { class:"btn small ghost", onclick: ()=>dup(i) }, "Kopyala"),
          el("button", { class:"btn small",       onclick: ()=>del(i) }, "Sil")
        ),
        needsOptions(q.type)
          ? el("div", { class:"col full" },
              el("label", {}, "Seçenekler (her satır bir seçenek)"),
              el("textarea", { class:"input", rows:"4", oninput:e=>{ q.options = splitLines(e.target.value); } }, joinLines(q.options||[])),
              (q.type==="select" ? el("div", { class:"muted" }, "Not: Uygulamada SELECT için otomatik 'Seçiniz…' placeholder eklenir.") : null)
            )
          : null
      )
    );
  }
  function opt(v, cur){ return el("option", { value:v, selected: cur===v ? "selected" : null }, v); }
  function move(i,d){ const j=i+d; if(j<0||j>=state.questions.length) return; const t=state.questions[i]; state.questions[i]=state.questions[j]; state.questions[j]=t; renderQuestions(); }
  function dup(i){ state.questions.splice(i+1,0,clone(state.questions[i])); renderQuestions(); }
  function del(i){ state.questions.splice(i,1); renderQuestions(); }

  // ---------- save / import / export ----------
  async function onSave(){
    if (!state.slug) { toast("Önce mevcut formu yükleyin veya yeni oluşturun."); return; }
    if (state.saving) return;
    state.saving = true;
    const btn = qs("#saveBtn"); if (btn) btn.classList.add("loading");
    setStatus("Kaydediliyor…");

    const payload = {
      slug: state.slug,
      title: state.title,
      description: state.description,
      active: !!state.active,
      schema: { title: state.title, description: state.description,
        questions: state.questions.map(q => normalizeQuestion(q)) }
    };

    const r = await fetch(`/api/forms-admin?token=${encodeURIComponent(store.token)}`, {
      method:"POST", headers:{ "content-type":"application/json" }, body: JSON.stringify(payload)
    }).catch(()=>null);

    state.saving = false; if (btn) btn.classList.remove("loading");

    if (!r || !r.ok) { setStatus("Kaydetme HATASI", true); toast("Kaydedilemedi. Tekrar deneyin."); return; }
    setStatus("Kaydedildi"); toast("Kaydedildi ✓");
  }
  function normalizeQuestion(q){
    const out = { type: q.type || "text", label: q.label || "", required: !!q.required };
    if (needsOptions(q.type)) {
      out.options = Array.isArray(q.options) ? q.options : [];
      if ((q.type==="radio" || q.type==="checkbox") && q.other === true) out.other = true;
    }
    return out;
  }
  function onExport(){
    if (!state.slug) { toast("Önce bir form yükleyin/oluşturun."); return; }
    const data = { slug: state.slug, title: state.title, description: state.description,
      active: !!state.active, schema: { title: state.title, description: state.description, questions: state.questions } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href:url, download: (state.slug||"form") + ".json" }); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast("JSON dışa verildi");
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
        qs("#title").value = state.title; qs("#desc").value  = state.description; qs("#active").value = state.active ? "true" : "false";
        qs("#meta").style.display = ""; qs("#builder").style.display = ""; qs("#actionbar").style.display = "";
        renderQuestions(); setStatus("JSON içe alındı"); toast("İçe aktarıldı");
      }catch{ setStatus("JSON okunamadı", true); toast("JSON okunamadı"); }
    }, { once:true });
    inp.click();
  }

  // ---------- clear editor ----------
  function onClearEditor(){
    state.slug = ""; state.title=""; state.description=""; state.active=true; state.questions=[];
    if (qs("#title")) qs("#title").value = "";
    if (qs("#desc"))  qs("#desc").value  = "";
    if (qs("#active")) qs("#active").value = "true";
    qs("#meta").style.display = "none";
    qs("#builder").style.display = "none";
    qs("#actionbar").style.display = "none";
    setStatus("Ekran boşaltıldı"); toast("Ekran boşaltıldı"); window.scrollTo({ top:0, behavior:"smooth" });
  }

  // ---------- status & toast ----------
  function setStatus(msg, err){
    const s = qs("#stat"); if (!s) return;
    s.textContent = msg;
    s.className = "badge " + (err ? "err" : "ok");
    clearTimeout(setStatus._t);
    setStatus._t = setTimeout(()=>{ s.className="badge muted"; s.textContent="Hazır"; }, 2500);
  }
  function toast(msg){
    const t = qs("#toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(()=> t.classList.remove("show"), 2200);
  }
})();
