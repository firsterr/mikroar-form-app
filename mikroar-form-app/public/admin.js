(function(){
  const els = {
    gate:  document.getElementById("gate"),
    panel: document.getElementById("panel"),
    list:  document.getElementById("list"),
    token: document.getElementById("token"),
    login: document.getElementById("login"),
    slug:  document.getElementById("slug"),
    title: document.getElementById("title"),
    active: document.getElementById("active"),
    schema: document.getElementById("schema"),
    save:  document.getElementById("save")
  };

  // "Yeni" butonu ekle
  const newBtn = document.createElement("button");
  newBtn.textContent = "Yeni";
  newBtn.style.margin = "8px 0";
  newBtn.addEventListener("click", () => {
    els.slug.value = ""; els.title.value = "";
    els.active.value = "true"; els.schema.value = JSON.stringify({ questions: [] }, null, 2);
  });
  document.querySelector(".col:nth-child(2)")?.prepend(newBtn);

  els.login.addEventListener("click", async () => {
    const ok = await refreshList(true);
    els.gate.style.display  = ok ? "none" : "block";
    els.panel.style.display = ok ? "flex" : "none";
  });

  els.save.addEventListener("click", async () => {
    const payload = {
      slug: (els.slug.value || "").trim(),
      title: (els.title.value || "").trim(),
      active: els.active.value === "true",
      schema: tryJson(els.schema.value) || { questions: [] }
    };
    if (!payload.slug || !payload.title) return alert("slug ve başlık zorunlu");
    const t = els.token.value || "";
    const res = await fetch(`/api/forms-admin?token=${encodeURIComponent(t)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": t },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) return alert("Hata: " + (data.error || res.status));
    await refreshList(false);
    alert("Kaydedildi.");
  });

  async function refreshList(showErr) {
    const t = els.token.value || "";
    const r = await fetch(`/api/forms-list?token=${encodeURIComponent(t)}`, {
      headers: { "x-admin-token": t }
    });
    if (!r.ok) {
      if (showErr) alert("Admin yetkisi doğrulanamadı. (401)");
      return false;
    }
    const data = await r.json();
    renderList(data.items || []);
    return true;
  }

  function renderList(items) {
    els.list.innerHTML = "";
    for (const f of items) {
      const div = document.createElement("div");
      div.className = "item";
      // Görüntüde UTF fix (DB’yi değiştirmez)
      const title = fixUtf(f.title || "");
      div.textContent = `${f.slug} — ${title} ${f.active ? "(aktif)" : "(pasif)"}`;
      div.addEventListener("click", () => loadForm(f.slug));
      els.list.appendChild(div);
    }
  }

  async function loadForm(slug) {
    const t = els.token.value || "";
    const r = await fetch(`/api/forms-admin?slug=${encodeURIComponent(slug)}&token=${encodeURIComponent(t)}`, {
      headers: { "x-admin-token": t }
    });
    const data = await r.json();
    if (!r.ok) return alert("Hata: " + (data.error || r.status));

    els.slug.value   = data.form.slug || "";
    els.title.value  = fixUtf(data.form.title || "");
    els.active.value = data.form.active ? "true" : "false";
    els.schema.value = JSON.stringify(data.form.schema || { questions: [] }, null, 2);
  }

  function tryJson(s){ try{ return JSON.parse(s) } catch { return null } }
  function fixUtf(str){
    // moji-bozulma görüntü düzeltmesi (BalÄ±kesir → Balıkesir)
    try { return decodeURIComponent(escape(str)); } catch { return str; }
  }
})();
