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

async function sb(path, serviceKey, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}: ${txt}`);
  }
  const txt = await res.text();
  return txt ? JSON.parse(txt) : null;
}

function descrizioneFattura(invoice) {
  const righe = (invoice.lines && invoice.lines.data) || [];
  const prima = righe[0];
  let testo = prima && prima.description ? prima.description : "Pagamento Stripe";
  // "1 × Completo (at CHF 39.00 / month)" → "Completo (at CHF 39.00 / month)"
  testo = testo.replace(/^\d+\s*×\s*/, "");
  const periodo = prima && prima.period && prima.period.start
    ? new Date(prima.period.start * 1000).toLocaleDateString("it-CH", { month: "long", year: "numeric", timeZone: "Europe/Zurich" })
    : null;
  return periodo ? `Stripe – ${testo} – ${periodo}` : `Stripe – ${testo}`;
}

async function importaFattura(invoice, serviceKey) {
  const importo = (invoice.amount_paid || 0) / 100;
  if (!invoice.id || importo <= 0) return;

  // Già importata? (Stripe può inviare lo stesso evento più volte)
  const enc = encodeURIComponent(invoice.id);
  const giaPagamenti = await sb(`pagamenti?select=id&stripe_invoice_id=eq.${enc}`, serviceKey);
  if (giaPagamenti && giaPagamenti.length) return;
  const giaInAttesa = await sb(`pagamenti_stripe_da_abbinare?select=id&stripe_invoice_id=eq.${enc}`, serviceKey);
  if (giaInAttesa && giaInAttesa.length) return;

  const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer && invoice.customer.id) || null;
  const subscriptionId =
    (typeof invoice.subscription === "string" ? invoice.subscription : null) ||
    (invoice.parent && invoice.parent.subscription_details && invoice.parent.subscription_details.subscription) ||
    null;
  const email = (invoice.customer_email || "").trim().toLowerCase();
  const paidAt = invoice.status_transitions && invoice.status_transitions.paid_at
    ? invoice.status_transitions.paid_at
    : invoice.created;
  const data = new Date(paidAt * 1000).toISOString().slice(0, 10);
  const descrizione = descrizioneFattura(invoice);

  // 1) Cliente già collegato a questo customer Stripe
  let cliente = null;
  if (customerId) {
    const r = await sb(`clienti?select=id,user_id,stripe_customer_id&stripe_customer_id=eq.${encodeURIComponent(customerId)}`, serviceKey);
    if (r && r.length === 1) cliente = r[0];
  }
  // 2) Altrimenti per email (contatto o accesso)
  if (!cliente && email) {
    const e = encodeURIComponent(email);
    const r = await sb(`clienti?select=id,user_id,stripe_customer_id&or=(email_contatto.ilike.${e},email_accesso.ilike.${e})`, serviceKey);
    if (r && r.length === 1) cliente = r[0];
  }

  if (cliente) {
    await sb("pagamenti", serviceKey, {
      method: "POST",
      body: JSON.stringify({
        user_id: cliente.user_id,
        descrizione,
        importo,
        voci: [{ descrizione, importo }],
        stato: "Pagato",
        data,
        stripe_invoice_id: invoice.id
      })
    });
    const aggiorna = { abbonamento_stato: subscriptionId ? "stripe" : undefined };
    if (customerId && !cliente.stripe_customer_id) aggiorna.stripe_customer_id = customerId;
    if (subscriptionId) aggiorna.stripe_subscription_id = subscriptionId;
    if (Object.values(aggiorna).some((v) => v !== undefined)) {
      await sb(`clienti?id=eq.${cliente.id}`, serviceKey, { method: "PATCH", body: JSON.stringify(aggiorna) });
    }
    return;
  }

  // 3) Non riconosciuto → da abbinare a mano nell'admin
  await sb("pagamenti_stripe_da_abbinare", serviceKey, {
    method: "POST",
    body: JSON.stringify({
      stripe_invoice_id: invoice.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      email: email || null,
      nome: invoice.customer_name || null,
      descrizione,
      importo,
      data
    })
  });
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

  // Fattura pagata su Stripe (abbonamenti, rinnovi, fatture manuali):
  // la importa in "pagamenti" sotto il cliente giusto, oppure la mette
  // tra i "pagamenti da abbinare" se il cliente non viene riconosciuto.
  if (event.type === "invoice.paid") {
    try {
      await importaFattura(event.data.object, SERVICE_KEY);
    } catch (e) {
      console.error("Errore importazione fattura:", e);
      // 500 → Stripe ritenta più tardi
      return new Response("Errore importazione.", { status: 500 });
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
