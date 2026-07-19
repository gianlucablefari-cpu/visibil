// Funzione server-side: riceve le notifiche di pagamento da Stripe e aggiorna
// automaticamente lo stato del pagamento corrispondente su Supabase.
// La service_role key e il segreto webhook vivono SOLO qui (variabili d'ambiente Netlify).

import crypto from "node:crypto";

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";

function verificaFirmaStripe(payload, sigHeader, secret) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => {
      const [k, v] = p.split("=");
      return [k, v];
    })
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Metodo non consentito", { status: 405 });
  }

  const WEBHOOK_SECRET = Netlify.env.get("STRIPE_WEBHOOK_SECRET");
  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!WEBHOOK_SECRET || !SERVICE_KEY) {
    return new Response("Configurazione server incompleta.", { status: 500 });
  }

  const rawBody = await req.text();
  const sigHeader = req.headers.get("stripe-signature");

  let firmaValida = false;
  try {
    firmaValida = verificaFirmaStripe(rawBody, sigHeader, WEBHOOK_SECRET);
  } catch (e) {
    firmaValida = false;
  }

  if (!firmaValida) {
    return new Response("Firma non valida.", { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (e) {
    return new Response("Payload non valido.", { status: 400 });
  }

  // Evento principale: un Payment Link/Checkout è stato pagato con successo
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const pagamentoId = session.client_reference_id;

    if (pagamentoId) {
      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/pagamenti?id=eq.${pagamentoId}`,
        {
          method: "PATCH",
          headers: {
            apikey: SERVICE_KEY,
            Authorization: `Bearer ${SERVICE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },
          body: JSON.stringify({ stato: "Pagato" })
        }
      );

      if (!updateRes.ok) {
        const errText = await updateRes.text().catch(() => "");
        console.error("Errore aggiornamento pagamento:", errText);
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/stripe-webhook"
};
