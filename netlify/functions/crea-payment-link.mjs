// Funzione server-side: genera un Payment Link Stripe su misura per un pagamento,
// con il riferimento invisibile (client_reference_id) gia' incluso per il webhook.
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

  const { descrizione, importo, pagamento_id } = payload;
  if (!descrizione || !importo || !pagamento_id) {
    return new Response(JSON.stringify({ error: "Descrizione, importo e pagamento_id sono obbligatori." }), { status: 400 });
  }

  const STRIPE_SECRET_KEY = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY non configurata su Netlify." }), { status: 500 });
  }

  const unitAmount = Math.round(Number(importo) * 100);

  const body = new URLSearchParams();
  body.append("line_items[0][price_data][currency]", "chf");
  body.append("line_items[0][price_data][product_data][name]", descrizione);
  body.append("line_items[0][price_data][unit_amount]", String(unitAmount));
  body.append("line_items[0][quantity]", "1");

  try {
    const stripeRes = await fetch("https://api.stripe.com/v1/payment_links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });

    const stripeData = await stripeRes.json();
    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: "Errore Stripe: " + (stripeData.error?.message || "sconosciuto") }), { status: 500 });
    }

    const linkConRiferimento = `${stripeData.url}?client_reference_id=${pagamento_id}`;

    return new Response(JSON.stringify({ url: linkConRiferimento }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Errore di connessione a Stripe." }), { status: 500 });
  }
};

export const config = {
  path: "/api/crea-payment-link"
};
