// Funzione server-side: elimina un cliente (utente Auth + tutte le righe collegate).

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

  // 1. Verifica che chi chiama sia il titolare
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return new Response(JSON.stringify({ error: "Token mancante" }), { status: 401 });
  }

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!verifyRes.ok) {
    return new Response(JSON.stringify({ error: "Token non valido" }), { status: 401 });
  }
  const verifyData = await verifyRes.json();
  if (verifyData.id !== OWNER_ID) {
    return new Response(JSON.stringify({ error: "Non autorizzato" }), { status: 403 });
  }

  // 2. Legge il cliente da eliminare
  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo richiesta non valido." }), { status: 400 });
  }

  const { user_id } = payload;
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id obbligatorio." }), { status: 400 });
  }
  if (user_id === OWNER_ID) {
    return new Response(JSON.stringify({ error: "Non puoi eliminare l'account titolare." }), { status: 400 });
  }

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta (service key mancante)." }), { status: 500 });
  }

  const headers = {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json"
  };

  // 3. Elimina le righe collegate nelle tabelle figlie
  const tabelle = ["preventivi", "pagamenti", "documenti", "report"];
  for (const t of tabelle) {
    await fetch(`${SUPABASE_URL}/rest/v1/${t}?user_id=eq.${user_id}`, {
      method: "DELETE",
      headers
    });
  }

  // 4. Elimina la riga cliente
  const delClienteRes = await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${user_id}`, {
    method: "DELETE",
    headers
  });
  if (!delClienteRes.ok) {
    const errData = await delClienteRes.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ error: "Errore nell'eliminazione del cliente: " + JSON.stringify(errData) }),
      { status: 500 }
    );
  }

  // 5. Elimina l'utente Auth
  const delUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
    method: "DELETE",
    headers
  });
  if (!delUserRes.ok) {
    const errData = await delUserRes.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ error: "Cliente eliminato dal database ma errore nell'eliminazione dell'account: " + JSON.stringify(errData) }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/elimina-cliente"
};
