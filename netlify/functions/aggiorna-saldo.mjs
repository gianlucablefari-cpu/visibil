// Pulsante "Salda" dell'area cliente: prima di aprire la fattura del progetto, ci aggiunge
// le ore di lavoro registrate e non ancora fatturate (una riga per giorno, ore × tariffa),
// ricalcola il totale e rigenera il link di pagamento Stripe. Se non c'è una fattura aperta, la crea.
// Può chiamarla il cliente proprietario del progetto o Gianluca.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token mancante" }, 401);
  const vr = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
  if (!vr.ok) return json({ error: "Token non valido" }, 401);
  const utente = await vr.json();

  let body; try { body = await req.json(); } catch (e) { return json({ error: "Richiesta non valida" }, 400); }
  const pid = String(body.progetto_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(pid)) return json({ error: "Progetto non valido" }, 400);

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) return json({ error: "Configurazione server incompleta." }, 500);
  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };
  const get = async (p) => { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: h }); return r.ok ? r.json() : []; };

  const [progetto] = await get(`progetti?id=eq.${pid}&select=id,user_id,titolo,tariffa_oraria`);
  if (!progetto) return json({ error: "Progetto non trovato" }, 404);
  if (utente.id !== progetto.user_id && utente.id !== OWNER_ID) return json({ error: "Non autorizzato" }, 403);

  const aperte = await get(`pagamenti?progetto_id=eq.${pid}&stato=in.(In%20attesa,Scaduto)&select=id,descrizione,voci,importo,payment_link&order=created_at.desc&limit=1`);
  let fattura = aperte[0] || null;
  const sessioni = await get(`ore_lavoro?progetto_id=eq.${pid}&pagamento_id=is.null&escluso=eq.false&fine=not.is.null&select=id,inizio,minuti&order=inizio.asc`);
  const tariffa = Number(progetto.tariffa_oraria) || 0;
  if (!sessioni.length || !tariffa) return json({ id: fattura ? fattura.id : null, aggiornata: false });

  // Righe nuove: una per giorno (fuso svizzero)
  const perGiorno = {};
  for (const s of sessioni) {
    const g = new Date(s.inizio).toLocaleDateString("it-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" });
    (perGiorno[g] = perGiorno[g] || []).push(s);
  }
  // ore per giorno arrotondate per eccesso al quarto d'ora, poi sommate
  const oreNuove = Object.values(perGiorno).reduce((a, l) => a + Math.ceil(l.reduce((x, s) => x + s.minuti, 0) / 15) * 0.25, 0);
  const idsNuove = sessioni.map(s => s.id);

  // Fattura aperta del progetto, oppure una nuova
  if (!fattura) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pagamenti`, { method: "POST", headers: { ...h, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: progetto.user_id, progetto_id: pid, descrizione: `${progetto.titolo || "Progetto"} — ore di lavoro`, importo: 0, voci: [], stato: "In attesa", data: new Date().toISOString().slice(0, 10) }) });
    const righe = r.ok ? await r.json() : [];
    fattura = righe[0];
    if (!fattura) return json({ error: "Impossibile creare la fattura" }, 500);
  }
  // Le ore si aggiungono alla riga a ore già presente (stessa tariffa); altrimenti una riga unica per il progetto.
  // Il dettaglio giorno per giorno sta nell'allegato della fattura.
  const voci = (fattura.voci || []).map(v => ({ ...v }));
  const riga = voci.find(v => v.ore != null && Number(v.tariffa) === tariffa);
  if (riga) {
    riga.ore = Math.round((Number(riga.ore) + oreNuove) * 100) / 100;
    riga.importo = Math.round(riga.ore * tariffa * 100) / 100;
    riga.sessioni = (riga.sessioni || []).concat(idsNuove);
  } else {
    voci.push({ descrizione: `${progetto.titolo || "Lavoro"} — ore di lavoro`, ore: oreNuove, tariffa, importo: Math.round(oreNuove * tariffa * 100) / 100, sessioni: idsNuove });
  }
  // Data della fattura = oggi; se il titolo contiene una data (es. "… 13.11.2026") la aggiorna
  const oggi = new Date(), fmt = new Intl.DateTimeFormat("de-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" });
  const oggiIso = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(oggi);
  fattura.descrizione = String(fattura.descrizione || "").replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, fmt.format(oggi)) || fattura.descrizione;
  const totale = Math.round(voci.reduce((a, v) => a + (Number(v.importo) || 0), 0) * 100) / 100;

  // Nuovo link Stripe con il totale aggiornato; il vecchio (se trovato) viene disattivato
  let link = fattura.payment_link || null;
  const STRIPE = Netlify.env.get("STRIPE_SECRET_KEY");
  if (STRIPE && totale > 0) {
    const sh = { Authorization: `Bearer ${STRIPE}`, "Content-Type": "application/x-www-form-urlencoded" };
    const b = new URLSearchParams();
    b.append("line_items[0][price_data][currency]", "chf");
    b.append("line_items[0][price_data][product_data][name]", fattura.descrizione || "Pagamento VISIBIL");
    b.append("line_items[0][price_data][unit_amount]", String(Math.round(totale * 100)));
    b.append("line_items[0][quantity]", "1");
    const sr = await fetch("https://api.stripe.com/v1/payment_links", { method: "POST", headers: sh, body: b.toString() });
    const sd = await sr.json();
    if (!sr.ok) return json({ error: "Errore Stripe: " + (sd.error && sd.error.message || "sconosciuto") }, 500);
    if (link) {
      try {
        const vecchio = link.split("?")[0];
        const lr = await fetch("https://api.stripe.com/v1/payment_links?limit=100&active=true", { headers: sh });
        const ld = await lr.json();
        const trovato = (ld.data || []).find(x => x.url === vecchio);
        if (trovato) await fetch(`https://api.stripe.com/v1/payment_links/${trovato.id}`, { method: "POST", headers: sh, body: "active=false" });
      } catch (e) { /* non blocca */ }
    }
    link = `${sd.url}?client_reference_id=${fattura.id}`;
  }

  const up = await fetch(`${SUPABASE_URL}/rest/v1/pagamenti?id=eq.${fattura.id}`, { method: "PATCH", headers: h, body: JSON.stringify({ voci, importo: totale, payment_link: link, data: oggiIso, descrizione: fattura.descrizione }) });
  if (!up.ok) return json({ error: "Impossibile aggiornare la fattura" }, 500);
  await fetch(`${SUPABASE_URL}/rest/v1/ore_lavoro?id=in.(${sessioni.map(s => s.id).join(",")})`, { method: "PATCH", headers: h, body: JSON.stringify({ pagamento_id: fattura.id }) });

  return json({ id: fattura.id, aggiornata: true, totale });
};

export const config = { path: "/api/aggiorna-saldo" };
