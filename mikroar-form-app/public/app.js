(function () {
  const app = document.getElementById("app");
  const skeleton = document.getElementById("skeleton");
  const errorBox = document.getElementById("error");

  window.addEventListener("DOMContentLoaded", boot);

  // /form.html parametresiz ise form yükleme (liste modu var)
  function hasIdent(){
    const u = new URL(location.href);
    if (u.searchParams.get("slug") || u.searchParams.get("k")) return true;
    if (/^\/f\//i.test(location.pathname)) return true;
    return false;
  }

  async function boot() {
    if (!hasIdent()) { skeleton.style.display="none"; errorBox.style.display="none"; app.classList.add("hidden"); return; }
    skeleton.style.display="grid"; errorBox.style.display="none"; app.classList.add("hidden");
    try {
      const { slug, code } = resolveIdent();
      const form = await fetchForm({ slug, code });
      renderForm(form);
      skeleton.style.display="none"; app.classList.remove("hidden");
      focusFirstQuestion();
    } catch {
      skeleton.style.display="none"; errorBox.textContent="Form bulunamadı veya bağlantı sorunu."; errorBox.style.display="block";
    }
  }

  function resolveIdent() {
    const u = new URL(location.href);
    const slug = u.searchParams.get("slug"); if (slug) return { slug, code:null };
    const m = location.pathname.match(/^\/f\/([^/?#]+)/i); if (m && m[1]) return { slug:null, code:m[1] };
    const k = u.searchParams.get("k"); if (k) return { slug:null, code:k };
    return { slug:null, code:null };
  }

  async function fetchForm({ slug, code }) {
    const qs = slug ? `slug=${encodeURIComponent(slug)}` : `k=${encodeURIComponent(code)}`;
    const r = await fetch(`/api/forms?${qs}`, { headers:{ accept:"application/json" }});
    const d = await r.json(); if (!r.ok || !d?.ok) throw new Error("nf");
    return d.form;
  }

  function renderForm(form) {
    const s = form.schema || { questions: [] };
    const q = Array.isArray(s.questions) ? s.questions : [];

    const h = [];
    h.push(`<style>
      .btn { padding:10px 16px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; }
      .btn.loading { opacity:.8; pointer-events:none }
      .btn.shake { animation:shake .4s }
      @keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 40%{transform:translateX(6px)} 60%{transform:translateX(-4px)} 80%{transform:translateX(4px)} }
      .toast { position:sticky; top:0; background:#fff7f7; border:1px solid #ffd3d3; color:#b00020; padding:10px 12px; border-radius:10px; margin-bottom:10px; display:none }
      .q { padding:12px; border-radius:12px; transition:background .2s, box-shadow .2s; scroll-margin-top:120px; }
      .q.focus { background:#f9fafb; box-shadow: inset 0 0 0 2px #e5e7eb; }
      .q.checked { background:#fffef2; box-shadow: inset 0 0 0 2px #fde68a; }
      label { display:block; margin:6px 0; cursor:pointer; }

      /* Ripple */
      .ripple { position:relative; overflow:hidden }
      .ripple span.rip { position:absolute; border-radius:50%; transform:scale(0);
        opacity:.35; background:#fff; pointer-events:none; animation:rip .6s ease-out }
      @keyframes rip { to { transform:scale(12); opacity:0 } }

      /* Sticky submit bar (buton + dipnot birlikte) */
      .submit-bar{
        position:fixed; left:0; right:0; bottom:0;
        padding:10px max(16px, env(safe-area-inset-left)) calc(10px + env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-right));
        background:linear-gradient(to top, rgba(250,250,250,.98), rgba(250,250,250,.88));
        border-top:1px solid #e5e7eb; backdrop-filter:saturate(1.2) blur(6px);
        display:flex; flex-direction:column; align-items:center; gap:8px; z-index:50;
      }
      .submit-meta{ color:#6b7280; font-size:12px; line-height:1.3; text-align:center }
      .submit-meta b{ font-weight:700 }
      /* bar yüksekliği için gövde alt boşluğu */
      body { padding-bottom: 128px }
    </style>`);

    h.push(`<div id="toast" class="toast"></div>`);
    h.push(`<h1>${esc(form.title || "Anket")}</h1>`);
    if (form.description) h.push(`<p>${esc(form.description)}</p>`);
    h.push(`<form id="f" autocomplete="on">`);

    for (let i=0;i<q.length;i++){
      const it=q[i], id=it.id||it.name||it.key||`q${i+1}`, label=it.label||id, required=!!it.required;
      const name=attr(id);
      h.push(`<div class="q" tabindex="-1" data-index="${i}" data-required="${required ? "1":""}" data-name="${name}">
                <div class="field"><div><strong>${esc(label)}</strong></div>`);
      if (it.type==="radio" && Array.isArray(it.options)) {
        for (const opt of it.options){ const val=typeof opt==="string"?opt:opt.value; const txt=typeof opt==="string"?opt:(opt.label||opt.value);
          h.push(`<label><input class="ctl" type="radio" name="${name}" value="${attr(val)}"> ${esc(txt)}</label>`); }
      } else if (it.type==="checkbox" && Array.isArray(it.options)) {
        for (const opt of it.options){ const val=typeof opt==="string"?opt:opt.value; const txt=typeof opt==="string"?opt:(opt.label||opt.value);
          h.push(`<label><input class="ctl" type="checkbox" name="${name}" value="${attr(val)}"> ${esc(txt)}</label>`); }
      } else if (it.type==="select" && Array.isArray(it.options)) {
        h.push(`<label><select class="ctl" name="${name}">`);
        for (const opt of it.options){ const val=typeof opt==="string"?opt:opt.value; const txt=typeof opt==="string"?opt:(opt.label||opt.value);
          h.push(`<option value="${attr(val)}">${esc(txt)}</option>`); }
        h.push(`</select></label>`);
      } else if (it.type==="textarea") {
        h.push(`<label><textarea class="ctl" name="${name}" rows="4"></textarea></label>`);
      } else {
        const t=it.type||"text"; h.push(`<label><input class="ctl" type="${attr(t)}" name="${name}" /></label>`);
      }
      h.push(`<div class="hint" style="display:none;color:#b00020;font-size:12px;margin-top:6px;">Bu soru zorunludur.</div>`);
      h.push(`</div></div>`);
    }

    h.push(`</form>`);

    // Sticky bar: buton + dipnot birlikte
    h.push(`
      <div class="submit-bar">
        <button id="submitBtn" class="btn ripple" type="submit" form="f">Gönder</button>
        <div class="submit-meta">
          Bu form mikroar.com alanında oluşturuldu.<br>
          iletisim@mikroar.com<br>
          <b>Mikroar Formlar</b>
        </div>
      </div>
    `);

    app.innerHTML=h.join("");

    // Etkileşimler
    app.querySelectorAll(".ctl").forEach(el=>{
      el.addEventListener("change",(e)=>{
        const b=e.target.closest(".q"); if(!b) return;
        b.classList.add("checked");
        const next=nextBlock(b); if(next) smoothFocus(next);
        const hint=b.querySelector(".hint"); if(hint) hint.style.display="none";
      });
    });

    document.getElementById("f").addEventListener("submit", onSubmit(form.slug));
    attachRipple(document.getElementById("submitBtn"));
  }

  function onSubmit(formSlug){
    return async (e)=>{
      e.preventDefault();
      const formEl=e.currentTarget, btn=document.getElementById("submitBtn");

      // ÖZEL doğrulama: her basışta ilk eksik bloğa git
      const invalid = findFirstInvalid();
      if (invalid) {
        showInvalidFeedback(btn, invalid);
        return;
      }

      setLoading(btn,true);
      const fd=new FormData(formEl), answers={};
      for (const [k,v] of fd.entries()){
        if (answers[k]!==undefined){ if (Array.isArray(answers[k])) answers[k].push(v); else answers[k]=[answers[k],v]; }
        else { answers[k]=v; }
      }
      const meta={ href:location.href, ua:navigator.userAgent };

      const res = await fetch("/api/responses", {
        method:"POST", headers:{ "content-type":"application/json" },
        body:JSON.stringify({ form_slug:formSlug, answers, meta })
      }).catch(()=>null);

      const reason = res && res.status===409 ? "duplicate" : (res && res.ok ? "ok" : "error");
      sessionStorage.setItem("mikroar_thanks", JSON.stringify({ reason }));
      if (res && (res.ok || res.status===409)) { location.href="/thanks.html"; return; }

      setLoading(btn,false);
      toast("Kaydetme hatası. Lütfen tekrar deneyin.");
    };
  }

  // --- INVALID geri bildirimi ---
  function showInvalidFeedback(btn, block){
    toast("Lütfen zorunlu soruları doldurun.");
    try { if (navigator.vibrate) navigator.vibrate(40); } catch {}
    btn.classList.remove("shake"); void btn.offsetWidth; btn.classList.add("shake");
    const hint = block.querySelector(".hint"); if (hint) hint.style.display="block";
    smoothFocus(block, true);
  }

  // İlk eksik bloğu bul
  function findFirstInvalid(){
    const blocks = Array.from(app.querySelectorAll(".q"));
    for (const b of blocks){
      const req = b.dataset.required==="1"; if (!req) continue;
      const name=b.dataset.name; if(!name) continue;
      const group=b.querySelectorAll(`[name="${cssEscape(name)}"]`); if(!group.length) continue;
      let ok=false;
      for (const el of group){
        const tag=el.tagName.toLowerCase();
        if (tag==="input"){
          if (el.type==="radio") { if (el.checked){ ok=true; break; } }
          else if (el.type==="checkbox"){ if (el.checked){ ok=true; } }
          else { if (el.value && el.value.trim()!==""){ ok=true; } }
        } else if (tag==="select" || tag==="textarea"){
          if (el.value && el.value.trim()!=="") ok=true;
        }
      }
      if (!ok) return b;
    }
    return null;
  }

  // Mobil güvenilir odak + kaydırma
  function smoothFocus(block, focusInput){
    if (!block) return;
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch {}
    const idx = parseInt(block.dataset.index||"0",10)||0;
    try {
      if (idx===0) block.scrollIntoView({ behavior:"smooth", block:"start" });
      else {
        const y=Math.max(0, block.getBoundingClientRect().top + window.scrollY - 120);
        window.scrollTo({ top:y, behavior:"smooth" });
      }
    } catch {
      const y=Math.max(0, block.offsetTop - 120); window.scrollTo(0,y);
    }
    requestAnimationFrame(()=>setTimeout(()=>{
      try { block.focus({ preventScroll:true }); } catch {}
      const el=block.querySelector(".ctl"); if (focusInput && el && typeof el.focus==="function"){ try{ el.focus({ preventScroll:true }); }catch{} }
      const all=Array.from(app.querySelectorAll(".q")); all.forEach(x=>x.classList.remove("focus")); block.classList.add("focus");
    },90));
  }

  function focusFirstQuestion(){ const first=app.querySelector(".q"); if (first) smoothFocus(first); }
  function nextBlock(b){ const all=Array.from(app.querySelectorAll(".q")); const i=all.indexOf(b); return i>=0 && i<all.length-1 ? all[i+1] : null; }

  // Görsel geri bildirimler
  function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.style.display="block"; setTimeout(()=>{ t.style.display="none"; },3000); }
  function setLoading(btn,on){ if(!btn) return; btn.classList.toggle("loading",!!on); btn.textContent = on ? "Gönderiliyor…" : "Gönder"; }

  // Yardımcılar
  function esc(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;' }[m])); }
  function attr(s){ return String(s).replace(/"/g,"&quot;"); }
  function cssEscape(s){ return s.replace(/["\\]/g,"\\$&"); }

  // Ripple
  function attachRipple(btn){
    if (!btn) return;
    btn.addEventListener("pointerdown",(e)=>{
      const r=btn.getBoundingClientRect(); const d=Math.max(r.width,r.height);
      const x=e.clientX-r.left, y=e.clientY-r.top;
      const s=document.createElement("span"); s.className="rip"; s.style.width=s.style.height=d+"px";
      s.style.left=(x-d/2)+"px"; s.style.top=(y-d/2)+"px"; btn.appendChild(s);
      s.addEventListener("animationend",()=>s.remove());
    });
  }
})();
