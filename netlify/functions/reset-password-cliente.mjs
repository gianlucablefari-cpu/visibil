// Funzione server-side: reimposta la password di accesso di un cliente.
// La service_role key vive SOLO qui, mai nel frontend.

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

  const { user_id, nuova_password } = payload;
  if (!user_id || !nuova_password) {
    return new Response(JSON.stringify({ error: "user_id e nuova_password sono obbligatori." }), { status: 400 });
  }
  if (nuova_password.length < 6) {
    return new Response(JSON.stringify({ error: "La password deve avere almeno 6 caratteri." }), { status: 400 });
  }

  const SERVICE_KEY = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SERVICE_KEY) {
    return new Response(JSON.stringify({ error: "Configurazione server incompleta (service key mancante)." }), { status: 500 });
  }

  const updateRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user_id}`, {
    method: "PUT",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ password: nuova_password })
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text().catch(() => "");
    return new Response(JSON.stringify({ error: "Errore Supabase: " + errText }), { status: 500 });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/api/reset-password-cliente"
};
