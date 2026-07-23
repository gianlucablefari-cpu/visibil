// Funzione pubblica (nessun login richiesto): il cliente approva un preventivo
// compilando nome, indirizzo, email dalla pagina preventivo.html.
// Aggiorna Supabase e avvisa Gianluca via email (Resend).

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

  const { id, nome, indirizzo, email, piano_scelto } = payload;
  if (!id || !nome || !email) {
    return new Response(JSON.stringify({ error: "Nome ed email sono obbligatori." }), { status: 400 });
  }

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta." }), { status: 500 });
  }

  // Legge il preventivo per sapere titolo/importo/cliente (per l'email di notifica)
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/preventivi?id=eq.${id}&select=titolo,importo,stato,user_id,richiedi_scelta_piano`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  const rows = await getRes.json();
  if (!getRes.ok || !rows || rows.length === 0) {
    return new Response(JSON.stringify({ error: "Preventivo non trovato." }), { status: 404 });
  }
  const preventivo = rows[0];

  if (preventivo.richiedi_scelta_piano && !piano_scelto) {
    return new Response(JSON.stringify({ error: "Devi scegliere un piano abbonamento." }), { status: 400 });
  }

  if (preventivo.stato === "Accettato") {
    return new Response(JSON.stringify({ error: "Questo preventivo è già stato approvato." }), { status: 409 });
  }

  // Aggiorna lo stato del preventivo
  const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/preventivi?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      stato: "Accettato",
      approvato_nome: nome,
      approvato_indirizzo: indirizzo || null,
      approvato_email: email,
      approvato_data: new Date().toISOString(),
      piano_scelto: piano_scelto || null
    })
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text().catch(() => "");
    return new Response(JSON.stringify({ error: "Errore nell'aggiornamento: " + errText }), { status: 500 });
  }

  // Se il cliente ha scelto un piano, lo salva anche nel suo profilo
  if (piano_scelto) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/clienti?user_id=eq.${preventivo.user_id}`, {
        method: "PATCH",
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({ rinnovo_piano: piano_scelto })
      });
    } catch (e) {
      // non blocca l'approvazione se questo fallisce
    }
  }

  // Notifica Gianluca via email
  const RESEND_API_KEY = Netlify.env.get("RESEND_API_KEY");
  if (RESEND_API_KEY) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: "VISIBIL <benvenuto@vsbl.ch>",
          to: ["gianluca.blefari@outlook.com"],
          subject: `Preventivo approvato: ${preventivo.titolo}`,
          html: `
            <div style="font-family: sans-serif; color:#0F0F0F; line-height:1.6;">
              <p>Il preventivo <strong>${preventivo.titolo}</strong>${preventivo.importo ? ` (CHF ${preventivo.importo}.–)` : ''} è stato approvato.</p>
              <p>
                Nome: ${nome}<br>
                Email: ${email}<br>
                ${indirizzo ? `Indirizzo: ${indirizzo}<br>` : ''}
                ${piano_scelto ? `Piano scelto: ${piano_scelto}<br>` : ''}
              </p>
            </div>
          `
        })
      });
    } catch (e) {
      // non blocca l'approvazione se l'email fallisce
    }
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/approva-preventivo"
};
