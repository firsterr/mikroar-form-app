// public/admin.js — FULL REPLACE
(function () {
  "use strict";
  const $  = (s,r=document)=>r.querySelector(s);
  const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
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
    "metin":"text","text":"text","paragraf":"textarea","textarea":"textarea",
    "e-posta":"email","email":"email","sayı":"number","number":"number"
  };
  const normType = t => TYPE_MAP[String(t||"").toLowerCase().trim()] || "text";

  function toast(msg, err=false){
    const t = el.toast(); if(!t) return alert(msg);
    t.textContent = msg; t.style.display="block"; t.style.color = err ? "#b91c1c" : "#0f766e";
    setTimeout(()=>{ t.style.display="none"; }, 2200);
  }

  // --------- UI
  function makeRow(q, i){
    const row = document.createElement("div");
    row.className = "qrow";
    row.innerHTML = `
      <div class="qgrid">
        <select class="q-type">
          <option value="radio"${q.type==="radio"?" selected":""}>Tek seçim</option>
          <option value="checkbox"${q.type==="checkbox"?" selected":""}>Çoklu seçim</option>
          <option value="select"${q.type==="select"?" selected":""}>Açılır menü</option>
          <option value="text"${q.type==="text"?" selected":""}>Metin</option>
          <option value="textarea"${q.type==="textarea"?" selected":""}>Paragraf</option>
          <option value="email"${q.type==="email"?" selected":""}>E-posta</option>
          <option value="number"${q.type==="number"?" selected":""}>Sayı</option>
        </select>

        <input class="q-name"  placeholder="alan adı" value="${q.name||`soru${i+1}`}" />
        <input class="q-label" placeholder="Soru başlığı" value="${q.label||""}" />
        <input class="q-opts"  placeholder="Seçenekler (virgülle)" value="${Array.isArray(q.options)? q.options.join(", "): ""}" />

        <div class="reqbox">
          <input type="checkbox" class="q-req"${q.required?" checked":""}/>
          <span class="muted">Zorunlu</span>
        </div>

        <button class="q-del">Sil</button>
      </div>
    `;
    const typeSel = $(".q-type", row);
    const optsInp = $(".q-opts", row);

    function syncOptsVisibility(){
      if (["radio","checkbox","select"].includes(typeSel.value)) {
        optsInp.style.display = "block";
      } else {
        optsInp.style.display = "none";
        optsInp.value = "";
      }
    }
    typeSel.addEventListener("change", syncOptsVisibility);
    syncOptsVisibility();

    $(".q-del", row).addEventListener("click", () => row.remove());
    return row;
  }

  function renderQuestions(list){
    const box = el.box(); if(!box) return;
    box.innerHTML = "";
    (list||[]).forEach((q,i)=> box.appendChild(makeRow(q,i)));
  }

  function collectQuestions(){
    return $$("#questions .qrow").map((row, i)=>{
      const type = $(".q-type",row).value;
      const name = $(".q-name",row).value.trim() || `soru${i+1}`;
      const label= $(".q-label",row).value.trim() || `Soru ${i+1}`;
      const required = $(".q-req",row).checked;
      let options = $(".q-opts",row).value;
      if(["radio","checkbox","select"].includes(type)){
        options = options.split(",").map(s=>s.trim()).filter(Boolean);
      } else options = undefined;
      return { type, name, label, required, options };
    });
  }

  // --------- LOAD
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
    const qs  = raw.map((qq,i)=>({
      type: normType(qq.type),
      name: qq.name || `soru${i+1}`,
      label: qq.label || `Soru ${i+1}`,
      required: !!qq.required,
      options: Array.isArray(qq.options) ? qq.options
             : qq.options!=null ? String(qq.options).split(",").map(s=>s.trim()).filter(Boolean)
             : []
    }));
    renderQuestions(qs);
  }

  // --------- SAVE
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

  // --------- Bindings
  document.addEventListener("DOMContentLoaded", ()=>{
    el.btnKey()?.addEventListener("click", ()=>{
      const t = prompt("ADMIN_TOKEN (Netlify env):", localStorage.getItem("admintoken")||"");
      if(t!=null){ localStorage.setItem("admintoken", t); toast("Anahtar kaydedildi"); }
    });

    el.btnLoad()?.addEventListener("click", async ()=>{
      try{ await loadFormBySlug(el.slug()?.value.trim()); toast("Form yüklendi"); }
      catch(e){ toast(e.message || "Bulunamadı", true); }
    });

    el.btnSave()?.addEventListener("click", async ()=>{
      try{ await saveForm(); toast("Kaydedildi"); }
      catch(e){ toast(e.message || "Kaydedilemedi", true); }
    });

    el.btnNew()?.addEventListener("click", ()=>{
      (el.title()||{}).value=""; (el.desc()||{}).value="";
      (el.status()||{}).value="Aktif";
      renderQuestions([]);
    });

    el.btnAddQ()?.addEventListener("click", ()=>{
      const cur = collectQuestions(); cur.push({type:"radio",name:"",label:"",required:false,options:[]});
      renderQuestions(cur);
    });

    renderQuestions([]);
  });
})();
