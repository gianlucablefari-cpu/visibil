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
    `${SUPABASE_URL}/rest/v1/pagamenti?id=eq.${id}&select=id,descrizione,importo,stato,data,user_id,voci,payment_link`,
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
      cliente_email: clienteData.email_contatto || ""
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/get-pagamento"
};
