(function(){
  const els = {
    token: document.getElementById("token"),
    load:  document.getElementById("load"),
    list:  document.getElementById("list"),
    err:   document.getElementById("err")
  };

  els.load.addEventListener("click", async () => {
    const t = els.token.value || "";
    const r = await fetch(`/api/forms-list?token=${encodeURIComponent(t)}`, {
      headers: { "x-admin-token": t }
    });
    if (!r.ok) {
      els.err.textContent = "Yetki doğrulanamadı (401). Token yanlış veya Netlify değişkeni yansımadı.";
      els.err.style.display = "block";
      els.list.innerHTML = "";
      return;
    }
    els.err.style.display = "none";
    const data = await r.json();
    render(data.items || []);
  });

  function render(items){
    els.list.innerHTML = "";
    if (!items.length) { els.list.innerHTML = `<div class="item muted">Kayıt yok</div>`; return; }
    for (const f of items) {
      const slug = f.slug;
      const url  = `/form.html?slug=${encodeURIComponent(slug)}`;
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div><strong>${escapeHtml(f.title || "-")}</strong></div>
          <div class="muted">${slug} • ${f.active ? "aktif" : "pasif"} • ${new Date(f.created_at).toLocaleString("tr-TR")}</div>
        </div>
        <div class="link">${url}</div>
      `;
      els.list.appendChild(div);
    }
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
