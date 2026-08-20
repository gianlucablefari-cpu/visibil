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

  const { user_id, oggetto, corpo } = payload;
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
  let subjectFinale = (oggetto && oggetto.trim())
    ? oggetto.trim()
    : `Benvenuto/a nella tua Area Clienti VISIBIL`;
  let corpoTesto = (corpo && corpo.trim())
    ? corpo.trim()
    : `Ciao ${nome}!\nIl tuo accesso all'Area Clienti VISIBIL è pronto.\n\n🔗 vsbl.ch/area-cliente.html\n📧 Email: ${email}\n\nSe non ricordi la password, usa "Password dimenticata" nella pagina di accesso.\n\nA presto,\nGianluca di VISIBIL\n\nPer qualsiasi dubbio, scrivimi o chiamami: +41 79 644 56 83`;

  try {
    const corpoHtml = corpoTesto
      .split("\n")
      .map(riga => riga.trim() === "" ? "<br>" : `<p style="margin:0 0 0.8em;">${riga}</p>`)
      .join("");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "VISIBIL <benvenuto@vsbl.ch>",
        to: [email],
        subject: subjectFinale,
        html: `<div style="font-family: sans-serif; color:#0F0F0F; line-height:1.6;">${corpoHtml}</div>`
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

  // 5. Traccia l'invio nello storico comunicazioni
  let logOk = true;
  let logError = null;
  try {
    const logRes = await fetch(`${SUPABASE_URL}/rest/v1/messaggi`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        user_id,
        tipo: "benvenuto",
        oggetto: subjectFinale,
        contenuto: corpoTesto
      })
    });
    logOk = logRes.ok;
    if (!logOk) logError = await logRes.text().catch(() => "");
  } catch (e) {
    logOk = false;
    logError = e.message;
  }

  return new Response(
    JSON.stringify({ success: true, email_inviata: emailInviata, log_ok: logOk, log_error: logError }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/invia-benvenuto"
};
