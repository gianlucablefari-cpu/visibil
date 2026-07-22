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

  const { email, oggetto, incipit, messaggioVisibil, messaggioCliente, saluti } = payload;
  if (!email) {
    return new Response(JSON.stringify({ error: "Email obbligatoria." }), { status: 400 });
  }

  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione email mancante." }), { status: 500 });
  }

  const boxVisibil = messaggioVisibil
    ? `<div style="background:#F5F6FF; border-left:3px solid #1A1AE6; padding:1em 1.25em; margin:0 0 1em;">
        <div style="font-size:0.7em; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#1A1AE6; margin-bottom:0.4em;">Da VISIBIL</div>
        <div style="font-size:0.95em; white-space:pre-line;">${messaggioVisibil}</div>
      </div>`
    : '';

  const boxCliente = messaggioCliente
    ? `<div style="background:#FFF4DE; border-left:3px solid #7A4E00; padding:1em 1.25em; margin:0 0 1.75em;">
        <div style="font-size:0.7em; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#7A4E00; margin-bottom:0.4em;">Dal cliente</div>
        <div style="font-size:0.95em; white-space:pre-line;">${messaggioCliente}</div>
      </div>`
    : '';

  const incipitHtml = incipit ? `<p style="margin:0 0 1.5em; white-space:pre-line;">${incipit}</p>` : '';
  const salutiHtml = saluti ? `<p style="margin:1.5em 0 0; white-space:pre-line;">${saluti}</p>` : '';

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
        subject: oggetto || "Aggiornamento sul tuo progetto — VISIBIL",
        html: `
          <div style="font-family: 'Inter', Arial, sans-serif; color:#0F0F0F; line-height:1.6; max-width:480px; margin:0 auto;">
            <div style="font-weight:900; font-size:0.9em; letter-spacing:0.22em; text-transform:uppercase; margin-bottom:2em;">VISIBIL</div>

            ${incipitHtml}
            ${boxVisibil}
            ${boxCliente}

            <a href="https://vsbl.ch/area-cliente.html" style="display:inline-block; background:#0F0F0F; color:#FFFFFF; text-decoration:none; font-size:0.75em; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; padding:0.9em 1.75em; border-radius:5px; margin-bottom:1em;">Vai all'Area Clienti</a>

            ${salutiHtml}
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
