// Funzione server-side: crea un utente Supabase Auth + riga base in "clienti".
// La service_role key vive SOLO qui (variabile d'ambiente Netlify), mai nel frontend.

import { markdownLeggero } from "./_lib/formato.mjs";

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

  // 1. Verifica che chi chiama sia davvero il titolare (token della sessione admin.html)
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

  // 2. Legge i dati inviati dal form
  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo richiesta non valido." }), { status: 400 });
  }

  const { nome, email, password, invia_email, oggetto, corpo } = payload;
  if (!nome || !email || !password) {
    return new Response(JSON.stringify({ error: "Nome, email e password sono obbligatori." }), { status: 400 });
  }

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta (service key mancante)." }), { status: 500 });
  }

  // 3. Crea l'utente Auth
  const createUserRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password, email_confirm: true })
  });

  const userData = await createUserRes.json();
  if (!createUserRes.ok) {
    return new Response(JSON.stringify({ error: userData.msg || userData.message || "Errore nella creazione utente." }), { status: 400 });
  }

  const newUserId = userData.id;

  // 4. Crea la riga cliente di base (con messaggio di benvenuto già pronto)
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/clienti`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      user_id: newUserId,
      nome,
      email_accesso: email,
      email_contatto: email,
      prossimo_passo: `Benvenuto ${nome}! Stiamo preparando la proposta per il tuo progetto. Nel frattempo dai un'occhiata all'Area Clienti e, se non l'hai ancora fatto, riempi i Dati personali e salva.`
    })
  });

  if (!insertRes.ok) {
    const errData = await insertRes.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ error: "Utente creato ma errore nel salvataggio cliente: " + JSON.stringify(errData) }),
      { status: 500 }
    );
  }

  // 5. Invia email di benvenuto personalizzata (Resend) — solo se richiesto esplicitamente
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  let emailInviata = false;
  const subjectFinale = (oggetto && oggetto.trim())
    ? oggetto.trim()
    : `Benvenuto/a nella tua Area Clienti VISIBIL`;
  const corpoTesto = (corpo && corpo.trim())
    ? corpo.trim()
    : `Ciao ${nome}!\nIl tuo accesso all'Area Clienti VISIBIL è pronto.\n\n🔗 vsbl.ch/area-cliente.html\n📧 Email: ${email}\n🔑 Password provvisoria: ${password}\n\nTi consigliamo di cambiarla al primo accesso, dalla sezione "Dati personali".\n\nA presto,\nGianluca di VISIBIL\n\nPer qualsiasi dubbio, scrivimi o chiamami: +41 79 644 56 83`;
  let emailHtmlFinale = '';
  let resendId = null;

  if (invia_email && RESEND_API_KEY) {
    try {
      const corpoHtml = corpoTesto
        .split("\n")
        .map(riga => riga.trim() === "" ? "<br>" : `<p style="margin:0 0 0.8em;">${markdownLeggero(riga)}</p>`)
        .join("");
      emailHtmlFinale = `<div style="font-family: sans-serif; color:#0F0F0F; line-height:1.6;">${corpoHtml}</div>`;

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
          html: emailHtmlFinale
        })
      });
      emailInviata = emailRes.ok;
      if (emailRes.ok) {
        const emailData = await emailRes.json().catch(() => ({}));
        resendId = emailData.id || null;
      }
    } catch (e) {
      emailInviata = false;
    }
  }

  // 6. Se la mail è stata inviata, traccia lo storico comunicazioni
  let logOk = null;
  let logError = null;
  if (emailInviata) {
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
          user_id: newUserId,
          tipo: "benvenuto",
          oggetto: subjectFinale,
          contenuto: emailHtmlFinale,
          resend_id: resendId,
          stato_consegna: "inviata"
        })
      });
      logOk = logRes.ok;
      if (!logOk) logError = await logRes.text().catch(() => "");
    } catch (e) {
      logOk = false;
      logError = e.message;
    }
  }

  return new Response(
    JSON.stringify({ success: true, user_id: newUserId, email_inviata: emailInviata, log_ok: logOk, log_error: logError }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/crea-cliente"
};
