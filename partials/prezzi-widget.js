const S = {};
function fmt(n) { return 'CHF ' + n.toLocaleString('de-CH'); }

function toggleCard(card) {
  const id = card.dataset.id;
  card.classList.toggle('active');
  if (!card.classList.contains('active')) { delete S[id]; }
  else {
    const pill = card.querySelector('.cfg-pill.sel');
    const tier = card.querySelector('.cfg-tier.sel');
    if (id === 'strategia') {
      const sel = card.querySelector('.rate-selectable.sel');
      S[id] = { lbl: sel ? sel.dataset.lbl : 'Prima mezz\'ora gratuita', once: sel ? +sel.dataset.once : 0, monthly: 0 };
    } else if (pill && pill.dataset.price !== '0') {
      S[id] = { lbl: pill.dataset.lbl, once: pill.dataset.type==='once'?+pill.dataset.price:0, monthly: pill.dataset.type==='monthly'?+pill.dataset.price:0 };
    } else if (tier) {
      S[id] = { lbl: tier.dataset.lbl, once: +tier.dataset.price, monthly: 0 };
    }
  }
  render();
}

function selPill(e, btn, group) {
  e.stopPropagation();
  const card = btn.closest('.cfg-card');
  card.querySelectorAll('.cfg-pill').forEach(p => p.classList.remove('sel'));
  btn.classList.add('sel');
  const id = card.dataset.id;
  if (id === 'video') {
    const slider = document.getElementById('v-slider');
    slider.style.display = btn.dataset.type === 'monthly' ? 'block' : 'none';
    if (btn.dataset.type === 'monthly') { updSliderVal(4); return; }
  }
  S[id] = { lbl: btn.dataset.lbl, once: btn.dataset.type==='once'?+btn.dataset.price:0, monthly: btn.dataset.type==='monthly'?+btn.dataset.price:0 };
  render();
}

function selTier(e, tier) {
  e.stopPropagation();
  const card = tier.closest('.cfg-card');
  card.querySelectorAll('.cfg-tier').forEach(t => t.classList.remove('sel'));
  tier.classList.add('sel');

  const gest = card.querySelector('.cfg-gest-btn.sel');
  let once = +tier.dataset.price, monthly = 0;
  if (gest) {
    if (gest.dataset.gest === 'self') once += 100;
    if (gest.dataset.gest === 'visibil') monthly = +tier.dataset.monthly;
  }
  S['sito'] = { lbl: tier.dataset.lbl, once, monthly };
  highlightGdCard(tier.dataset.lbl);
  render();
}

function selIgTier(e, tier) {
  e.stopPropagation();
  const card = tier.closest('.cfg-card');
  card.querySelectorAll('.cfg-tier').forEach(t => t.classList.remove('sel'));
  tier.classList.add('sel');
  S['instagram'] = { lbl: 'Instagram ' + tier.dataset.lbl, once: 0, monthly: +tier.dataset.price };
  render();
}
function selVideoTier(e, tier) {
  e.stopPropagation();
  const card = tier.closest('.cfg-card');
  card.querySelectorAll('.cfg-tier').forEach(t => t.classList.remove('sel'));
  tier.classList.add('sel');
  const price = +tier.dataset.price;
  const lbl = tier.dataset.lbl;
  if (price === 0) {
    S['video'] = { lbl: lbl, once: 0, monthly: 0 };
  } else {
    S['video'] = { lbl: lbl, once: price, monthly: 0 };
  }
  render();
}
function selStrategiaRate(e, item) {
  e.stopPropagation();
  const card = item.closest('.cfg-card');
  card.querySelectorAll('.rate-selectable').forEach(r => r.classList.remove('sel'));
  item.classList.add('sel');
  S['strategia'] = { lbl: item.dataset.lbl, once: +item.dataset.once, monthly: 0 };
  render();
}

function selGdCard(e, card, tierKey) {
  e.stopPropagation();
  const sitoCard = document.querySelector('[data-id="sito"]');
  sitoCard.querySelectorAll('.cfg-tier').forEach(t => t.classList.remove('sel'));
  document.querySelectorAll('.gd-card').forEach(c => c.classList.remove('active'));

  const tierMap = { landing: 'Sito Base', completo: 'Sito Completo', avanzato: 'Sito Avanzato' };
  const datiTier = { landing: PREZZI_DATI.siti[0], completo: PREZZI_DATI.siti[1], avanzato: PREZZI_DATI.siti[2] };
  const prices  = { landing: datiTier.landing.once, completo: datiTier.completo.once, avanzato: datiTier.avanzato.once };
  const monthly = { landing: datiTier.landing.monthly, completo: datiTier.completo.monthly, avanzato: datiTier.avanzato.monthly };
  const forms   = { landing: datiTier.landing.formazione, completo: datiTier.completo.formazione, avanzato: datiTier.avanzato.formazione };

  sitoCard.querySelectorAll('.cfg-tier').forEach(t => {
    if (t.dataset.lbl === tierMap[tierKey]) t.classList.add('sel');
  });

  document.querySelectorAll('.gd-card').forEach(c => {
    const name = c.querySelector('.gd-card-name');
    if (name && name.textContent === tierMap[tierKey]) c.classList.add('active');
  });

  const gest = sitoCard.querySelector('.cfg-gest-btn.sel');
  let once = prices[tierKey], mo = 0;
  if (gest) {
    if (gest.dataset.gest === 'self') once += forms[tierKey];
    if (gest.dataset.gest === 'visibil') mo = monthly[tierKey];
  }
  const gestLabel = gest ? (gest.dataset.gest === 'visibil' ? ' (gestito)' : ' + Formazione') : '';
  S['sito'] = { lbl: tierMap[tierKey] + gestLabel, once, monthly: mo };
  render();
}
function highlightGdCard(lbl) {
  document.querySelectorAll('.gd-card').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.gd-card').forEach(c => {
    if (c.querySelector('.gd-card-name') && c.querySelector('.gd-card-name').textContent === lbl) {
      c.classList.add('active');
    }
  });
}

