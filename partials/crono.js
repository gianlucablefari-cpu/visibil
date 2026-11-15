// Cronometro di lavoro in corso: pillola rossa in basso a destra su tutte le pagine del sito,
// solo per Gianluca (sessione admin salvata nel browser). Si avvia dai progetti in admin;
// da qui si vede il tempo che scorre e si può fermare. In admin c'è la stessa pillola nella pagina stessa.
(function () {
  if ((location.pathname.split('/').pop() || '').toLowerCase() === 'admin.html') return;
  const OWNER_ID = '45d74677-8f95-4d75-86a0-c7d9c586d68a';
  const URL_SB = 'https://zmdnuplqgpznryxfooez.supabase.co';
  const KEY_PUB = 'sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L';
  const KEY_SESS = 'sb-zmdnuplqgpznryxfooez-auth-token';

  function sessione() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY_SESS) || 'null');
      const s = d && (d.currentSession || d);
      return s && s.user && s.user.id === OWNER_ID && s.access_token ? s : null;
    } catch (e) { return null; }
  }
  async function api(percorso, opz) {
    const s = sessione(); if (!s) return null;
    const res = await fetch(URL_SB + '/rest/v1/' + percorso, Object.assign({}, opz, {
      headers: Object.assign({ apikey: KEY_PUB, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, (opz && opz.headers) || {})
    }));
    if (!res.ok) return null;
    const t = await res.text(); return t ? JSON.parse(t) : [];
  }

  const css = document.createElement('style');
  css.textContent = `#crono-pill-globale { position: fixed; right: 1rem; bottom: 1rem; z-index: 400; padding: 0.65rem 1rem; border-radius: 100px; background: #B3261E; color: #fff; border: 0; font: 600 0.75rem/1 Inter, system-ui, sans-serif; letter-spacing: 0.02em; box-shadow: 0 8px 24px rgba(0,0,0,0.2); cursor: pointer; font-variant-numeric: tabular-nums; white-space: pre; }
    @media (max-width: 640px) { #crono-pill-globale { bottom: 5rem; right: auto; left: 1rem; } }`;
  document.head.appendChild(css);

  let attivo = null;
  const durata = d => { const s = Math.max(0, Math.floor((Date.now() - new Date(d)) / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function disegna() {
    let el = document.getElementById('crono-pill-globale');
    if (!attivo) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('button'); el.id = 'crono-pill-globale'; el.type = 'button';
      el.title = 'Cronometro in corso: tocca per fermarlo';
      el.onclick = ferma; document.body.appendChild(el);
    }
    el.textContent = `⏱ ${attivo.etichetta}  ${durata(attivo.inizio)}  ■ Ferma`;
  }

  async function carica() {
    if (!sessione()) { attivo = null; disegna(); return; }
    const righe = await api('ore_lavoro?fine=is.null&fonte=eq.vsbl&select=id,user_id,progetto_id,inizio,progetti(titolo)&order=inizio.desc&limit=1');
    if (!righe || !righe.length) { attivo = null; disegna(); return; }
    const r = righe[0];
    let nome = '';
    const cl = await api('clienti?user_id=eq.' + r.user_id + '&select=nome');
    if (cl && cl[0]) nome = cl[0].nome || '';
    attivo = { id: r.id, progetto_id: r.progetto_id, inizio: r.inizio, etichetta: [r.progetti && r.progetti.titolo, nome].filter(Boolean).join(' · ') };
    disegna();
  }

  async function ferma() {
    if (!attivo) return;
    const a = attivo;
    const fine = new Date(); fine.setMilliseconds(0);
    const minuti = Math.round((fine - new Date(a.inizio)) / 60000);
    if (minuti < 1) {
      await api('ore_lavoro?id=eq.' + a.id, { method: 'DELETE' });
    } else {
      const ok = await api('ore_lavoro?id=eq.' + a.id, { method: 'PATCH', body: JSON.stringify({ fine: fine.toISOString(), minuti }) });
      if (ok === null) { alert('Non riesco a fermare il cronometro da qui: aprilo dall\'admin.'); return; }
      if (a.progetto_id) {
        const pr = await api('progetti?id=eq.' + a.progetto_id + '&select=ore_da_saldare');
        const ore = Math.max(0, Math.round(((Number(pr && pr[0] && pr[0].ore_da_saldare) || 0) + minuti / 60) * 100) / 100);
        await api('progetti?id=eq.' + a.progetto_id, { method: 'PATCH', body: JSON.stringify({ ore_da_saldare: ore }) });
      }
    }
    attivo = null; disegna();
  }

  carica();
  setInterval(() => { if (attivo) disegna(); }, 1000);
  setInterval(carica, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carica(); });
})();
