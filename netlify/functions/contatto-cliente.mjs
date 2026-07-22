// Funzione pubblica: un cliente loggato manda un messaggio a Gianluca.
// Usata da: form Contattami, richiesta disdetta, richiesta eliminazione account.
// Invia via Resend (dominio verificato vsbl.ch) invece di Web3Forms, per una consegna più affidabile.
// Registra anche il messaggio nella tabella "messaggi" per l'archivio in admin.html.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo richiesta non valido." }), { status: 400 });
  }

  const { user_id, from_name, from_email, subject, message } = payload;
  if (!message) {
    return new Response(JSON.stringify({ error: "Messaggio obbligatorio." }), { status: 400 });
  }

  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione email mancante." }), { status: 500 });
  }

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "VISIBIL <benvenuto@vsbl.ch>",
        to: ["gianluca.blefari@outlook.com"],
        reply_to: from_email || undefined,
        subject: subject || "Messaggio dall'Area Clienti",
        html: `
          <div style="font-family: 'Inter', Arial, sans-serif; color:#0F0F0F; line-height:1.6; max-width:480px; margin:0 auto;">
            <div style="font-weight:900; font-size:0.9em; letter-spacing:0.22em; text-transform:uppercase; margin-bottom:2em;">VISIBIL</div>
            <p style="margin:0 0 0.5em;"><strong>${from_name || 'Cliente'}</strong>${from_email ? ` (${from_email})` : ''}</p>
            <div style="background:#F7F7F7; border-left:3px solid #1A1AE6; padding:1em 1.25em; white-space:pre-line;">${message}</div>
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

  // Registra nell'archivio messaggi (non blocca la risposta se fallisce)
  if (user_id) {
    const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (SERVICE_KEY) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/messaggi`, {
          method: "POST",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({
            user_id,
            tipo: "contatto",
            oggetto: subject || "Messaggio dall'Area Clienti",
            contenuto: message
          })
        });
      } catch (e) {
        // non blocca l'invio se il log fallisce
      }
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/contatto-cliente"
};
