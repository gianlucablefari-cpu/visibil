// Funzione pubblica (nessun login richiesto): dato l'id di un preventivo,
// restituisce solo i dati necessari per mostrarlo nella pagina di approvazione.
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
    `${SUPABASE_URL}/rest/v1/preventivi?id=eq.${id}&select=id,titolo,importo,stato,data,user_id,approvato_data`,
    {
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`
      }
    }
  );

  const rows = await res.json();
  if (!res.ok || !rows || rows.length === 0) {
    return new Response(JSON.stringify({ error: "Preventivo non trovato." }), { status: 404 });
  }

  const preventivo = rows[0];

  // Recupera anche il nome del cliente (dalla tabella clienti)
  const clienteRes = await fetch(
    `${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${preventivo.user_id}&select=nome,indirizzo,nome_fatturazione,email_contatto`,
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
      id: preventivo.id,
      titolo: preventivo.titolo,
      importo: preventivo.importo,
      stato: preventivo.stato,
      data: preventivo.data,
      approvato_data: preventivo.approvato_data,
      cliente_nome: clienteData.nome || "",
      cliente_indirizzo: clienteData.indirizzo || "",
      cliente_nome_fatturazione: clienteData.nome_fatturazione || "",
      cliente_email: clienteData.email_contatto || ""
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/get-preventivo"
};
