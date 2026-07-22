// Funzione server-side: avvisa il cliente via email quando il suo "Da fare" viene aggiornato.
// Richiede l'autorizzazione del titolare (token della sessione admin.html).

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

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

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo richiesta non valido." }), { status: 400 });
  }

  const { email, nome, progetto, messaggio } = payload;
  if (!email || !messaggio) {
    return new Response(JSON.stringify({ error: "Email e messaggio sono obbligatori." }), { status: 400 });
  }

  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione email mancante." }), { status: 500 });
  }

  const contestoRiga = progetto
    ? `<p style="color:#8A8A8A; font-size:0.85em; margin:0 0 1.25em;">Progetto: ${progetto}</p>`
    : '';

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
        subject: nome ? `${nome}, c'è un aggiornamento sul tuo progetto` : "Aggiornamento sul tuo progetto — VISIBIL",
        html: `
          <div style="font-family: 'Inter', Arial, sans-serif; color:#0F0F0F; line-height:1.6; max-width:480px; margin:0 auto;">
            <div style="font-weight:900; font-size:0.9em; letter-spacing:0.22em; text-transform:uppercase; margin-bottom:2em;">VISIBIL</div>

            <p style="margin:0 0 0.5em;">Ciao${nome ? ' ' + nome : ''},</p>
            <p style="margin:0 0 1.5em;">Ecco il prossimo passo per il tuo progetto:</p>
            ${contestoRiga}

            <div style="background:#F7F7F7; border-left:3px solid #1A1AE6; padding:1em 1.25em; margin:0 0 1.75em; font-size:0.95em;">
              ${messaggio}
            </div>

            <a href="https://vsbl.ch/area-cliente.html" style="display:inline-block; background:#0F0F0F; color:#FFFFFF; text-decoration:none; font-size:0.75em; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; padding:0.9em 1.75em; border-radius:5px; margin-bottom:2em;">Vai all'Area Clienti</a>

            <p style="margin:0 0 0.25em;">A presto,</p>
            <p style="margin:0 0 1.5em;">Gianluca — VISIBIL</p>
            <p style="color:#8A8A8A; font-size:0.85em; margin:0;">Domande? Scrivimi pure, o chiamami al +41 79 644 56 83.</p>
          </div>
        `
      })
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text().catch(() => "");
      return new Response(JSON.stringify({ error: "Errore invio email: " + errText }), { status: 500 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: "Errore di connessione al servizio email." }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/notifica-cliente"
};