function selGest(e, type) {
  e.stopPropagation();
  const card = e.target.closest('.cfg-card');
  card.querySelectorAll('.cfg-gest-btn').forEach(b => b.classList.remove('sel'));
  e.target.classList.add('sel');
  document.getElementById('gd-self').classList.remove('on');
  document.getElementById('gd-visibil').classList.remove('on');
  const tier = card.querySelector('.cfg-tier.sel');
  const base = tier ? +tier.dataset.price : PREZZI_DATI.siti[0].once;
  const mo = tier ? +tier.dataset.monthly : PREZZI_DATI.siti[0].monthly;
  const lbl = tier ? tier.dataset.lbl : PREZZI_DATI.siti[0].lbl;
  const datiSelezionato = PREZZI_DATI.siti.find(s => s.lbl === lbl) || PREZZI_DATI.siti[0];
  if (type === 'self') {
    document.getElementById('gd-self').classList.add('on');
    S['sito'] = { lbl: lbl + ' + Formazione', once: base + datiSelezionato.formazione, monthly: 0 };
  } else {
    document.getElementById('gd-visibil').classList.add('on');
    S['sito'] = { lbl: lbl + ' (gestito)', once: base, monthly: mo };
  }
  highlightGdCard(lbl);
  render();
}

function videoPrice(n) { if(n<=1) return 290; if(n<=4) return 890; if(n<=8) return 1490; return 1490+(n-8)*290; }
function updSliderVal(n) {
  const price = videoPrice(n);
  document.getElementById('v-n').textContent = n;
  document.getElementById('v-val').textContent = fmt(price);
  S['video'] = { lbl: 'Pack ' + n + ' video/mese', once: 0, monthly: price };
  render();
}
function updSlider(e) { e.stopPropagation(); updSliderVal(+e.target.value); }

function render() {
  let tOnce = 0, tMonthly = 0;
  const onceEl = document.getElementById('sum-once');
  const moEl = document.getElementById('sum-monthly');
  if (!onceEl || !moEl) return;
  const keys = Object.keys(S);
  const onceK = keys.filter(k => S[k].once > 0);
  const moK = keys.filter(k => S[k].monthly > 0);
  onceEl.innerHTML = onceK.length ? onceK.map(k => { tOnce += S[k].once; return `<div class="cfg-sum-item"><span>${S[k].lbl}</span><span>${fmt(S[k].once)}</span></div>`; }).join('') : '<span class="cfg-sum-empty">Nessun costo iniziale</span>';
  moEl.innerHTML = moK.length ? moK.map(k => { tMonthly += S[k].monthly; return `<div class="cfg-sum-item"><span>${S[k].lbl}</span><span>${fmt(S[k].monthly)}/mese</span></div>`; }).join('') : '<span class="cfg-sum-empty">Nessun costo mensile</span>';
  document.getElementById('tot-once').innerHTML = fmt(tOnce);
  document.getElementById('tot-monthly').innerHTML = fmt(tMonthly) + '<span style="font-size:0.7rem;font-weight:400;opacity:.5">/mese</span>';
}

function prefillForm() {
  setTimeout(function() {
    const textarea = document.querySelector('#contatti textarea[name="messaggio"]') || document.querySelector('textarea[name="messaggio"]');
    if (!textarea) return;

    const keys = Object.keys(S);
    if (keys.length === 0) return;

    let lines = ['Ciao, sono interessato ai seguenti servizi:\n'];

    keys.forEach(k => {
      const item = S[k];
      if (item.once > 0) lines.push('• ' + item.lbl + ' — CHF ' + item.once.toLocaleString('de-CH') + ' (una tantum)');
      if (item.monthly > 0) lines.push('• ' + item.lbl + ' — CHF ' + item.monthly.toLocaleString('de-CH') + '/mese');
    });

    let tOnce = Object.values(S).reduce((a, b) => a + (b.once || 0), 0);
    let tMonthly = Object.values(S).reduce((a, b) => a + (b.monthly || 0), 0);

    if (tOnce > 0) lines.push('\nInvestimento iniziale: CHF ' + tOnce.toLocaleString('de-CH'));
    if (tMonthly > 0) lines.push('Canone mensile: CHF ' + tMonthly.toLocaleString('de-CH') + '/mese');

    lines.push('\nPotete contattarmi per discuterne.');

    textarea.value = lines.join('\n');
  }, 300);
}
