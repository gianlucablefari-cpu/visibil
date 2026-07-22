// Funzione server-side: crea un utente Supabase Auth + riga base in "clienti".
// La service_role key vive SOLO qui (variabile d'ambiente Netlify), mai nel frontend.

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

  const { nome, email, password } = payload;
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
      email_contatto: email,
      prossimo_passo: "Stiamo preparando la proposta per il tuo progetto.",
      da_fare_cliente: `Benvenuto ${nome}! Dai un'occhiata all'Area Clienti, e se non l'hai ancora fatto, riempi i Dati personali e salva.`
    })
  });

  if (!insertRes.ok) {
    const errData = await insertRes.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ error: "Utente creato ma errore nel salvataggio cliente: " + JSON.stringify(errData) }),
      { status: 500 }
    );
  }

  // 5. Invia email di benvenuto personalizzata (Resend)
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
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
          from: "VISIBIL <benvenuto@vsbl.ch>",
          to: [email],
          subject: `Benvenuto/a nella tua Area Clienti VISIBIL`,
          html: `
            <div style="font-family: sans-serif; color:#0F0F0F; line-height:1.6;">
              <p>Ciao ${nome}!</p>
              <p>Il tuo accesso all'Area Clienti VISIBIL è pronto.</p>
              <p>
                🔗 <a href="https://vsbl.ch/area-cliente.html">vsbl.ch/area-cliente.html</a><br>
                📧 Email: ${email}<br>
                🔑 Password provvisoria: ${password}
              </p>
              <p>Ti consigliamo di cambiarla al primo accesso, dalla sezione "Dati personali".</p>
              <p>A presto,<br>Gianluca di VISIBIL</p>
              <p style="color:#8A8A8A; font-size:0.9em;">Per qualsiasi dubbio, scrivimi o chiamami: +41 79 644 56 83</p>
            </div>
          `
        })
      });
      emailInviata = emailRes.ok;
    } catch (e) {
      emailInviata = false;
    }
  }

  return new Response(
    JSON.stringify({ success: true, user_id: newUserId, email_inviata: emailInviata }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

export const config = {
  path: "/api/crea-cliente"
};
