// Funzione server-side: crea un utente Supabase Auth + riga base in "clienti".
// La service_role key vive SOLO qui (variabile d'ambiente Netlify), mai nel frontend.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Metodo non consentito" }) };
  }

  // 1. Verifica che chi chiama sia davvero il titolare (token della sessione admin.html)
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: "Token mancante" }) };
  }

  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!verifyRes.ok) {
    return { statusCode: 401, body: JSON.stringify({ error: "Token non valido" }) };
  }
  const verifyData = await verifyRes.json();
  if (verifyData.id !== OWNER_ID) {
    return { statusCode: 403, body: JSON.stringify({ error: "Non autorizzato" }) };
  }

  // 2. Legge i dati inviati dal form
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Corpo richiesta non valido." }) };
  }

  const { nome, email, password } = payload;
  if (!nome || !email || !password) {
    return { statusCode: 400, body: JSON.stringify({ error: "Nome, email e password sono obbligatori." }) };
  }

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: "Configurazione server incompleta (service key mancante)." }) };
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
    return { statusCode: 400, body: JSON.stringify({ error: userData.msg || userData.message || "Errore nella creazione utente." }) };
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
      prossimo_passo: "Benvenuto! Stiamo preparando la proposta per il tuo progetto."
    })
  });

  if (!insertRes.ok) {
    const errData = await insertRes.json().catch(() => ({}));
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Utente creato ma errore nel salvataggio cliente: " + JSON.stringify(errData) })
    };
  }

  // 5. Invia email di benvenuto personalizzata (Resend)
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  let emailInviata = false;
  if (RESEND_API_KEY) {
    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "VISIBIL <onboarding@resend.dev>",
          to: [email],
          subject: `Benvenuto/a nella tua Area Clienti VISIBIL`,
          html: `
            <div style="font-family: sans-serif; color:#0F0F0F; line-height:1.6;">
              <p>Ciao ${nome},</p>
              <p>Il tuo accesso all'Area Clienti VISIBIL è pronto.</p>
              <p>
                🔗 <a href="https://vsbl.ch/area-cliente.html">vsbl.ch/area-cliente.html</a><br>
                📧 Email: ${email}<br>
                🔑 Password provvisoria: ${password}
              </p>
              <p>Ti consigliamo di cambiarla al primo accesso, dalla sezione "Dati personali".</p>
              <p>A presto,<br>VISIBIL</p>
            </div>
          `
        })
      });
      emailInviata = emailRes.ok;
    } catch (e) {
      emailInviata = false;
    }
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ success: true, user_id: newUserId, email_inviata: emailInviata })
  };
};
// redeploy: attiva variabili d'ambiente SUPABASE_SERVICE_ROLE_KEY / RESEND_API_KEY
