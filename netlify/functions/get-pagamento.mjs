// Funzione pubblica (nessun login richiesto): dato l'id di un pagamento,
// restituisce solo i dati necessari per mostrarlo nella pagina fattura.
// Usa la service_role key solo qui, mai esposta al browser.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response(JSON.stringify({ error: "ID mancante." }), { status: 400 });
  }

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta." }), { status: 500 });
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pagamenti?id=eq.${id}&select=id,descrizione,importo,stato,data,user_id,voci,payment_link,numero,pagato_il,progetto_id,created_at`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    }
  );

  const rows = await res.json();
  if (!res.ok || !rows || rows.length === 0) {
    return new Response(JSON.stringify({ error: "Pagamento non trovato." }), { status: 404 });
  }

  const pagamento = rows[0];

  const clienteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${pagamento.user_id}&select=nome,indirizzo,nome_fatturazione,email_contatto`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    }
  );
  const clienteRows = await clienteRes.json();
  const clienteData = (clienteRes.ok && clienteRows[0]) ? clienteRows[0] : {};

  const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  // Titolo del progetto collegato (se c'è)
  let progettoTitolo = "";
  if (pagamento.progetto_id) {
    const pr = await fetch(`${SUPABASE_URL}/rest/v1/progetti?id=eq.${pagamento.progetto_id}&select=titolo`, { headers: h });
    const prRows = pr.ok ? await pr.json() : [];
    progettoTitolo = (prRows[0] && prRows[0].titolo) || "";
  }
  // Dati di chi emette la fattura (impostazioni in admin). I dati bancari vengono inviati solo se l'IBAN è compilato.
  const impRes = await fetch(`${SUPABASE_URL}/rest/v1/impostazioni?id=eq.default&select=fatt_intestatario,fatt_via,fatt_numero_civico,fatt_cap,fatt_citta,fatt_iban,fatt_banca,fatt_email,fatt_telefono`, { headers: h });
  const imp = (impRes.ok && (await impRes.json())[0]) || {};
  const iban = (imp.fatt_iban || "").replace(/\s+/g, "").toUpperCase();
  const emittente = {
    nome: imp.fatt_intestatario || "Gianluca Blefari",
    via: imp.fatt_via || "", civico: imp.fatt_numero_civico || "", cap: imp.fatt_cap || "", citta: imp.fatt_citta || "",
    email: imp.fatt_email || "", telefono: imp.fatt_telefono || ""
  };
  const bonifico = iban ? { iban, banca: imp.fatt_banca || "" } : null;

  return new Response(
    JSON.stringify({
      id: pagamento.id,
      descrizione: pagamento.descrizione,
      importo: pagamento.importo,
      stato: pagamento.stato,
      data: pagamento.data,
      voci: pagamento.voci || [],
      payment_link: pagamento.payment_link || null,
      cliente_nome: clienteData.nome || "",
      cliente_indirizzo: clienteData.indirizzo || "",
      cliente_nome_fatturazione: clienteData.nome_fatturazione || "",
      cliente_email: clienteData.email_contatto || "",
      numero: pagamento.numero || null,
      pagato_il: pagamento.pagato_il || null,
      creato_il: pagamento.created_at || null,
      progetto: progettoTitolo,
      emittente,
      bonifico
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/get-pagamento"
};
