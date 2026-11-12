// Striscia fissa in alto che dice a Gianluca come è loggato, su tutte le pagine del sito.
// Legge la sessione Supabase salvata nel browser (nessuna chiamata di rete).
// La vedono solo Gianluca e il dispositivo su cui è già entrato come admin: i visitatori e i clienti no.
(function () {
  const OWNER_ID = '45d74677-8f95-4d75-86a0-c7d9c586d68a';
  const KEY = 'sb-zmdnuplqgpznryxfooez-auth-token';
  const DEVICE = 'visibil_owner_device';
  const H = 30;

  function leggiSessione() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      const s = d && (d.currentSession || d);
      return s && s.user ? s.user : null;
    } catch (e) { return null; }
  }
  function sonoDispositivoOwner() { try { return localStorage.getItem(DEVICE) === '1'; } catch (e) { return false; } }

  const pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const css = document.createElement('style');
  css.textContent = `
    #striscia-login { position: fixed; top: 0; left: 0; right: 0; height: ${H}px; z-index: 300; display: flex; align-items: center; justify-content: center; gap: 0.9rem; padding: 0 0.8rem; font: 600 0.72rem/1 Inter, system-ui, sans-serif; letter-spacing: 0.03em; color: #fff; white-space: nowrap; overflow: hidden; }
    #striscia-login a { color: #fff; text-decoration: underline; }
    #striscia-login .sl-testo { overflow: hidden; text-overflow: ellipsis; }
    body.con-striscia { margin-top: ${H}px !important; }
    body.con-striscia nav, body.con-striscia .app-topbar { top: ${H}px !important; }
  `;
  document.head.appendChild(css);

  let ultimo = '';
  function aggiorna() {
    // In area cliente, a dashboard aperta, c'è già la striscia di anteprima / vista cliente
    if (document.getElementById('banner-ruolo')) { togli(); return; }
    const u = leggiSessione();
    const owner = u && u.id === OWNER_ID;
    if (owner) { try { localStorage.setItem(DEVICE, '1'); } catch (e) {} }
    let stato = null;
    if (owner) {
      stato = pagina === 'admin.html'
        ? { bg: '#0F0F0F', t: '🛠 ADMIN — ' + (u.email || 'Gianluca'), l: [['area-cliente.html', 'Vista cliente'], ['index.html', 'Sito']] }
        : { bg: '#0F0F0F', t: '🔑 Loggato come admin — ' + (u.email || 'Gianluca'), l: [['admin.html', 'Admin'], ['area-cliente.html', 'Vista cliente']] };
    } else if (u && sonoDispositivoOwner()) {
      stato = { bg: '#1A1AE6', t: '👤 Loggato come cliente — ' + (u.email || ''), l: [['area-cliente.html', 'Area cliente'], ['admin.html', 'Admin']] };
    } else if (!u && sonoDispositivoOwner()) {
      stato = { bg: '#8A8A8A', t: '🔒 Non sei loggato', l: [['admin.html', 'Entra in admin'], ['area-cliente.html', 'Area cliente']] };
    }
    const firma = stato ? stato.t + stato.bg : '';
    if (firma === ultimo) return;
    ultimo = firma;
    if (!stato) { togli(); return; }
    let el = document.getElementById('striscia-login');
    if (!el) { el = document.createElement('div'); el.id = 'striscia-login'; document.body.prepend(el); }
    el.style.background = stato.bg;
    el.innerHTML = '<span class="sl-testo"></span>' + stato.l.map(x => `<a href="${x[0]}">${x[1]}</a>`).join('');
    el.querySelector('.sl-testo').textContent = stato.t;
    document.body.classList.add('con-striscia');
  }
  function togli() {
    const el = document.getElementById('striscia-login');
    if (el) el.remove();
    document.body.classList.remove('con-striscia');
    ultimo = '';
  }
  aggiorna();
  setInterval(aggiorna, 1500);
  window.addEventListener('storage', aggiorna);
})();
