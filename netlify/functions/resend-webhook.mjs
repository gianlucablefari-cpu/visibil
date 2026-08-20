// Riceve gli eventi webhook di Resend (delivered, opened, bounced, complained)
// e aggiorna lo stato_consegna del messaggio corrispondente in Supabase, cercandolo per resend_id.
// Configurazione richiesta su Resend: aggiungere https://vsbl.ch/api/resend-webhook come endpoint
// in Resend → Webhooks, selezionare gli eventi email.delivered/opened/bounced/complained,
// e copiare il "Signing Secret" nella variabile d'ambiente Netlify RESEND_WEBHOOK_SECRET.

import { createHmac, timingSafeEqual } from "node:crypto";

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";

const MAPPA_STATO = {
  "email.sent": "inviata",
  "email.delivered": "consegnata",
  "email.delivery_delayed": "in ritardo",
  "email.opened": "aperta",
  "email.clicked": "cliccata",
  "email.bounced": "rimbalzata",
  "email.complained": "segnalata come spam"
};

function verificaFirma(body, headers, secret) {
  const svixId = headers.get("svix-id");
  const svixTimestamp = headers.get("svix-timestamp");
  const svixSignature = headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const messaggioFirmato = `${svixId}.${svixTimestamp}.${body}`;
  const firmaAttesa = createHmac("sha256", secretBytes).update(messaggioFirmato).digest("base64");

  const firmeRicevute = svixSignature.split(" ").map(s => s.split(",")[1]).filter(Boolean);
  return firmeRicevute.some(f => {
    try {
      return timingSafeEqual(Buffer.from(f, "base64"), Buffer.from(firmaAttesa, "base64"));
    } catch (e) {
      return false;
    }
  });
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Metodo non consentito" }), { status: 405 });
  }

  const bodyTesto = await req.text();

  const WEBHOOK_SECRET = Netlify.env.get("RESEND_WEBHOOK_SECRET");
  if (WEBHOOK_SECRET) {
    const firmaValida = verificaFirma(bodyTesto, req.headers, WEBHOOK_SECRET);
    if (!firmaValida) {
      return new Response(JSON.stringify({ error: "Firma non valida." }), { status: 401 });
    }
  }
  // Se RESEND_WEBHOOK_SECRET non è ancora configurato, accetta comunque l'evento
  // (utile in fase di primo collegamento) ma senza verifica di autenticità.

  let payload;
  try {
    payload = JSON.parse(bodyTesto);
  } catch (e) {
    return new Response(JSON.stringify({ error: "Corpo non valido." }), { status: 400 });
  }

  const tipoEvento = payload.type;
  const resendId = payload.data && payload.data.email_id;
  const nuovoStato = MAPPA_STATO[tipoEvento];

  if (!resendId || !nuovoStato) {
    // Evento non rilevante per noi (es. altri tipi) — rispondi comunque 200 per evitare retry inutili
    return new Response(JSON.stringify({ success: true, ignorato: true }), { status: 200 });
  }

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta." }), { status: 500 });
  }

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/messaggi?resend_id=eq.${resendId}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({ stato_consegna: nuovoStato })
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Errore aggiornamento stato: " + e.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/resend-webhook"
};
