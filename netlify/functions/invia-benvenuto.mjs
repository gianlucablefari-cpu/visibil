// Funzione server-side: invia (o re-invia) la mail di benvenuto a un cliente già esistente.
// Richiamata dal bottone "Invia mail di benvenuto" nella scheda cliente di admin.html.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

  // 1. Verifica che chi chiama sia davvero il titolare
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

  // 2. Legge i dati inviati (user_id del cliente)
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

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta (service key mancante)." }), { status: 500 });
  }

  // 3. Recupera i dati del cliente
  const clienteRes = await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${user_id}&select=nome,email_accesso`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }
  });
  const clienteRows = await clienteRes.json();
  if (!clienteRes.ok || !clienteRows.length) {
    return new Response(JSON.stringify({ error: "Cliente non trovato." }), { status: 404 });
  }
  const { nome, email_accesso: email } = clienteRows[0];

  // 4. Invia email di benvenuto (Resend)
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta (Resend key mancante)." }), { status: 500 });
  }

  let emailInviata = false;
  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "VISIBIL <benvenuto@vsbl.ch>",
        to: [email],
        subject: `Benvenuto/a nella tua Area Clienti VISIBIL`,
        html: `
          <div style="font-family: sans-serif; color:#0F0F0F; line-height:1.6;">
            <p>Ciao ${nome}!</p>
            <p>Il tuo accesso all'Area Clienti VISIBIL è pronto.</p>
            <p>
              🔗 <a href="https://vsbl.ch/area-cliente.html">vsbl.ch/area-cliente.html</a><br>
              📧 Email: ${email}
            </p>
            <p>Se non ricordi la password, usa "Password dimenticata" nella pagina di accesso.</p>
            <p>A presto,<br>Gianluca di VISIBIL</p>
            <p style="color:#8A8A8A; font-size:0.9em;">Per qualsiasi dubbio, scrivimi o chiamami: +41 79 644 56 83</p>
          </div>
        `
      })
    });
    emailInviata = emailRes.ok;
    if (!emailRes.ok) {
      const errData = await emailRes.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: "Errore invio Resend: " + JSON.stringify(errData) }), { status: 500 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "Errore invio email: " + e.message }), { status: 500 });
  }

  // 5. Traccia stato e data su Supabase
  await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${user_id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email_benvenuto_inviata: true,
      email_benvenuto_data: new Date().toISOString()
    })
  }).catch(() => {});

  return new Response(
    JSON.stringify({ success: true, email_inviata: emailInviata }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/invia-benvenuto"
};
