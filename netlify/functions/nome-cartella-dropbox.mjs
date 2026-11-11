// Funzione server-side: dato un link condiviso Dropbox, restituisce il nome della cartella.
// Richiede l'autorizzazione del titolare.

const SUPABASE_URL = "https://zmdnuplqgpznryxfooez.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_WcYUr4o4yMN5nGBmPxW59A__100gU9L";
const OWNER_ID = "45d74677-8f95-4d75-86a0-c7d9c586d68a";

async function getAccessToken() {
  const body = new URLSearchParams();
  body.append("grant_type", "refresh_token");
  body.append("refresh_token", Netlify.env.get("DROPBOX_REFRESH_TOKEN"));
  body.append("client_id", Netlify.env.get("DROPBOX_APP_KEY"));
  body.append("client_secret", Netlify.env.get("DROPBOX_APP_SECRET"));
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Errore refresh token Dropbox");
  return data.access_token;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Metodo non consentito" }, 405);

  const token = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
  if (!token) return json({ error: "Token mancante" }, 401);
  const verifyRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!verifyRes.ok) return json({ error: "Token non valido" }, 401);
  const user = await verifyRes.json();
  if (user.id !== OWNER_ID) return json({ error: "Non autorizzato" }, 403);

  let payload;
  try { payload = await req.json(); } catch (e) { return json({ error: "Corpo richiesta non valido." }, 400); }
  const url = String(payload.url || "").trim();
  if (!/^https:\/\/(www\.)?dropbox\.com\//i.test(url)) return json({ error: "Non è un link Dropbox." }, 400);

  try {
    const accessToken = await getAccessToken();
    const r = await fetch("https://api.dropboxapi.com/2/sharing/get_shared_link_metadata", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    const data = await r.json();
    if (!r.ok) return json({ error: "Dropbox: " + (data.error_summary || "errore") }, 502);
    return json({ nome: data.name || null });
  } catch (e) {
    return json({ error: "Errore: " + e.message }, 500);
  }
};

export const config = {
  path: "/api/nome-cartella-dropbox"
};
