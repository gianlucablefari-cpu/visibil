// Funzione server-side: elimina un file da Dropbox dato il suo path.
// Richiede l'autorizzazione del titolare.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

async function getAccessToken() {
  const APP_KEY = Netlify.env.get("DROPBOX_APP_KEY");
  const APP_SECRET = Netlify.env.get("DROPBOX_APP_SECRET");
  const REFRESH_TOKEN = Netlify.env.get("DROPBOX_REFRESH_TOKEN");

  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", REFRESH_TOKEN);
  body.append("client_id", APP_KEY);
  body.append("client_secret", APP_SECRET);

  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Errore refresh token Dropbox: " + JSON.stringify(data));
  return data.access_token;
}

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

  const { dropboxPath } = payload;
  if (!dropboxPath) {
    return new Response(JSON.stringify({ error: "dropboxPath obbligatorio." }), { status: 400 });
  }

  try {
    const accessToken = await getAccessToken();

    const delRes = await fetch("https://api.dropboxapi.com/2/files/delete_v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: dropboxPath })
    });

    const delData = await delRes.json();
    if (!delRes.ok) {
      // se il file non esiste piu' su Dropbox, non e' un vero errore per l'utente
      if (delData.error_summary && delData.error_summary.includes('path_lookup/not_found')) {
        return new Response(JSON.stringify({ success: true, note: "Il file non era più presente su Dropbox." }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "Errore eliminazione Dropbox: " + JSON.stringify(delData) }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Errore: " + e.message }), { status: 500 });
  }
};

export const config = {
  path: "/api/elimina-file-dropbox"
};
