(function(){
  const els = {
    gate:  document.getElementById("gate"),
    panel: document.getElementById("panel"),
    list:  document.getElementById("list"),
    token: document.getElementById("token"),
    login: document.getElementById("login"),
    status:document.getElementById("status"),

    slug:  document.getElementById("slug"),
    title: document.getElementById("title"),
    active:document.getElementById("active"),
    desc:  document.getElementById("desc"),

    addQ:  document.getElementById("addQ"),
    qList: document.getElementById("qList"),
    schema:document.getElementById("schema"),

    save:  document.getElementById("save"),
    save2: document.getElementById("save2"),
    newBtn:document.getElementById("new"),
    preview:document.getElementById("preview"),
  };

  // ---------- Auth / Load ----------
  els.login.addEventListener("click", async () => {
    els.status.textContent = "Doğrulanıyor…";
    const ok = await refreshList(true);
    els.status.textContent = ok ? "Hazır" : "Yetki yok";
    els.gate.style.display  = ok ? "none" : "block";
    els.panel.style.display = ok ? "flex" : "none";
  });

  async function refreshList(showErr) {
    const t = token();
    const r = await fetch(`/api/forms-list?token=${encodeURIComponent(t)}`, {
      headers: { "x-admin-token": t }
    });
    if (!r.ok) { if (showErr) alert("Admin yetkisi doğrulanamadı (401)"); return false; }
    const data = await r.json();
    renderList(data.items || []);
    return true;
  }

  function renderList(items) {
    els.list.innerHTML = "";
    for (const f of items) {
      const div = document.createElement("div");
      div.className = "item";
      div.textContent = `${f.slug} — ${fixUtf(f.title || "")} ${f.active ? "(aktif)" : "(pasif)"}`;
      div.addEventListener("click", () => loadForm(f.slug));
      els.list.appendChild(div);
    }
  }

  async function loadForm(slug) {
    const t = token();
    const r = await fetch(`/api/forms-admin?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(t)}`, {
      headers: { "x-admin-token": t }
    });
    const data = await r.json();
    if (!r.ok) return alert("Hata: " + (data.error || r.status));
    const form = data.form || {};
    els.slug.value   = form.slug || "";
    els.title.value  = fixUtf(form.title || "");
    els.active.value = form.active ? "true" : "false";
    els.desc.value   = form.description || "";
    const schema = form.schema || { questions: [] };
    syncBuilderFromSchema(schema);
    syncJson();
  }

  els.newBtn.addEventListener("click", () => {
    els.slug.value=""; els.title.value=""; els.active.value="true"; els.desc.value="";
    syncBuilderFromSchema({ questions: [] }); syncJson();
  });

  els.preview.addEventListener("click", () => {
    const s = (els.slug.value || "").trim();
    if (!s) return alert("Önizleme için slug girin.");
    window.open(`/form.html?slug=${encodeURIComponent(s)}`, "_blank");
  });

  // ---------- Builder ----------
  els.addQ.addEventListener("click", () => addQuestionCard());

  function addQuestionCard(q = { type:"radio", label:"Yeni soru", required:false, options:["Seçenek 1","Seçenek 2"] }){
    const idx = els.qList.children.length;
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.index = idx;

    card.innerHTML = `
      <div class="card-head">
        <div class="toolbar">
          <span class="chip">Soru #<span class="q-ix">${idx+1}</span></span>
          <select class="q-type">
            <option value="radio">Tek seçim</option>
            <option value="checkbox">Çoklu seçim</option>
            <option value="select">Açılır liste</option>
            <option value="text">Metin</option>
            <option value="textarea">Uzun metin</option>
            <option value="number">Sayı</option>
          </select>
          <label class="toolbar" style="gap:6px"><input type="checkbox" class="q-req"> Zorunlu</label>
        </div>
        <div class="toolbar">
          <button class="ghostbtn q-up">⬆︎</button>
          <button class="ghostbtn q-down">⬇︎</button>
          <button class="ghostbtn q-dup">⎘</button>
          <button class="ghostbtn q-del">✕</button>
        </div>
      </div>

      <div class="grid2" style="margin-top:8px">
        <input class="q-id" placeholder="id (opsiyonel)" />
        <input class="q-label" placeholder="soru etiketi *" />
      </div>

      <div class="opts"></div>
    `;

    const $type  = card.querySelector(".q-type");
    const $req   = card.querySelector(".q-req");
    const $id    = card.querySelector(".q-id");
    const $label = card.querySelector(".q-label");
    const $opts  = card.querySelector(".opts");

    $type.value = q.type || "radio";
    $req.checked = !!q.required;
    $id.value = q.id || "";
    $label.value = q.label || "";

    function renderOptions() {
      $opts.innerHTML = "";
      if (!["radio","checkbox","select"].includes($type.value)) return;

      const list = document.createElement("div");
      (q.options || ["Seçenek 1","Seçenek 2"]).forEach((val,i)=>{
        list.appendChild(optionRow(val, i));
      });
      const addBtn = document.createElement("button");
      addBtn.className = "btn secondary";
      addBtn.textContent = "Seçenek ekle";
      addBtn.style.marginTop = "6px";
      addBtn.addEventListener("click",(e)=>{ e.preventDefault(); list.appendChild(optionRow("Yeni seçenek", list.children.length)); syncJson(); });
      $opts.appendChild(list);
      $opts.appendChild(addBtn);

      function optionRow(value, i){
        const row = document.createElement("div");
        row.className = "opt-row";
        row.innerHTML = `
          <input class="opt-val" value="${escapeAttr(value)}" />
          <button class="ghostbtn opt-up">⬆︎</button>
          <button class="ghostbtn opt-down">⬇︎</button>
          <button class="ghostbtn opt-del">✕</button>
        `;
        row.querySelector(".opt-up").addEventListener("click",(e)=>{ e.preventDefault(); const p=row.parentNode; const ix=[...p.children].indexOf(row); if(ix>0) p.insertBefore(row,p.children[ix-1]); syncJson(); });
        row.querySelector(".opt-down").addEventListener("click",(e)=>{ e.preventDefault(); const p=row.parentNode; const ix=[...p.children].indexOf(row); if(ix<p.children.length-1) p.insertBefore(p.children[ix+1],row); syncJson(); });
        row.querySelector(".opt-del").addEventListener("click",(e)=>{ e.preventDefault(); row.remove(); syncJson(); });
        row.querySelector(".opt-val").addEventListener("input", syncJson);
        return row;
      }
    }
    renderOptions();

    // Card actions
    card.querySelector(".q-up").addEventListener("click",(e)=>{ e.preventDefault(); moveCard(card,-1); });
    card.querySelector(".q-down").addEventListener("click",(e)=>{ e.preventDefault(); moveCard(card,+1); });
    card.querySelector(".q-dup").addEventListener("click",(e)=>{ e.preventDefault(); duplicateCard(card); });
    card.querySelector(".q-del").addEventListener("click",(e)=>{ e.preventDefault(); card.remove(); renumber(); syncJson(); });

    $type.addEventListener("change",()=>{ q.type=$type.value; renderOptions(); syncJson(); });
    [$id,$label].forEach(el=>el.addEventListener("input", syncJson));
    $req.addEventListener("change", syncJson);

    els.qList.appendChild(card);
    syncJson();

    function moveCard(card, dir){
      const parent = els.qList;
      const ix = [...parent.children].indexOf(card);
      const nx = ix + dir;
      if (nx < 0 || nx >= parent.children.length) return;
      parent.insertBefore(card, dir<0 ? parent.children[nx] : parent.children[nx].nextSibling);
      renumber(); syncJson();
    }
    function duplicateCard(card){
      const data = getCardData(card);
      addQuestionCard(data);
    }
  }

  function renumber(){
    [...els.qList.children].forEach((c,i)=>{ c.dataset.index = i; const el=c.querySelector(".q-ix"); if(el) el.textContent = i+1; });
  }

  function getCardData(card){
    const type   = card.querySelector(".q-type").value;
    const id     = (card.querySelector(".q-id").value || "").trim();
    const label  = (card.querySelector(".q-label").value || "").trim();
    const req    = card.querySelector(".q-req").checked;
    const data = { type, label, required: req };
    if (id) data.id = id;
    if (["radio","checkbox","select"].includes(type)) {
      const opts = [...card.querySelectorAll(".opt-row .opt-val")].map(x=>x.value.trim()).filter(Boolean);
      data.options = opts;
    }
    return data;
  }

  function schemaFromBuilder(){
    const questions = [...els.qList.children].map(getCardData);
    return { questions };
  }

  function syncBuilderFromSchema(schema){
    els.qList.innerHTML = "";
    const qs = Array.isArray(schema.questions) ? schema.questions : [];
    qs.forEach(q => addQuestionCard(q));
    if (!qs.length) addQuestionCard(); // sıfırsa örnek bir kart
  }

  function syncJson(){
    const s = schemaFromBuilder();
    els.schema.value = JSON.stringify(s, null, 2);
  }

  // JSON alanı manuel düzenlenirse → builder'a yaz
  els.schema.addEventListener("input", () => {
    const s = tryJson(els.schema.value) || { questions: [] };
    syncBuilderFromSchema(s);
  });

  // ---------- Save ----------
  [els.save, els.save2].forEach(btn => btn.addEventListener("click", saveForm));

  async function saveForm(){
    const payload = {
      slug: (els.slug.value || "").trim(),
      title: (els.title.value || "").trim(),
      description: (els.desc.value || "").trim() || null,
      active: els.active.value === "true",
      schema: schemaFromBuilder()
    };
    if (!payload.slug || !payload.title) return alert("slug ve başlık zorunlu");

    const t = token();
    const btns = [els.save, els.save2]; btns.forEach(b=>{ b.disabled=true; b.textContent="Kaydediliyor…"; });
    const res = await fetch(`/api/forms-admin?token=${encodeURIComponent(t)}`, {
      method: "POST",
      headers: { "content-type":"application/json", "x-admin-token": t },
      body: JSON.stringify(payload)
    }).catch(e=>({ ok:false, statusText:String(e) }));

    btns.forEach(b=>{ b.disabled=false; b.textContent="Kaydet"; });
    if (!res || !res.ok) return alert("Kaydetme hatası");

    await refreshList(false);
    alert("Kaydedildi.");
  }

  // ---------- Utils ----------
  function token(){ return els.token.value || ""; }
  function tryJson(s){ try{ return JSON.parse(s) } catch { return null } }
  function fixUtf(str){ try { return decodeURIComponent(escape(str)); } catch { return str; } }
  function escapeAttr(s){ return String(s).replace(/"/g,"&quot;"); }
})();
