// public/admin.js — FULL REPLACE
(function () {
  "use strict";
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));

  // --- id yoksa name ile de bul ---
  const byIdOrName = id => document.getElementById(id) || document.querySelector(`[name="${id}"]`);

  const el = {
    slug:   ()=> byIdOrName("slug"),
    title:  ()=> byIdOrName("title"),
    desc:   ()=> byIdOrName("desc"),
    status: ()=> byIdOrName("status"),
    btnLoad:()=> byIdOrName("btnLoad"),
    btnSave:()=> byIdOrName("btnSave"),
    btnNew: ()=> byIdOrName("btnNew"),
    btnAddQ:()=> byIdOrName("btnAddQ"),
    toast:  ()=> byIdOrName("toast"),
    btnKey: ()=> byIdOrName("btnKey"),
    box:    ()=> byIdOrName("questions"),
  };

  const TYPE_MAP = {
    "tek seçim":"radio","radio":"radio","single":"radio","tek":"radio",
    "çoklu seçim":"checkbox","checkbox":"checkbox","çoklu":"checkbox",
    "açılır menü":"select","select":"select","dropdown":"select",
    "metin":"text","text":"text",
    "paragraf":"textarea","textarea":"textarea",
    "e-posta":"email","email":"email",
    "sayı":"number","number":"number"
  };
  const normType = t => TYPE_MAP[String(t||"").toLowerCase().trim()] || "text";

  const showToast = (msg, err=false) => {
    const t = el.toast(); if(!t) return alert(msg);
    t.textContent = msg; t.style.display="block"; t.style.color = err ? "#b91c1c" : "#0f766e";
    setTimeout(()=>{ t.style.display="none"; }, 2200);
  };

  // ---- UI render ----
  function renderQuestions(list){
    const box = el.box(); if(!box) return;
    box.innerHTML = "";
    (list||[]).forEach((q,i)=>{
      const row = document.createElement("div");
      row.className = "qrow";
      row.innerHTML = `
        <div class="row" style="display:flex;gap:10px;align-items:center;margin:10px 0">
          <select class="q-type">
            <option value="radio"${q.type==="radio"?" selected":""}>Tek seçim</option>
            <option value="checkbox"${q.type==="checkbox"?" selected":""}>Çoklu seçim</option>
            <option value="select"${q.type==="select"?" selected":""}>Açılır menü</option>
            <option value="text"${q.type==="text"?" selected":""}>Metin</option>
            <option value="textarea"${q.type==="textarea"?" selected":""}>Paragraf</option>
            <option value="email"${q.type==="email"?" selected":""}>E-posta</option>
            <option value="number"${q.type==="number"?" selected":""}>Sayı</option>
          </select>
          <input class="q-name"  placeholder="alan adı" value="${(q.name||`soru${i+1}`)}"/>
          <input class="q-label" placeholder="Soru başlığı" value="${(q.label||"")}"/>
          <label style="display:flex;gap:6px;align-items:center">
            <input type="checkbox" class="q-req"${q.required?" checked":""}/> Zorunlu
          </label>
          <input class="q-opts" placeholder="Seçenekler (virgülle)" value="${Array.isArray(q.options)? q.options.join(", "): ""}"
                 style="flex:1;${["radio","checkbox","select"].includes(q.type)?"":"display:none"}"/>
          <button class="q-del" type="button">Sil</button>
        </div>`;
      el.box().appendChild(row);

      const typeSel = $(".q-type",row);
      const optsInp = $(".q-opts",row);
      typeSel.addEventListener("change",()=>{
        if(["radio","checkbox","select"].includes(typeSel.value)){ optsInp.style.display=""; }
        else { optsInp.style.display="none"; optsInp.value=""; }
      });
      $(".q-del",row).addEventListener("click",()=> row.remove());
    });
  }

  function collectQuestions(){
    return $$("#questions .qrow").map(row=>{
      const type = $(".q-type",row).value;
      const name = $(".q-name",row).value.trim() || undefined;
      const label= $(".q-label",row).value.trim() || "";
      const required = $(".q-req",row).checked;
      let options = $(".q-opts",row).value;
      if(["radio","checkbox","select"].includes(type)){
        options = options.split(",").map(s=>s.trim()).filter(Boolean);
      } else options = undefined;
      return { type, name, label, required, options };
    });
  }

  // ---- gelen soruları normalize et ----
  function normalizeIncoming(q,i){
    const type = normType(q.type);
    let options;
    if (["radio","checkbox","select"].includes(type)) {
      if (Array.isArray(q.options)) options = q.options.map(s=>String(s).trim()).filter(Boolean);
      else if (q.options!=null)     options = String(q.options).split(",").map(s=>s.trim()).filter(Boolean);
      else options = [];
    }
    return {
      type,
      name: (q.name||`soru${i+1}`),
      label: q.label || `Soru ${i+1}`,
      required: !!q.required,
      options
    };
  }

  // ---- LOAD ----
  async function loadFormBySlug(slug){
    if(!slug) throw new Error("Slug gerekli");
    const r = await fetch(`/api/forms?slug=${encodeURIComponent(slug)}`, { headers:{accept:"application/json"} });
    const tx = await r.text();
    let form=null; try{ const j=JSON.parse(tx||"{}"); form=j.form || j.data || (Array.isArray(j)?j[0]:null);}catch{}
    if(!r.ok || !form) throw new Error(`Bulunamadı (HTTP ${r.status})`);

    (el.slug()  ||{}).value = form.slug || "";
    (el.title() ||{}).value = form.title || "";
    (el.desc()  ||{}).value = (form.schema && form.schema.description) || "";
    (el.status()||{}).value = form.active ? "Aktif" : "Pasif";

    const raw = (form.schema && Array.isArray(form.schema.questions)) ? form.schema.questions : [];
    const qs  = raw.map(normalizeIncoming);
    renderQuestions(qs);
  }

  // ---- SAVE ----
  async function saveForm(){
    const payload = {
      slug  : (el.slug()?.value || "").trim(),
      title : (el.title()?.value || "").trim(),
      description: (el.desc()?.value || "").trim(),
      active: (el.status()?.value || "Aktif")==="Aktif",
      schema: { questions: collectQuestions() }
    };
    if(!payload.slug) throw new Error("Slug gerekli");

    const r = await fetch("/api/forms-admin",{
      method:"POST",
      headers:{ "content-type":"application/json", "x-admin-token": localStorage.getItem("admintoken") || "" },
      body: JSON.stringify(payload)
    });
    const txt = await r.text();
    if(!r.ok) throw new Error(txt || "Kaydedilemedi");
    return true;
  }

  // ---- bindings ----
  document.addEventListener("DOMContentLoaded", ()=>{
    // Admin anahtar
    el.btnKey()?.addEventListener("click", ()=>{
      const t = prompt("ADMIN_TOKEN (Netlify env):", localStorage.getItem("admintoken")||"");
      if(t!=null){ localStorage.setItem("admintoken", t); showToast("Anahtar kaydedildi"); }
    });

    el.btnLoad()?.addEventListener("click", async ()=>{
      try{ await loadFormBySlug(el.slug()?.value.trim()); showToast("Form yüklendi"); }
      catch(e){ showToast(e.message || "Bulunamadı", true); }
    });

    el.btnSave()?.addEventListener("click", async ()=>{
      try{ await saveForm(); showToast("Kaydedildi"); }
      catch(e){ showToast(e.message || "Kaydedilemedi", true); }
    });

    el.btnNew()?.addEventListener("click", ()=>{
      (el.title()||{}).value=""; (el.desc()||{}).value=""; (el.status()||{}).value="Aktif";
      renderQuestions([]);
    });

    el.btnAddQ()?.addEventListener("click", ()=>{
      const cur = collectQuestions(); cur.push({type:"radio",name:"",label:"",required:false,options:[]});
      renderQuestions(cur);
    });

    renderQuestions([]);
  });
})();
